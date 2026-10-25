import { isHiddenBlock } from "../../canvases.js";

// The Room document and its boundary with the app's canvas data (ADR 0005):
//
//   { meta:    { originSlug, canvasName, ejectedAt, closed },
//     blocks:  { [blockId]: <Are.na-shaped block> },
//     canvas:  { nodes: { [nodeId]: { ...node, z } }, edges: { [edgeId]: edge } },
//     plugins: { [key]: <opaque value> } }
//
// The app keeps nodes and edges as arrays; the document keeps maps keyed by
// id so each one merges on its own, and `z` carries the array order. These
// conversions happen only here.

export const roomSlug = (roomId) => "room:" + roomId;
export const roomIdOf = (slug) =>
	typeof slug == "string" && slug.startsWith("room:") ? slug.slice(5) : undefined;

// Canvas data keys that aren't plugin data: nodes and edges are mapped
// above, the node hash is derived, and the viewport stays with each user.
const CANVAS_KEYS = new Set(["nodes", "edges", "nodeHash", "transform"]);

// Automerge can't hold undefined or functions; JSON drops them.
const plain = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const edgeKey = (edge) =>
	String(edge.id ?? `${edge.fromNode}:${edge.fromSide}:${edge.toNode}:${edge.toSide}`);

// Set the fields of `value` on `target`, writing only the ones that changed
// and deleting the ones that are gone (except `keep`).
const assignChanged = (target, value, keep = []) => {
	Object.entries(value).forEach(([key, next]) => {
		if (next !== undefined && !same(target[key], next)) target[key] = next;
	});
	Object.keys(target).forEach((key) => {
		if (!(key in value) && !keep.includes(key)) delete target[key];
	});
};

// Write the app's canvas data into the document (a plain object or an
// Automerge change proxy), touching only what differs. z only changes where
// the array order disagrees with the stored order, so a move to the front
// rewrites one node, not all of them.
export const writeCanvas = (doc, data) => {
	let nodes = doc.canvas.nodes;
	let seen = new Set();
	let lastZ;
	(data.nodes ?? []).forEach((node) => {
		let id = String(node.id);
		seen.add(id);
		let value = plain(node);
		let existing = nodes[id];
		let z = existing?.z;
		if (typeof z != "number" || (lastZ !== undefined && z <= lastZ)) {
			z = lastZ === undefined ? 0 : lastZ + 1;
		}
		lastZ = z;
		if (!existing) {
			nodes[id] = { ...value, z };
			return;
		}
		assignChanged(existing, value, ["z"]);
		if (existing.z !== z) existing.z = z;
	});
	Object.keys(nodes).forEach((id) => {
		if (!seen.has(id)) delete nodes[id];
	});

	let edges = doc.canvas.edges;
	let edgeKeys = new Set();
	(data.edges ?? []).forEach((edge) => {
		let key = edgeKey(edge);
		edgeKeys.add(key);
		let value = plain(edge);
		if (!edges[key]) edges[key] = value;
		else assignChanged(edges[key], value);
	});
	Object.keys(edges).forEach((key) => {
		if (!edgeKeys.has(key)) delete edges[key];
	});

	// Plugin data is one opaque value per key, written whole.
	Object.entries(data).forEach(([key, value]) => {
		if (CANVAS_KEYS.has(key) || value === undefined) return;
		if (!same(doc.plugins[key], plain(value))) doc.plugins[key] = plain(value);
	});
};

// The app's canvas data from the document: nodes ordered by z (ties by id),
// without z. `transform` is the reader's own viewport, if any.
export const readCanvas = (doc, transform) => {
	let nodes = Object.values(doc.canvas.nodes)
		.map(plain)
		.sort((a, b) => a.z - b.z || String(a.id).localeCompare(String(b.id)))
		.map(({ z, ...node }) => node);
	let canvas = {
		nodes,
		edges: Object.values(doc.canvas.edges).map(plain),
		...plain(doc.plugins),
	};
	if (transform) canvas.transform = transform;
	return canvas;
};

export const isEmptyCanvas = (doc) =>
	Object.keys(doc.canvas.nodes).length == 0 &&
	Object.keys(doc.canvas.edges).length == 0 &&
	Object.keys(doc.plugins).length == 0;

// The eject snapshot: the canvas and every block on it, copied blocks keeping
// their Are.na ids. Bookkeeping blocks (.canvas, .room:) stay behind.
export const createRoomDocument = ({ originSlug, canvasName = "", blocks, data, now = new Date() }) => {
	let doc = {
		meta: { originSlug, canvasName, ejectedAt: now.toISOString(), closed: false },
		blocks: {},
		canvas: { nodes: {}, edges: {} },
		plugins: {},
	};
	blocks.filter((block) => !isHiddenBlock(block)).forEach((block) => {
		doc.blocks[String(block.id)] = plain(block);
	});
	writeCanvas(doc, data);
	return doc;
};

// What a room is called in the app: where it came from.
export const roomTitle = (meta) =>
	`${meta.originSlug}${meta.canvasName ? "/" + meta.canvasName : ""} (room)`;
