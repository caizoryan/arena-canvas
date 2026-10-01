import { state } from "../state.js";

// Cut a selection of blocks and groups, dim the originals, then paste them
// elsewhere on the canvas. Pasting adds the difference between the canvas
// transform captured at cut time and the current one, so the blocks land
// wherever the viewport has been panned to in the meantime.
//
// Paste is bound to cmd+shift+v so the built-in cmd+v link/URL paste is left
// untouched. The cut nodes stay in place until a paste succeeds, which keeps a
// failed paste from destroying them.
const MoveBlocks = {
	id: "move-blocks",
	name: "Move blocks",
	description:
		"Cut selected blocks and groups with cmd+x, pan the canvas, then paste with cmd+shift+v.",

	setup(controller) {
		// The staged cut: node geometry captured at cut time plus the canvas
		// transform at that moment. Only one cut exists at a time.
		let cut;

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

		const pasteSelection = () => {
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

			return true;
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
					id: "move-blocks-paste",
					label: "paste blocks",
					group: "clipboard",
					priority: 90,
					disabled: !cut,
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
		let unsubscribeSlug = state.currentSlug.subscribe(() => clearCut());

		let style = document.createElement("style");
		style.textContent = `
			.move-cut-dimmed {
				opacity: .35;
			}
		`;
		document.head.appendChild(style);

		return () => {
			clearCut();
			unsubscribeSlug();
			style.remove();
		};
	},
};

export default MoveBlocks;
