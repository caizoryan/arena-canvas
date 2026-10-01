import { dom } from "../dom.js";

// Pin text blocks into a fixed side panel from the context menu. Only one block
// can be pinned at a time. The original canvas node stays in place but is dimmed
// so it reads as disabled.
const Pin = {
	id: "pin",
	name: "Pin",
	description:
		"Pin a text block into a fixed side panel from the context menu.",

	setup(controller) {
		const pins = new Map();

		const nodeFor = (id) =>
			document.querySelector(
				`.draggable.node[block-id="${CSS.escape(String(id))}"]`,
			);

		const dimNode = (element) => element?.classList.add("pin-dimmed");
		const undimNode = (element) => element?.classList.remove("pin-dimmed");

		const unpin = (id) => {
			const key = String(id);
			const entry = pins.get(key);
			if (!entry) return;

			entry.panel.remove();
			undimNode(nodeFor(key));
			pins.delete(key);
		};

		const pin = (id, element) => {
			const key = String(id);
			if (pins.has(key)) return;

			// Only a single pin at a time.
			[...pins.keys()].forEach(unpin);

			const block = controller.getChannelBlocks()
				.find((item) => String(item.id) == key);
			if (!block) return;

			const renderer = controller.getRenderer(block);
			const result = renderer ? renderer.render(block) : undefined;
			const {
				body = [".block", block.title || ""],
				topBar = [],
				bottomBar = [],
				attributes = {},
			} = result || {};

			let unpinBtn =  ["button.pinned-block-unpin", {
				type: "button",
				onclick: () => unpin(key),
			}, "unpin"]

			const panel = dom([
				".pinned-block",
				{ onwheel: (event) => event.stopPropagation() },
				[".pinned-block-top-bar", ...topBar, unpinBtn],
				[".pinned-block-content", { ...attributes }, body],
				[".pinned-block-bottom-bar", ...bottomBar],
			]);

			document.body.appendChild(panel);
			dimNode(element || nodeFor(key));
			pins.set(key, { panel });
		};

		controller.registerHook(
			"contextmenu:block",
			({ blockId, element, menu }) => {
				const block = controller.getChannelBlocks()
					.find((item) => String(item.id) == String(blockId));
				if (!block || block.type != "Text") return;

				const isPinned = pins.has(String(blockId));
				menu.add({
					id: "pin-block",
					label: isPinned ? "unpin" : "pin",
					group: "block",
					priority: 50,
					onSelect: () =>
						isPinned ? unpin(blockId) : pin(blockId, element),
				});
			},
		);

		// Canvas re-renders recreate the node elements. Re-dim pinned ones so the
		// disabled state survives a channel switch or background refresh.
		controller.registerHook("block:rendered", ({ block, element }) => {
			if (pins.has(String(block.id))) dimNode(element);
		});

		const style = document.createElement("style");
		style.textContent = `
			.pinned-block {
				position: fixed;
				top: 25px;
				right: 25px;
				width: 40vw;
				height: calc(100vh - 50px);
				z-index: 9999;
				display: flex;
				flex-direction: column;
				background: var(--background);
				border: var(--border-thickness) solid var(--color);
				box-shadow: 6px 6px 0 rgba(0, 0, 0, .13);
			}

			.pinned-block-header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: .5em;
				padding: .3em .5em;
				border-bottom: 1px solid var(--color);
			}

			.pinned-block-top-bar,
			.pinned-block-bottom-bar {
				display: flex;
				flex-wrap: wrap;
				gap: .3em;
				padding: .2em .5em;
			}

			.pinned-block-content {
				flex: 1;
				min-height: 0;
				overflow: auto;
			}

			.pin-dimmed {
				opacity: .3;
			}
		`;
		document.head.appendChild(style);

		return () => {
			[...pins.keys()].forEach(unpin);
			style.remove();
		};
	},
};

export default Pin;
