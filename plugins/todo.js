// Turn Markdown task-list markers into checkbox inputs.
//
// This plugin deliberately only handles the first, plain-text marker in a
// hyphen list item. The marker is removed from the rendered text and the
// metadata is consumed by md.js when it turns tokens into dom.js descriptions.
const taskMarker = /^\[([ xX])\](?:\s+|$)/;

const Todo = {
	id: "builtin-todo-items",
	name: "Todo items",
	description: "Turns - [ ] Markdown list items into checkboxable items.",

	setup(controller) {
		return controller.registerHook(
			"markdown:token",
			({ token, tokens, index, block, updateBlock }) => {
				if (token?.type != "list_item_open" || token.markup != "-") {
					return;
				}

				// A list item normally contains paragraph_open, inline, and
				// paragraph_close. Search until its matching close so this also
				// works when Markdown-it adds another block token in between.
				for (let i = index + 1; i < tokens.length; i++) {
					let candidate = tokens[i];
					// console.log("LIST ITEM", JSON.parse(JSON.stringify(candidate)))
					if (candidate.type == "list_item_close" && candidate.level == token.level) break;
					if (candidate.type != "inline" 
						// || candidate.level != token.level + 1
					) {
						continue;
					}

					console.log("MADE IT#???", JSON.parse(JSON.stringify(candidate)))
					let first = candidate.children?.[0];
					let match = first?.type == "text"
						? first.content.match(taskMarker)
						: undefined;
					if (!match) return;


					first.content = first.content.slice(match[0].length);
					candidate.todoCheckbox = {
						checked: match[1].toLowerCase() == "x",
						block,
						updateBlock,
						sourceRange: candidate.map ? [...candidate.map] :
							token.map ? [...token.map] : undefined,
					};

					console.log("Returingin block", block, candidate)
					return;
				}
			},
			{ priority: 0 },
		);
	},
};

export default Todo;

/*
 * The containing block and source range are carried on todoCheckbox so md.js
 * can replace only this task marker, send the new Markdown through the
 * controller's block-update action, and update the local block/store after
 * Are.na accepts the change.
 */
