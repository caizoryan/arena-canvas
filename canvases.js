// How a channel stores its canvases and room pointers: one block each,
// recognised by title. These blocks are bookkeeping and never render.
//   .canvas         the default canvas
//   .canvas:<name>  a named canvas
//   .room:<name>    a room pointer
const NAMED_PREFIX = ".canvas:";

// The block title for a canvas; no name means the default canvas.
export const canvasTitle = (name = "") => name ? NAMED_PREFIX + name : ".canvas";

// The canvas name a block title stands for: "" for the default canvas,
// undefined when the block isn't a canvas.
export const canvasNameOf = (title) => {
	if (title == ".canvas") return "";
	if (typeof title == "string" && title.startsWith(NAMED_PREFIX)) {
		return title.slice(NAMED_PREFIX.length);
	}
	return undefined;
};

export const isHiddenBlock = (block) =>
	canvasNameOf(block?.title) !== undefined ||
	String(block?.title ?? "").startsWith(".room:");

// The canvases in a channel's blocks, default first, then by name. When two
// blocks share a title the first one wins.
export const channelCanvases = (blocks) => {
	let canvases = new Map();
	blocks.forEach((block) => {
		let name = canvasNameOf(block.title);
		if (name !== undefined && !canvases.has(name)) canvases.set(name, block);
	});
	return [...canvases]
		.map(([name, block]) => ({ name, block }))
		.sort((a, b) => a.name == "" ? -1 : b.name == "" ? 1 : a.name.localeCompare(b.name));
};

// What a URL hash (or typed slug) points at:
//   `<slug>` or `<slug>/<canvas name>`  → { slug, name } on Are.na
//   `<prefix>:<id>`                     → { adapter: prefix, id }
// Are.na slugs are [a-z0-9-], so a `:` before any `/` can only be a prefix,
// and a channel literally named "room" still opens at `#room`. Are.na URLs
// open their channel's default canvas.
export const parseRoute = (input) => {
	let text = String(input ?? "").trim().replace(/^#/, "");
	if (text.includes("are.na/")) {
		return { slug: text.split("/").filter((part) => part != "").pop() ?? "", name: "" };
	}
	try {
		text = decodeURIComponent(text);
	} catch {
		// Leave malformed escapes as typed.
	}

	let slash = text.indexOf("/");
	let head = slash == -1 ? text : text.slice(0, slash);
	let colon = head.indexOf(":");
	if (colon > 0) return { adapter: head.slice(0, colon), id: text.slice(colon + 1) };

	return {
		slug: head,
		name: slash == -1 ? "" : text.slice(slash + 1).trim(),
	};
};

export const routeHash = (slug, name = "") =>
	"#" + slug + (name ? "/" + encodeURIComponent(name) : "");
