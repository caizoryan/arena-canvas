// A text clipboard format so layouts work across tabs and browser sessions.
// Plain cmd+c/cmd+v still use the application's ordinary Are.na links.
const FORMAT = "arena-canvas-blocks";
const VERSION = 1;
const MAX_NODES = 1000;
const geometryKeys = ["x", "y", "width", "height"];

const validGeometry = (node) =>
	geometryKeys.every((key) => Number.isFinite(node?.[key])) &&
	node.width > 0 && node.height > 0;

const validTransform = (transform) =>
	["x", "y", "scale"].every((key) => Number.isFinite(transform?.[key])) &&
	transform.scale > 0;

const identityFor = (node) => {
	if (node.type == "group") return;
	let id = String(node.id);
	let channel = id.startsWith("c");
	let arenaId = channel ? id.slice(1) : id;
	if (!/^[1-9]\d*$/.test(arenaId) || !Number.isSafeInteger(Number(arenaId))) return;

	return {
		id,
		url: `https://are.na/${channel ? "channel" : "block"}/${arenaId}`,
		connectableType: channel ? "Channel" : "Block",
	};
};

export const createCanvasClipboard = (nodes, canvas, transform) => {
	if (typeof canvas != "string" || !canvas || !validTransform(transform)) {
		throw new Error("Canvas information is unavailable");
	}

	let snapshots = new Map();
	nodes.forEach((node) => {
		let identity = identityFor(node);
		if (!identity || !validGeometry(node)) return;
		snapshots.set(identity.id, {
			...identity,
			x: node.x,
			y: node.y,
			width: node.width,
			height: node.height,
		});
	});
	if (!snapshots.size) throw new Error("Select Are.na blocks to copy");
	if (snapshots.size > MAX_NODES) throw new Error("Too many blocks to copy at once");

	return {
		format: FORMAT,
		version: VERSION,
		canvas,
		transform: { x: transform.x, y: transform.y, scale: transform.scale },
		nodes: [...snapshots.values()],
	};
};

export const parseCanvasClipboard = (text) => {
	try {
		if (typeof text != "string" || text.length > 2_000_000) return;
		let data = JSON.parse(text);
		if (data?.format != FORMAT || data.version != VERSION ||
			typeof data.canvas != "string" || !data.canvas ||
			!validTransform(data.transform) || !Array.isArray(data.nodes) ||
			!data.nodes.length || data.nodes.length > MAX_NODES) return;

		let ids = new Set();
		for (let node of data.nodes) {
			if (!node || typeof node.id != "string" || !validGeometry(node)) return;
			let identity = identityFor(node);
			if (!identity || node.url != identity.url ||
				node.connectableType != identity.connectableType || ids.has(node.id)) return;
			ids.add(node.id);
		}
		// Return only the validated fields, never arbitrary clipboard properties.
		return createCanvasClipboard(data.nodes, data.canvas, data.transform);
	} catch {
		return;
	}
};

export const translateCanvasClipboard = (data, transform) => {
	if (!validTransform(transform)) throw new Error("Canvas transform is unavailable");
	let dx = transform.x - data.transform.x;
	let dy = transform.y - data.transform.y;

	// Deliberately preserve canvas dimensions and spacing, regardless of zoom.
	return data.nodes.map((node) => {
		let translated = { ...node, x: node.x + dx, y: node.y + dy };
		if (!validGeometry(translated)) throw new Error("Invalid pasted block coordinates");
		return translated;
	});
};
