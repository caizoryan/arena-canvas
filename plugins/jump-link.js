import { parse_arena_block_url } from "../md.js";

const JumpLink = {
	id: "builtin-jump-links",
	name: "Jump links",
	description: "Turns Are.na block links in Markdown into buttons that focus the matching block on the canvas.",

	setup(controller) {
		return controller.registerHook(
			"markdown:link",
			({ children, attributes }) => {
				let blockId = parse_arena_block_url(attributes.href)?.id;
				if (!blockId) return;

				return {
					handled: true,
					body: [ "button.jump", {
							...attributes,
							onclick: (event) => {
								event.preventDefault();
								controller.focusBlock(blockId);
							}},
						...children, ],
				};
			},
			{ priority: 0 })},
};

export default JumpLink;
