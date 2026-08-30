import { parse_arena_block_url } from "../md.js";

const JumpLink = {
	id: "builtin-jump-links",

	setup(controller) {
		return controller.registerHook(
			"markdown:link",
			({ children, attributes }) => {
				let blockId = parse_arena_block_url(attributes.href)?.id;
				if (!blockId) return;

				let linkAttributes = {
					...attributes,
					class: attributes.class
						? attributes.class + " jump"
						: "jump",
					onclick: (event) => {
						event.preventDefault();
						controller.focusBlock(blockId);
					},
				};

				return {
					handled: true,
					body: ["button", linkAttributes, ...children],
				};
			},
			{ priority: 0 },
		);
	},
};

export default JumpLink;
