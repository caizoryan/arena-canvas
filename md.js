import markdownIt from "./markdown-it/markdown-it.js";
import markdownItMark from "./markdown-it/markdown-it-mark.js";
import { controller } from "./plugin.js";

// ********************************
// SECTION : MARKDOWN RENDERING
// ********************************
// let md = new markdownIt('commonmark').use(markdownItMark);
let md = new markdownIt().use(markdownItMark);

let attrs = (item) => {
	let attrs = item.attrs;
	if (!attrs) return {};
	return Object.fromEntries(attrs);
};

const urlBase = () => typeof document != "undefined" && document.baseURI
	? document.baseURI
	: "https://are.na/";

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

	return {
		markdown: nextLines.join(markdown.includes("\r\n") ? "\r\n" : "\n"),
		lineIndex,
	};
};

// Return structured information for Are.na block URLs. Keeping query
// parameters separate is important for plugins that use them as commands or
// metadata.
export const parse_arena_block_url = (link) => {
	if (typeof link != "string") return undefined;

	try {
		let url = new URL(link, urlBase());
		let hostname = url.hostname.toLowerCase();
		if (hostname != "are.na" && hostname != "www.are.na") return undefined;

		let parts = url.pathname.split("/").filter(Boolean);
		let blockIndex = parts.findIndex((part) => part.toLowerCase() == "block");
		let id = blockIndex == -1 ? undefined : parts[blockIndex + 1];
		if (!id) return undefined;

		return {
			id: decodeURIComponent(id),
			url,
		};
	} catch (_) {
		return undefined;
	}
};

export const link_is_block = (link) => Boolean(parse_arena_block_url(link));

export const extract_block_id = (link) => {
	let parsed = parse_arena_block_url(link);
	if (parsed) return parsed.id;

	// Preserve support for callers that receive a bare, non-URL value while
	// avoiding accidentally including a query string or fragment in the ID.
	return link?.split("/").pop().split(/[?#]/)[0].trim();
};

function eat(tree) {
	let ret = [];

	if (!tree) return "";

	while (tree.length > 0) {
		let item = tree.shift();
		if (item.nesting === 1) {
			let at = attrs(item);
			let children = eat(tree);

			if (at.href) {
				let hookResult = controller.dispatchHook("markdown:link", {
					controller,
					children,
					attributes: { ...at },
				});

				if (hookResult?.handled) {
					let body = hookResult.body;
					if (Array.isArray(body) && typeof body[0] == "string") {
						ret.push(body);
					} else {
						body = [ item.tag, { ...at}, ...children, ];
					}
					continue;
				}
			}

			if (at.href && at.target === undefined) at.target = "_blank";

			ret.push([item.tag, at, ...children]);
		}
		if (item.nesting === 0) {
			let children;
			if (!item.children || item.children.length === 0) {
				let p = item.type === "softbreak"
					? ["br"]
					: item.type === "fence"
						? ["pre", item.content]
						: item.type === "code_inline"
							? [item.tag, item.content]
							: item.content;
				children = [p];
			} else {
				children = eat(item.children);
			}

			if (item.todoCheckbox) {
				let todo = item.todoCheckbox;
				let checkboxAttributes = {
					type: "checkbox",
					"aria-label": "Todo item",
					onclick: async (event) => {
						event.preventDefault();
						event.stopPropagation();
						let checkbox = event.currentTarget;

						// Prevent two quick clicks from sending conflicting updates.
						if (todo.updating) return;
						let block = todo.block;
						let markdown = block?.content?.markdown;
						let nextChecked = !todo.checked;
						let update = updateTodoMarker(
							markdown,
							todo.sourceRange,
							nextChecked,
						);
						if (!block?.id || !update) return;

						todo.updating = true;
						try {
							let response = await controller.updateBlock(block.id, {
								content: update.markdown,
							});
							if (!response?.ok) {
								console.error("Could not update todo item", response?.status);
								return;
							}

							todo.checked = nextChecked;
							block.content.markdown = update.markdown;
							checkbox.checked = nextChecked;
							todo.onMarkdownUpdated?.(update.markdown);
						} catch (error) {
							console.error("Could not update todo item", error);
						} finally {
							todo.updating = false;
						}
					},
				};
				if (todo.checked) checkboxAttributes.checked = true;
				children.unshift(["input", checkboxAttributes]);
			}

			children.forEach((e) => ret.push(e));
		}

		if (item.nesting === -1) break;
	}

	return ret;
}

let safe_parse = (content, context = {}) => {
	try {
		let tokens = md.parse(content, { html: true });

		// Token hooks run after Markdown-it has parsed inline children, which
		// lets plugins inspect and annotate the structured token tree without
		// having to reimplement Markdown parsing.
		tokens.forEach((token, index) => {
			controller.dispatchHook("markdown:token", {
				...context,
				controller,
				content,
				token,
				tokens,
				index,
				// markdown-it maps are [startLine, endLine], with zero-based
				// start and an exclusive end.
				sourceRange: token.map ? [...token.map] : undefined,
			});
		});

		return tokens;
	} catch (e) {
		return undefined;
	}
};

let debug_print = false;
export const MD = (content, context = {}) => {
	let tree, body;
	tree = safe_parse(content, context);
	if (tree) body = eat(tree);
	else body = content;
	return body;
};
