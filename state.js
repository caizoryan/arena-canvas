import { dom } from "./dom.js";
import { memo, reactive } from "./chowk.js";
import { get_channel, try_auth } from "./arena.js";
import { notificationpopup } from "./notification.js";
import { mountContainer, moveToBlock } from "./script.js";
import {
	BlockElement,
	constructBlockData,
	GroupElement,
	unwrap,
} from "./block.js";
import { createStore } from "./store.js";
import { pixelatedLine, svgline, svgrect, svgrectnormal } from "./svg.js";
import { dragTransforms } from "./dragOperations.js";
import { mountBoundingBox } from "./bigBoundingBox.js";

export let addToRecents = (slug) => {
	// load recents
	let s = localStorage.getItem("recent-slugs");
	if (s) {
		s = JSON.parse(s);
		let newS = Array.from(new Set([slug, ...s]));
		localStorage.setItem("recent-slugs", JSON.stringify(newS));
		state.recentSlugs.next(newS);
	} else {
		localStorage.setItem("recent-slugs", JSON.stringify([slug]));
		state.recentSlugs.next([slug]);
	}
};

let stringify = JSON.stringify;
export let mouse = reactive({ x: 0, y: 0 });

export let state = {
	authSlug: reactive(""),
	authKey: undefined,
	me: {},

	snapSize: reactive(5),
	sidebarOpen: reactive(false),
	helpOpen: reactive(false),

	recentSlugs: reactive([]),
	currentSlug: reactive("are-na-canvas"),
	selected: reactive([]),

	containerMouseX: reactive(0),
	containerMouseY: reactive(0),

	block_connection_buffer: undefined,
	selected_connection: undefined,
	connectionFromX: reactive(0),
	connectionFromY: reactive(0),
	connectionToX: reactive(0),
	connectionToY: reactive(0),

	updated: reactive(false),
	canvasX: reactive(0),
	canvasY: reactive(0),
	canvasScale: reactive(1),

	dimensions: reactive(100000),
	holdingCanvas: reactive(false),
	canceled: reactive(false),

	trackpad_movement: true,
	last_history: [],
	dot_canvas: undefined,
	moving_timeout: undefined,

	reRenderEdges: reactive(0),
};

// subscribe to currentSlug to update url
state.currentSlug.subscribe((slug) => history.pushState("", "", "#" + slug));
state.currentSlug.subscribe((slug) => addToRecents(slug));

export let store = createStore({
	data: { nodes: [], edges: [] },
	nodeHash: {},
});

store.subscribe(["data", "nodes"], (e) => {
	state.updated.next(false);

	let yes = false;
	if (e.id) {
		// check if e.id is in edges
		store.get(["data", "edges"]).forEach((n) => {
			if (n.fromNode == e.id || n.toNode == e.id) {
				yes = true;
			}
		});
	}
	if (yes) state.reRenderEdges.next((e) => e + .0001);
}, true);
store.subscribe(
	["data", "edges"],
	() => state.reRenderEdges.next((e) => e + .0001),
);

// ~~~~~~~~~~~
// STORE UTILS
// ~~~~~~~~~~~
let NODES = ["data", "nodes"];
let EDGES = ["data", "edges"];
let NODEHASH = ["data", "nodeHash"];
let NODEAT = (i) => NODES.concat([i]);
export let updateNodeHash = () => {
	let oldHash = store.get(NODEHASH);
	let hash = store.get(NODES)
		.reduce((acc, n, i) => (acc[n.id] = NODEAT(i), acc), {});

	if (oldHash) {
		Object.entries(oldHash).forEach(([key, value]) => {
			if (!idSubscriptions[key]) return;
			let { remove, fns, location } = idSubscriptions[key];

			if (!hash[key]) {
				remove();
				delete idSubscriptions[key];
			} else if (stringify(value) != stringify(hash[key])) {
				fns.forEach((fn) => {
					idSubscriptions[key].remove = store.relocate(location, hash[key], fn);
				});
				idSubscriptions[key].location = hash[key];
			}
		});
	}

	store.tr(["data"], "set", ["nodeHash", hash], false);
};

let idSubscriptions = {};

export let subscribeToId = (id, location, fn) => {
	let l = getNodeLocation(id);
	// TODO: Make removes...
	let remove = store.subscribe(l.concat(location), fn);
	if (idSubscriptions[id]) idSubscriptions[id].fns.push([fn]);
	idSubscriptions[id] = { fns: [fn], location, remove };
};

export let setNodes = (nodes) => {
	store.tr(["data"], "set", ["nodes", nodes], false);
	store.clearHistory();
	updateNodeHash();
};

export let addNode = (node) => {
	store.tr(NODES, "push", node, false);
	updateNodeHash();
};
export let removeNode = (node) => {
	// check if connection already exists
	// if not then add
	let index = store.get(NODES).findIndex((e) => e.id == node.id);
	if (index != -1) store.apply(NODES, "remove", [index, 1], false);
	updateNodeHash();
};

export let addEdge = (edge) => {
	// check if connection already exists
	// if not then add
	let exists = false;
	store.get(EDGES).forEach((e) => {
		if (exists) return;
		if (
			e.fromNode == edge.fromNode &&
			e.fromSide == edge.fromSide &&
			e.toSide == edge.toSide &&
			e.toNode == edge.toNode
		) exists = true;
	});

	if (!exists) store.tr(EDGES, "push", edge);
	else notificationpopup("Connection Already Exists", true);

	state.reRenderEdges.next((e) => e + .0001);
	// updateNodeHash()
};

export let removeEdge = (edge) => {
	// check if connection already exists
	// if not then add
	let index = store.get(EDGES).findIndex((e) => e.id == edge.id);
	if (index != -1) store.apply(EDGES, "remove", [index, 1]);

	state.reRenderEdges.next((e) => e + .0001);
	// updateNodeHash()
};

// TODO: when block is reorganzied this addressh becomes invalid...
// Block will need to remove subs and resub
// or need to add a way to change sub location? relocate
export let getNodeLocation = (id) => store.get(NODEHASH)[id];

// ~~~~~~~~~~~---------
// Initialize local storage
// ~~~~~~~~~~~---------
function load_local_storage() {
	// let local_currentslug = localStorage.getItem("slug")
	// if (local_currentslug) state.current_slug = local_currentslug

	let a = localStorage.getItem("auth");
	if (a) {
		state.authKey = a;
		try_auth();
	}

	let s = localStorage.getItem("recent-slugs");
	if (s) state.recentSlugs.next(JSON.parse(s));

	let t = localStorage.getItem("transform");
	if (t) {
		t = JSON.parse(t);
		state.canvasX.next(t.x);
		state.canvasY.next(t.y);
		state.canvasScale.next(t.scale);
	} else t = { x: 0, y: 0, scale: 1 };
}
load_local_storage();

// ~~~~~~~~~~~---------
// Are.na Functions
// ~~~~~~~~~~~---------
export let try_set_channel = (slugOrURL) => {
	// TODO: Add more safety here?
	let isUrl = slugOrURL.includes("are.na/");
	if (isUrl) {
		let slug = slugOrURL.split("/").filter((e) => e != "").pop();
		set_channel(slug);
	} else {
		set_channel(slugOrURL.trim());
	}
};
let set_channel = (slug) => {
	notificationpopup("Loading " + slug + "...");
	get_channel(slug)
		.then((res) => {
			if (!res.data) {
				notificationpopup([
					"span",
					"Failed to get channel " + slug,
					" try refreshing or opening another channel",
				], true);
			} else {
				notificationpopup("Loaded Channel: " + slug);
				notificationpopup("Total Blocks: " + res.data.length);

				state.currentSlug.next(slug);
				updateData(res.data);

				let blocks = processBlockForRendering(res.data);
				let groups = store.get(NODES).filter((e) => e.type == "group");
				let svg = svgBackground();

				mountContainer([
					...groups.map(GroupElement),
					mountBoundingBox(),
					...blocks.map(BlockElement),
					svg,
				]);

				// addToRecents(slug)
				// setSlug(slug)
				// localStorage.setItem('slug', slug)
			}
		});
};
let x1 = dragTransforms.startX;
let x2 = dragTransforms.endX;
let y1 = dragTransforms.startY;
let y2 = dragTransforms.endY;
let rectx = memo(() => Math.min(unwrap(x1), unwrap(x2)) || 0, [x1, x2]);
let recty = memo(() => Math.min(unwrap(y1), unwrap(y2)) || 0, [y1, y2]);
let rectheight = memo(() => Math.abs(unwrap(y2) - unwrap(y1)) || 0, [y1, y2]);
let rectwidth = memo(() => Math.abs(unwrap(x2) - unwrap(x1)) || 0, [x1, x2]);

let dragMarker = dom(svgrectnormal(
	rectx,
	recty,
	rectwidth,
	rectheight,
	memo(
		() =>
			(state.holdingCanvas.value() || state.canceled.value())
				? "#fff1"
				: "#0008",
		[state.holdingCanvas, state.canceled],
	),
));

let R = (location) => ({
	isReactive: true,
	value: () => store.get(location),
	subscribe: (fn) => store.subscribe(location, fn),
});

let edges = memo(() => {
	if (!store.get(["data", "edges"])) return [];
	return store.get(["data", "edges"]).map((e) => {
		console.log("running");

		let boundingToSide = (b, side) => {
			let s = 10;
			if (side == "top") {
				return ({
					x: b.x + b.width / 2,
					y: b.y - s,
				});
			}

			if (side == "bottom") {
				return ({
					x: b.x + b.width / 2,
					y: b.y + b.height + s,
				});
			}

			if (side == "right") {
				return ({
					x: b.x + b.width + s,
					y: b.y + b.height / 2,
				});
			}

			if (side == "left") {
				return ({
					x: b.x - s,
					y: b.y + b.height / 2,
				});
			}
		};

		let from = store.get(["data", "nodes"]).find((f) => f.id == e.fromNode);
		let to = store.get(["data", "nodes"]).find((f) => f.id == e.toNode);

		if (!(from && to)) return;
		// let to = store.get(getNodeLocation(e.toNode))

		let fromT = boundingToSide(from, e.fromSide);
		let toT = boundingToSide(to, e.toSide);

		let lineFn = pixelatedLine;
		lineFn = svgline;
		return lineFn(fromT.x, fromT.y, toT.x, toT.y, "#888", 5, 0, {
			class: "connection-line",
			onmouseenter: () => {
				console.log(e);
				state.selected_connection = e;
			},
			onmouseexit: () => {
				state.selected_connection = undefined;
			},

			onclick: (ev) => {
				if (ev.metaKey || ev.ctrlKey) {
					moveToBlock(e.toNode);
				}

				if (ev.shiftKey) {
					moveToBlock(e.fromNode);
				}
			},
		});
	}).filter((e) => e != undefined);
}, [
	R(["data", "edges"]),
	state.reRenderEdges,
]);

let currentConnection = svgline(
	state.connectionFromX,
	state.connectionFromY,
	state.connectionToX,
	state.connectionToY,
	"#0008",
	8,
	12,
);

function makeArrowMarker(size = 1, id = "arrow", color = "black") {
	return [
		"defs",
		{},
		[
			"marker",
			{
				id,
				markerWidth: 10 * size,
				markerHeight: 10 * size,
				refX: 1 * size,
				refY: 5 * size,
				orient: "auto",
				markerUnits: "strokeWidth",
			},
			[
				"path",
				{
					d: `M0,0 L${10 * size},${5 * size} L0,${10 * size} Z`,
					// "fill-opacity": 0,
					"fill": color,
					// "stroke": color,
					// "stroke-width": 1,
				},
			],
		],
	];
}

function makeLineArrowMarker(
	size = 1,
	id = "arrow",
	color = "black",
	strokeWidth = 2,
) {
	const box = 10 * size;
	const cx = box;
	const cy = box / 2;
	const arm = 4 * size;

	return [
		"defs",
		{},
		[
			"marker",
			{
				id,
				markerWidth: box + 5 * size,
				markerHeight: box + 5 * size,
				refX: cx,
				refY: cy,
				orient: "auto",
				markerUnits: "strokeWidth",
			},
			[
				"path",
				{
					d: `
            M ${cx - arm} ${cy - arm}
            L ${cx} ${cy}
            L ${cx - arm} ${cy + arm}
          `,
					stroke: color,
					strokeWidth,
					strokeLinecap: "round",
					strokeLinejoin: "round",
					fill: "none",
				},
			],
		],
	];
}

function makeCircleMarker(size = 1, id = "circle", color = "black") {
	const r = 5 * size;

	return [
		"defs",
		{},
		[
			"marker",
			{
				id,
				markerWidth: 10 * size,
				markerHeight: 10 * size,
				refX: r,
				refY: r,
				orient: "auto",
				markerUnits: "strokeWidth",
			},
			[
				"circle",
				{
					cx: r,
					cy: r,
					r,
					"fill": color,
					"stroke-width": 1,
				},
			],
		],
	];
}

function makeXMarker(size = 1, id = "x", color = "black", strokeWidth = 2) {
	const box = 10 * size;
	const pad = 2 * size;

	return [
		"defs",
		{},
		[
			"marker",
			{
				id,
				markerWidth: box,
				markerHeight: box,
				refX: box / 2,
				refY: box / 2,
				orient: "auto",
				markerUnits: "strokeWidth",
			},
			[
				"path",
				{
					d: `
            M ${pad} ${pad}
            L ${box - pad} ${box - pad}
            M ${box - pad} ${pad}
            L ${pad} ${box - pad}
          `,
					stroke: color,
					strokeWidth,
					strokeLinecap: "round",
					fill: "none",
				},
			],
		],
	];
}

let svgBackground = () => {
	return [
		"svg.background",
		{ width: state.dimensions, height: state.dimensions },
		makeLineArrowMarker(.4, "arrow", "#222"),
		makeCircleMarker(.3, "circle", "#222"),
		makeXMarker(.4),
		currentConnection,
		dragMarker,
		edges,
	];
};

let updateData = (blocks) => {
	state.dot_canvas = blocks.find((e) => e.title == ".canvas");
	if (state.dot_canvas) {
		let parsed = JSON.parse(state.dot_canvas.content.plain);
		setNodes(parsed.nodes);
		store.tr(["data"], "set", ["edges", parsed.edges], false);
		store.get(NODES).forEach((node) => {
			if (node.type == "text") {
				let f = blocks.find((e) => e.id == node.id);
				if (f && f.type == "Text") node.text = f.content.markdown;
			}
		});

		// if data has blocks that aren't in blocks... remove them
		let updateHash = false;
		store.get(NODES).forEach((node) => {
			if (node.type == "group") return;
			let f;
			if (node.id.toString().charAt(0) == "c") {
				f = blocks.find((e) => "c" + e.id == node.id);
			} else f = blocks.find((e) => e.id == node.id);
			if (!f) {
				console.log("removing");
				let i = store.get(NODES).findIndex((n) => n == node);
				store.tr(NODES, "remove", [i, 1], false);
				updateHash = true;
			}
		});
		let removeEdges = [];
		store.get(EDGES).forEach((node) => {
			let toTest = node.fromNode;
			let f;
			if (toTest.toString().charAt(0) == "c") {
				f = blocks.find((e) => "c" + e.id == toTest);
			} else f = blocks.find((e) => e.id == toTest);
			if (!f) removeEdges.push(node);
		});

		store.get(EDGES).forEach((node) => {
			let toTest = node.toNode;
			if (toTest == 42489767) console.log(node);
			let f;
			if (toTest.toString().charAt(0) == "c") {
				f = blocks.find((e) => "c" + e.id == toTest);
			} else f = blocks.find((e) => e.id == toTest);
			if (!f) removeEdges.push(node);
		});

		removeEdges.forEach((node) => {
			console.log("removing edge");
			let i = store.get(EDGES).findIndex((n) => n == node);
			store.tr(EDGES, "remove", [i, 1], false);
			updateHash = true;
		});

		// will relocate
		if (updateHash) {
			state.reRenderEdges.next((e) => e + .00001);
			updateNodeHash();
		}
	} else {
		console.log("DIDNT FIND DOT CANVAS");
		let nodes = blocks.filter((e) => e.title != ".canvas")
			.map(constructBlockData);

		setNodes(nodes);
	}
};
let processBlockForRendering = (blocks) => {
	blocks = blocks.filter((e) => e.title != ".canvas");
	return blocks;
};

memo(() => {
	state.canvasScale.value() < 0.1 ? state.canvasScale.next(.1) : null;
	state.canvasScale.value() > 2.3 ? state.canvasScale.next(2.3) : null;

	localStorage.setItem(
		"transform",
		JSON.stringify({
			x: state.canvasX.value(),
			y: state.canvasY.value(),
			scale: state.canvasScale.value(),
		}),
	);
}, [state.canvasX, state.canvasY, state.canvasScale]);
