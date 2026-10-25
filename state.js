import { dom } from "./dom.js";
import { memo, reactive } from "./chowk.js";
import {
	activateStateAdapter,
	getStateAdapter,
	hasUnsavedChanges,
	stateAdapter,
	stateAdapterForPrefix,
	try_auth,
} from "./adapters/index.js";
import { notificationpopup } from "./notification.js";
import { mountContainer, moveToBlock, saveCanvas } from "./script.js";
import { controller } from "./plugin.js";
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
import {
	canvasTitle,
	channelCanvases,
	isHiddenBlock,
	parseRoute,
	routeHash,
} from "./canvases.js";

let normalizeRecent = (entry) => {
	if (typeof entry == "string" && entry) {
		return { title: entry, slug: entry };
	}
	if (!entry || typeof entry.slug != "string" || !entry.slug) return undefined;

	return {
		title: typeof entry.title == "string" && entry.title
			? entry.title
			: entry.slug,
		slug: entry.slug,
	};
};

let normalizeRecents = (entries) => {
	let seen = new Set();
	return (Array.isArray(entries) ? entries : [])
		.map(normalizeRecent)
		.filter((entry) => {
			if (!entry || seen.has(entry.slug)) return false;
			seen.add(entry.slug);
			return true;
		});
};

export let addToRecents = (slug, title = slug) => {
	if (typeof slug != "string" || !slug) return;

	let stored;
	try {
		stored = JSON.parse(localStorage.getItem("recent-slugs") || "[]");
	} catch {
		stored = [];
	}

	let recents = normalizeRecents(stored);
	let old = recents.find((entry) => entry.slug == slug);
	let recent = {
		title: typeof title == "string" && title && title != slug
			? title
			: (old?.title || slug),
		slug,
	};
	let newRecents = normalizeRecents([recent, ...recents]);
	localStorage.setItem("recent-slugs", JSON.stringify(newRecents));
	state.recentSlugs.next(newRecents);
};

let stringify = JSON.stringify;
export let mouse = reactive({ x: 0, y: 0 });

export let state = {
	authSlug: reactive(""),
	authKey: undefined,
	me: {},

	snapSize: reactive(25),
	sidebarOpen: reactive(false),
	helpOpen: reactive(false),

	recentSlugs: reactive([]),
	currentSlug: reactive("are-na-canvas"),
	// The open canvas in the current channel; "" is the default canvas.
	canvasName: reactive(""),
	// Every canvas in the current channel, as { name, block }.
	channelCanvases: reactive([]),
	selected: reactive([]),

	containerMouseX: reactive(0),
	containerMouseY: reactive(0),

	block_connection_buffer: undefined,
	selected_connection: undefined,
	connectionFromX: reactive(0),
	connectionFromY: reactive(0),
	connectionToX: reactive(0),
	connectionToY: reactive(0),

	updated: reactive(true),
	canvasX: reactive(0),
	canvasY: reactive(0),
	canvasScale: reactive(1),

	dimensions: reactive(100000),
	holdingCanvas: reactive(false),
	canceled: reactive(false),
	dragMode: reactive(""),

	trackpad_movement: true,
	last_history: [],
	dot_canvas: undefined,
	moving_timeout: undefined,

	reRenderEdges: reactive(0),
};

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
		// arena.js imports state.js as well. Defer authentication until the
		// circular module initialization has completed.
		setTimeout(() => try_auth());
	}

	let s = localStorage.getItem("recent-slugs");
	if (s) {
		try {
			let recents = normalizeRecents(JSON.parse(s));
			state.recentSlugs.next(recents);
			// Persist the normalized representation so legacy string entries are
			// migrated even if the user never visits another channel.
			localStorage.setItem("recent-slugs", JSON.stringify(recents));
		} catch {
			// Ignore malformed localStorage data and start with an empty history.
			state.recentSlugs.next([]);
		}
	}

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
let navigationModal;
let pendingRoute;

let closeNavigationModal = () => {
	if (navigationModal) navigationModal.remove();
	navigationModal = undefined;
	pendingRoute = undefined;
};

let showUnsavedChangesModal = (route) => {
	pendingRoute = route;
	if (navigationModal) return;

	let saveAndNavigate = () => {
		let next = pendingRoute;
		saveCanvas().then((saved) => {
			if (!saved) return;
			closeNavigationModal();
			set_channel(next.slug, next.name, next.afterLoad, next.adapterId);
		});
	};

	let discardAndNavigate = () => {
		let next = pendingRoute;
		closeNavigationModal();
		set_channel(next.slug, next.name, next.afterLoad, next.adapterId);
	};

	navigationModal = dom([
		".modal-overlay",
		[".popup.unsaved-changes",
			["h2", "Unsaved changes"],
			["p", "This canvas has unsaved changes. What would you like to do?"],
			[".unsaved-changes-actions",
				["button#save-btn", { onclick: saveAndNavigate }, "Save"],
				["button#discard-btn", { onclick: discardAndNavigate }, "Discard"],
				["button", { onclick: closeNavigationModal }, "Cancel"],
			],
		],
	]);
	document.body.appendChild(navigationModal);
};

// Browsers do not allow custom application modals during beforeunload. This
// triggers the browser's native unsaved-changes confirmation instead.
window.addEventListener("beforeunload", (event) => {
	if (!hasUnsavedChanges()) return;
	event.preventDefault();
	event.returnValue = "You have unsaved changes. Save or cancel?";
});

let currentHash = () =>
	routeHash(state.currentSlug.value(), state.canvasName.value());

// Open a canvas from a slug, `slug/canvas name`, URL or hash. `<prefix>:<id>`
// opens it with the adapter that owns that prefix (e.g. `room:<roomId>`);
// everything else is Are.na. afterLoad runs once that canvas has rendered.
export let try_set_channel = (slugOrURL, afterLoad) => {
	if (typeof slugOrURL != "string") return;

	let parsed = parseRoute(slugOrURL);
	let route;
	if (parsed.adapter) {
		let adapter = stateAdapterForPrefix(parsed.adapter);
		if (!adapter || !parsed.id) {
			notificationpopup(`Can't open "${parsed.adapter}:" links`, true);
			if (location.hash != currentHash()) history.replaceState("", "", currentHash());
			return;
		}
		route = { slug: `${parsed.adapter}:${parsed.id}`, name: "", adapterId: adapter.id };
	} else {
		if (!parsed.slug) return;
		route = { ...parsed, adapterId: "arena" };
	}

	let isOpen = route.slug == state.currentSlug.value() &&
		route.name == state.canvasName.value();
	if (hasUnsavedChanges() && !isOpen) {
		// A hashchange has already changed the URL by the time this runs. Put it
		// back until the user chooses Save or Discard in the modal.
		if (location.hash != currentHash()) {
			history.replaceState("", "", currentHash());
		}
		showUnsavedChangesModal({ ...route, afterLoad });
		return;
	}

	set_channel(route.slug, route.name, afterLoad, route.adapterId);
};
let renderChannel = (blocks) => {
	controller.setChannelBlocks(blocks);
	state.channelCanvases.next(channelCanvases(blocks));
	updateData(blocks);
	// A channel with a .canvas block is already saved. Without one, saving
	// will create the initial .canvas block.
	state.updated.next(Boolean(state.dot_canvas));

	let visibleBlocks = processBlockForRendering(blocks);
	let groups = store.get(NODES).filter((e) => e.type == "group");
	let svg = svgBackground();

	mountContainer([
		...groups.map(GroupElement),
		mountBoundingBox(),
		...visibleBlocks.map(BlockElement),
		svg,
	]);
};

// Load through the route's adapter, and only switch to it once that worked,
// so a failed load leaves the open canvas working.
let set_channel = (slug, name = "", afterLoad, adapterId = "arena") => {
	notificationpopup("Loading " + slug + "...");
	let adapter = getStateAdapter(adapterId) ?? stateAdapter();
	Promise.all([adapter.get_channel_contents(slug), adapter.get_channel(slug)])
		.then(([res, channel]) => {
			if (!res.data) {
				// The URL already points at what failed; put back the open canvas.
				if (location.hash != currentHash()) history.replaceState("", "", currentHash());
				notificationpopup([
					"span",
					"Failed to get channel " + slug,
					" try refreshing or opening another channel",
				], true);
			} else {
				let blocks = res.data;
				let title = canvasTitle(name);
				let channelCanvas = blocks.find((block) => block.title == title);

				notificationpopup("Loaded Channel: " + slug);
				notificationpopup("Total Blocks: " + blocks.length);

				if (stateAdapter() != adapter) activateStateAdapter(adapter.id);
				state.canvasName.next(name);
				state.currentSlug.next(slug);
				if (location.hash != currentHash()) {
					history.pushState("", "", currentHash());
				}
				if (name && !channelCanvas) {
					notificationpopup(`No canvas "${name}" yet. Saving creates it.`);
				}
				// Some API responses include channel metadata. Keep the slug as a
				// fallback for older responses and for legacy/local channels.
				let channelTitle = channel?.title
					|| res.channel?.title
					|| res.title
					|| res.data?.channel?.title
					|| res.data?.[0]?.channel?.title
					|| slug;
				addToRecents(slug, channelTitle);
				renderChannel(blocks);
				controller.dispatchHook("canvas:loaded", { slug, name, adapter: adapter.id });
				afterLoad?.();

				// The channel contents endpoint can return a stale .canvas block.
				// Fetch the block directly and refresh the canvas in the background
				// when its timestamp differs.
				if (channelCanvas?.id) {
					adapter.get_block(channelCanvas.id).then((currentCanvas) => {
						if (
							!currentCanvas ||
							currentCanvas.updated_at == channelCanvas.updated_at
						) return;

						blocks = blocks.map((block) =>
							block.id == channelCanvas.id ? currentCanvas : block,
						);
						renderChannel(blocks);
					});
				}

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
		() => {
			if (state.dragMode.value() == "zoom") return "#E3CFF5";
			if (state.holdingCanvas.value() || state.canceled.value()) return "#fff1";
			return "#0008";
		},
		[state.holdingCanvas, state.canceled, state.dragMode],
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
				state.selected_connection = e;
			},
			onmouseleave: () => {
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
	let title = canvasTitle(state.canvasName.value());
	state.dot_canvas = blocks.find((e) => e.title == title);
	if (state.dot_canvas) {
		let parsed = JSON.parse(state.dot_canvas.content.plain);
		controller.dispatchHook("canvas:deserialize", {
			data: parsed,
			hasCanvas: true,
			blocks,
		});
		if (parsed.transform) {
			state.canvasX.next(parsed.transform.x);
			state.canvasY.next(parsed.transform.y);
			state.canvasScale.next(parsed.transform.scale);
		}
		if (!parsed.edges) parsed.edges = []
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
		controller.dispatchHook("canvas:deserialize", {
			data: {},
			hasCanvas: false,
			blocks,
		});
		let nodes = blocks.filter((e) => !isHiddenBlock(e))
			.map(constructBlockData);

		setNodes(nodes);
	}
};

let processBlockForRendering = (blocks) => {
	blocks = blocks.filter((e) => !isHiddenBlock(e));
	return blocks;
};

memo(() => {
	let snapSize = Number(state.snapSize.value());
	let root = document.documentElement;

	// Keep the major grid at four snap intervals. A zero snap size means
	// snapping is disabled, so hide the grid without assigning an invalid zero
	// background size.
	if (root) {
		let gridSize = snapSize > 0 ? snapSize * 2 : 1;
		root.style.setProperty("--grid-size", `${gridSize}px`);
	}

	state.canvasScale.value() < 0.2 ? state.canvasScale.next(.2) : null;
	state.canvasScale.value() > 2.3 ? state.canvasScale.next(2.3) : null;

	// The canvas is scaled as a whole, so compensate the connection stroke
	// width to keep it approximately the same thickness on screen.
	if (root) {
		let scale = state.canvasScale.value();
		let lineWidth = Math.max(1, 1/ scale);
		root.style.setProperty("--grid-line-size", snapSize > 0 ? `${lineWidth}px` : "0px");
		root.style.setProperty("--connection-line-width", `${lineWidth}px`);
	}

	localStorage.setItem(
		"transform",
		JSON.stringify({
			x: state.canvasX.value(),
			y: state.canvasY.value(),
			scale: state.canvasScale.value(),
		}),
	);
}, [state.snapSize, state.canvasX, state.canvasY, state.canvasScale]);
