import markdownIt from "./markdown-it/markdown-it.js"

// ********************************
// SECTION : MARKDOWN RENDERING
// ********************************
let md = new markdownIt('commonmark')//.use(makrdownItMark);

let attrs = (item) => {
	let attrs = item.attrs;
	if (!attrs) return {}
	return Object.fromEntries(attrs);
};

const link_is_block = (link) => {
	return link.includes("are.na/block");
};

const extract_block_id = (link) => {
	return link.split("/").pop();
};


function eat(tree) {
	let ret = [];

	if (!tree) return "";

	while (tree.length > 0) {
		let item = tree.shift();
		if (item.nesting === 1) {
			let at = attrs(item);
			let children = eat(tree);
			let libreak = c => c.toLowerCase().includes("break") ? { "data-break": 'true' } : {}
			if (item.tag == 'ul') ret.push(['.scroll', [item.tag, at, ...children]])
			else if (item.tag == 'li') ret.push([item.tag, at, libreak(children.join(" ")), ...children])
			else ret.push([item.tag, at, ...children])
		}
		if (item.nesting === 0) {
			if (!item.children || item.children.length === 0) {
				let p = item.type === "softbreak"
					? ["br"]
					: item.type === "fence"
						? ["xmp", item.content]
						: item.content;
				ret.push(p);
			} else {
				let children = eat(item.children);
				children.forEach(e => ret.push(e))
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

let debug_print = false
export const MD = (content) => {
	let tree, body;
	tree = safe_parse(content);
	if (tree) body = eat(tree);
	else body = content;
	return body;
};
