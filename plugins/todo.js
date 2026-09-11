import { notificationpopup } from "../notification.js";

// Match a task marker only when it is the first content in a list item.
const taskMarker = /^\[([ xX])\](?:\s+|$)/;

const updateTodoMarker = (markdown, sourceRange, checked) => {
	if (typeof markdown != "string" || !Array.isArray(sourceRange)) return;
	if (sourceRange.length < 2) return;

	let lines = markdown.split(/\r?\n/);
	let start = Math.max(0, Number(sourceRange[0]) || 0);
	let end = Math.min(lines.length, Number(sourceRange[1]) || start);
	let lineIndex = -1;

	for (let i = start; i < end; i++) {
		if (/^\s*-\s+\[[ xX]\](?=\s|$)/.test(lines[i])) {
			lineIndex = i;
			break;
		}
	}
	if (lineIndex == -1) return;

	let nextLines = [...lines];
	nextLines[lineIndex] = nextLines[lineIndex].replace(
		/^((?:\s*-\s+)\[)[ xX](\])(?=\s|$)/,
		`$1${checked ? "x" : " "}$2`,
	);

	return nextLines.join(markdown.includes("\r\n") ? "\r\n" : "\n");
};

const Todo = {
	id: "builtin-todo-items",
	name: "Todo items",
	description: "Turns - [ ] Markdown list items into checkboxable items.",

	setup(controller) {
		controller.registerHook(
			"markdown:token-render",
			({ token, children }) => {
				if (!token?.todoCheckbox) return;
				let todo = token.todoCheckbox;
				let checkboxAttributes = {
					type: "checkbox",
					"aria-label": "Todo item",
					onclick: async (event) => {
						event.preventDefault();
						event.stopPropagation();

						if (todo.updating) return;
						let markdown = todo.block?.content?.markdown;
						let nextChecked = !todo.checked;
						let nextMarkdown = updateTodoMarker(
							markdown,
							todo.sourceRange,
							nextChecked,
						);
						if (!todo.block?.id || !nextMarkdown) return;

						todo.updating = true;
						try {
							let response = await controller.updateBlock(todo.block.id, {
								content: nextMarkdown,
							});
							if (!response?.ok) {
								console.error(
									"Could not update todo item",
									response?.status,
								);
								return;
							}

							let body = await response.json();
							let newBlock = body?.data || body;
							if (!newBlock?.id ||
								typeof newBlock.content?.markdown != "string") {
								newBlock = {
									...todo.block,
									content: {
										...todo.block.content,
										markdown: nextMarkdown,
									},
								};
							}

							todo.checked = nextChecked;
							todo.block.content.markdown = newBlock.content.markdown;
							todo.updateBlock?.(newBlock);
							notificationpopup("Updated Checkbox");
						} catch (error) {
							console.error("Could not update todo item", error);
						} finally {
							todo.updating = false;
						}
					},
				};
				if (todo.checked) checkboxAttributes.checked = true;
				children.unshift(["input", checkboxAttributes]);
			},
		);

		controller.registerHook(
			"markdown:token-parse",
			({ token, tokens, index, block, updateBlock }) => {
				if (token?.type != "list_item_open" || token.markup != "-") {
					return;
				}

				for (let i = index + 1; i < tokens.length; i++) {
					let candidate = tokens[i];

					if (candidate.type == "list_item_close" && candidate.level == token.level) break;
					if (candidate.type != "inline" ) continue;

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
					return;
				}
			},
		);
	},
};

export default Todo;
