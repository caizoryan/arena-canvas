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
			if (!item.children || item.children.length === 0) {
				let p = item.type === "softbreak"
					? ["br"]
					: item.type === "fence"
						? ["pre", item.content]
						: item.type === "code_inline"
							? [item.tag, item.content]
							: item.content;
				ret.push(p);
			} else {
				let children = eat(item.children);
				children.forEach((e) => ret.push(e));
			}
		}

		if (item.nesting === -1) break;
	}

	return ret;
}

let safe_parse = (content) => {
	try {
		return md.parse(content, { html: true });
	} catch (e) {
		return undefined;
	}
};

let debug_print = false;
export const MD = (content) => {
	let tree, body;
	tree = safe_parse(content);
	if (tree) body = eat(tree);
	else body = content;
	return body;
};
