import { addNode, state } from "../state.js";
import { stateAdapter } from "../adapters/index.js";
import { BlockElement, constructBlockData } from "../block.js";
import { notificationpopup } from "../notification.js";
import {
	createCanvasClipboard,
	parseCanvasClipboard,
	translateCanvasClipboard,
} from "./canvas-clipboard.js";

// cmd+x stages a local move; cmd+shift+c copies a portable layout to the
// system clipboard. cmd+shift+v pastes the staged cut first, otherwise the
// clipboard layout. Plain cmd+c/cmd+v keep their existing link-only behavior.
const MoveBlocks = {
	id: "move-blocks",
	name: "Move blocks",
	description:
		"Copy blocks with layout using cmd+shift+c, then paste on any canvas with cmd+shift+v. Or cut locally with cmd+x.",

	setup(controller) {
		// The staged cut: node geometry captured at cut time plus the canvas
		// transform at that moment. Only one cut exists at a time.
		let cut;
		let pasteInProgress = false;
		let canvasRevision = 0;
		let disposed = false;

		const nodeFor = (id) =>
			document.querySelector(
				`.draggable.node[block-id="${CSS.escape(String(id))}"]`,
			) ||
			document.querySelector(
				`.draggable.group[node-id="${CSS.escape(String(id))}"]`,
			);

		const dimNode = (element) => element?.classList.add("move-cut-dimmed");
		const undimNode = (element) =>
			element?.classList.remove("move-cut-dimmed");

		const isCut = (id) =>
			cut != undefined &&
			cut.ids.some((cutId) => String(cutId) == String(id));

		const clearCut = () => {
			if (!cut) return;
			cut.ids.forEach((id) => undimNode(nodeFor(id)));
			cut = undefined;
		};

		// Selected nodes, falling back to a right-clicked node when nothing is
		// selected. Nodes that are no longer on the canvas are dropped.
		const snapshotsFor = (fallbackId) => {
			let ids = state.selected.value();
			if (!ids.length && fallbackId != undefined) ids = [fallbackId];

			return ids
				.map((id) => controller.getNode(id))
				.filter(Boolean)
				.map((node) => ({ id: node.id, x: node.x, y: node.y }));
		};

		const cutSelection = (fallbackId) => {
			let snapshots = snapshotsFor(fallbackId);
			if (!snapshots.length) return false;

			// Staging a new cut replaces the previous one.
			clearCut();

			let transform = controller.getCanvasTransform();
			cut = {
				ids: snapshots.map((snapshot) => snapshot.id),
				snapshots,
				transform: { x: transform.x, y: transform.y },
			};

			cut.ids.forEach((id) => dimNode(nodeFor(id)));
			return true;
		};

		const pasteCutSelection = () => {
			if (!cut) return false;

			let transform = controller.getCanvasTransform();
			let dx = transform.x - cut.transform.x;
			let dy = transform.y - cut.transform.y;

			let changes = cut.snapshots.map((snapshot) => ({
				id: snapshot.id,
				x: snapshot.x + dx,
				y: snapshot.y + dy,
			}));

			clearCut();

			if (changes.length) {
				controller.updateNodesGeometry(changes, {
					undoLabel: "Move cut blocks",
				});
			}

			// Refresh selection bounds after the geometry changes.
			state.selected.next([...state.selected.value()]);
			return true;
		};

		const copySelection = async (fallbackId) => {
			let previousCut = cut;
			try {
				let snapshots = snapshotsFor(fallbackId)
					.map(({ id }) => controller.getNode(id));
				let data = createCanvasClipboard(
					snapshots,
					state.currentSlug.value(),
					controller.getCanvasTransform(),
				);
				await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
				// A successful explicit copy supersedes an older staged cut.
				if (cut === previousCut) clearCut();
				if (!disposed) notificationpopup(`Copied ${data.nodes.length} blocks with layout`);
				return true;
			} catch (error) {
				if (!disposed) notificationpopup(`Could not copy blocks: ${error.message}`, true);
				return false;
			}
		};

		const pasteSelection = async () => {
			if (pasteInProgress || disposed) return false;
			if (cut) return pasteCutSelection();

			pasteInProgress = true;
			let canvas = state.currentSlug.value();
			let revision = canvasRevision;
			let transform = controller.getCanvasTransform();
			const isCurrent = () => !disposed && revision == canvasRevision &&
				state.currentSlug.value() == canvas;

			try {
				let text = await navigator.clipboard.readText();
				if (!isCurrent()) return false;
				let data = parseCanvasClipboard(text);
				if (!data) {
					notificationpopup("No block layout in clipboard. Copy with cmd+shift+c first.", true);
					return false;
				}

				let changes = [];
				let failures = 0;
				for (let snapshot of translateCanvasClipboard(data, transform)) {
					if (!isCurrent()) return false;
					try {
						let existing = controller.getNode(snapshot.id);
						if (!existing) {
							let channel = snapshot.connectableType == "Channel";
							let arenaId = channel ? snapshot.id.slice(1) : snapshot.id;
							let block = controller.getChannelBlocks().find((item) =>
								String(item.id) == arenaId && (item.type == "Channel") == channel
							);
							let alreadyConnected = Boolean(block);
							if (!block) block = channel ? await stateAdapter().get_channel(arenaId) : await stateAdapter().get_block(arenaId);
							if (!isCurrent()) return false;
							if (!block?.id || !block.type) throw new Error(`Block ${arenaId} unavailable`);
							if (!alreadyConnected) {
								await stateAdapter().connect_block(canvas, arenaId, snapshot.connectableType);
								if (!isCurrent()) return false;
								controller.setChannelBlocks([...controller.getChannelBlocks(), block]);
							}

							// A background render may have added it while the API was pending.
							existing = controller.getNode(snapshot.id);
							if (!existing) {
								// Match BlockElement's identity: API id for blocks, c+id for channels.
								let id = channel ? snapshot.id : block.id;
								addNode(constructBlockData({ ...block, id }, snapshot));
								controller.mountToCanvas(BlockElement(block));
								existing = controller.getNode(id);
							}
						}
						changes.push({
							id: existing?.id ?? snapshot.id,
							x: snapshot.x,
							y: snapshot.y,
							width: snapshot.width,
							height: snapshot.height,
						});
					} catch (error) {
						failures++;
						console.warn(`Could not paste block ${snapshot.id}`, error);
					}
				}

				if (!isCurrent()) return false;
				controller.updateNodesGeometry(changes, { undoLabel: "Paste block layout" });
				if (changes.length) {
					controller.markDirty();
					state.selected.next(changes.map(({ id }) => id));
				}
				notificationpopup(
					`Pasted ${changes.length} blocks${failures ? `; ${failures} failed. You can retry pasting.` : ""}`,
					failures > 0,
				);
				return changes.length > 0;
			} catch (error) {
				if (isCurrent()) notificationpopup(`Could not paste blocks: ${error.message}`, true);
				return false;
			} finally {
				pasteInProgress = false;
			}
		};

		const menuItems = (fallbackId) => {
			let canCut = state.selected.value().length > 0 ||
				fallbackId != undefined;

			return [
				{
					id: "move-blocks-cut",
					label: "cut blocks",
					group: "clipboard",
					priority: 100,
					disabled: !canCut,
					onSelect: () => cutSelection(fallbackId),
				},
				{
					id: "move-blocks-copy",
					label: "copy blocks with layout",
					group: "clipboard",
					priority: 95,
					disabled: !canCut,
					onSelect: () => copySelection(fallbackId),
				},
				{
					id: "move-blocks-paste",
					label: "paste blocks",
					group: "clipboard",
					priority: 90,
					disabled: pasteInProgress,
					onSelect: () => pasteSelection(),
				},
			];
		};

		controller.registerHook("contextmenu:block", ({ blockId, menu }) => {
			menu.add(menuItems(blockId));
		});

		controller.registerHook("contextmenu:canvas", ({ menu }) => {
			menu.add(menuItems());
		});

		let modifiers = { disable_in_input: true, preventDefault: true };

		controller.on("cmd + x", () => cutSelection(), modifiers);
		controller.on("ctrl + x", () => cutSelection(), modifiers);
		controller.on("cmd + shift + c", () => copySelection(), modifiers);
		controller.on("ctrl + shift + c", () => copySelection(), modifiers);
		controller.on("cmd + shift + v", () => pasteSelection(), modifiers);
		controller.on("ctrl + shift + v", () => pasteSelection(), modifiers);
		controller.on("escape", clearCut, {
			modifiers: false,
			disable_in_input: true,
		});

		// Canvas re-renders recreate the block elements. Re-dim cut blocks so the
		// staged state survives a background refresh.
		controller.registerHook("block:rendered", ({ block, element }) => {
			if (isCut(block.id)) dimNode(element);
		});

		// A pending cut does not survive leaving the channel.
		let unsubscribeSlug = state.currentSlug.subscribe(() => {
			canvasRevision++;
			clearCut();
		});

		let style = document.createElement("style");
		style.textContent = `
			.move-cut-dimmed {
				opacity: .35;
			}
		`;
		document.head.appendChild(style);

		return () => {
			disposed = true;
			clearCut();
			unsubscribeSlug();
			style.remove();
		};
	},
};

export default MoveBlocks;
