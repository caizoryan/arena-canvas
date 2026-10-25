import { memo } from "./chowk.js";
import { dom } from "./dom.js";
import { state, try_set_channel } from "./state.js";
import { stateAdapter, try_auth } from "./adapters/index.js";
import { canvasTitle, parseRoute, routeHash } from "./canvases.js";
import { notificationpopup } from "./notification.js";
import { saveCanvas } from "./script.js";
import { controller, experimentalPlugins } from "./plugin.js";

let query = "";

let searchBar = dom(["input", {
	placeholder: "Enter Slug or URL",
	oninput: (e) => query = e.target.value,
	onkeydown: (e) => e.key == "Enter" ? try_set_channel(query.trim()) : null,
}]);

export let focusSearchBar = () => searchBar.focus();
// Slice from the middle and put an ellipsis in its place. Keeping both ends
// visible is useful for titles that share a common prefix (or suffix).
let slicer = (str, size) => {
	str = String(str ?? "");
	size = Math.max(0, Math.floor(Number(size)) || 0);
	if (str.length <= size) return str;
	if (size <= 3) return ".".repeat(size);

	let remaining = size - 3;
	let left = Math.ceil(remaining / 2);
	let right = Math.floor(remaining / 2);
	return str.slice(0, left) + "..." + (right ? str.slice(-right) : "");
};
const search = [
	".section.search",
	["h4", "Channel"],
	searchBar,
	["button", { onclick: (e) => try_set_channel(query.trim()) }, "set"],
	["h5", "Recently Visited"],
	memo(() => {
		let recents = state.recentSlugs.value()
			.map((entry) => {
				// Keep old localStorage entries usable while they are migrated to
				// the { title, slug } format by state.js.
				if (typeof entry == "string") {
					return { title: entry, slug: entry };
				}
				if (!entry || typeof entry.slug != "string" || !entry.slug) {
					return undefined;
				}
				return {
					title: typeof entry.title == "string" && entry.title
						? entry.title
						: entry.slug,
					slug: entry.slug,
				};
			})
			.filter(Boolean);

		return [".recent-slugs", ...recents.map(({ title, slug }) => [
			"a.recent-slug",
			{
				href: "#" + slug,
				title,
				onclick: (event) => {
					event.preventDefault();
					try_set_channel(slug);
				},
			},
			slicer(title, 38),
		])];
	}, [state.recentSlugs]),
];

// ~~~~~~~~~~~~~~
// Canvases of the current channel
// ~~~~~~~~~~~~~~
let askCanvasName = (message, current = "") => {
	let name = prompt(message, current)?.trim();
	if (!name || name == current) return;
	if (state.channelCanvases.value().some((canvas) => canvas.name == name)) {
		notificationpopup(`A canvas named "${name}" already exists`, true);
		return;
	}
	return name;
};

let openCanvas = (name) =>
	try_set_channel(routeHash(state.currentSlug.value(), name));

// A new canvas opens with the channel's blocks auto-placed and is saved
// straight away, which creates its .canvas:<name> block.
let newCanvas = () => {
	let name = askCanvasName("Name the new canvas");
	if (!name) return;
	try_set_channel(routeHash(state.currentSlug.value(), name), () => saveCanvas());
};

let renameCanvas = ({ name, block }) => {
	let next = askCanvasName("Rename canvas", name);
	if (!next) return;
	stateAdapter().update_block(block.id, { title: canvasTitle(next) }).then((res) => {
		if (!res.ok) {
			notificationpopup("Couldn't rename canvas: " + res.status, true);
			return;
		}
		state.channelCanvases.next((canvases) => canvases.map((canvas) =>
			canvas.block?.id == block.id ? { name: next, block } : canvas));
		if (state.canvasName.value() == name) {
			state.canvasName.next(next);
			history.replaceState("", "", routeHash(state.currentSlug.value(), next));
		}
		notificationpopup(`Renamed to "${next}"`);
	});
};

// Deleting disconnects the canvas block from the channel; Are.na keeps the
// block itself.
let deleteCanvas = ({ name, block }) => {
	if (!confirm(`Delete the canvas "${name}"? It is removed from this channel.`)) return;
	let slug = state.currentSlug.value();
	stateAdapter().disconnect_block(slug, block.id).then((res) => {
		if (!res.ok) {
			notificationpopup("Couldn't delete canvas: " + res.status, true);
			return;
		}
		state.channelCanvases.next((canvases) =>
			canvases.filter((canvas) => canvas.block?.id != block.id));
		notificationpopup(`Deleted "${name}"`);
		if (state.canvasName.value() == name) {
			// Its unsaved changes went with it.
			state.updated.next(true);
			openCanvas("");
		}
	});
};

// The default canvas is always listed, and so is the open canvas before its
// first save.
let canvasRows = () => {
	let canvases = state.channelCanvases.value();
	let open = state.canvasName.value();
	let rows = [...canvases];
	if (!rows.some((canvas) => canvas.name == "")) rows.unshift({ name: "" });
	if (!rows.some((canvas) => canvas.name == open)) rows.push({ name: open });
	return rows;
};

let canvasRow = (canvas) => {
	let { name, block } = canvas;
	let open = name == state.canvasName.value();
	return [
		".canvas-row",
		["a.recent-slug.canvas-link", {
			href: routeHash(state.currentSlug.value(), name),
			title: name || "Default canvas",
			open,
			onclick: (event) => {
				event.preventDefault();
				openCanvas(name);
			},
		}, slicer(name || "Default", 30)],
		...(name && block
			? [
				["button", { onclick: () => renameCanvas(canvas) }, "rename"],
				["button", { onclick: () => deleteCanvas(canvas) }, "delete"],
			]
			: []),
	];
};

// Canvases belong to Are.na channels; other adapters (rooms) hold one canvas.
let inChannel = () => !parseRoute(state.currentSlug.value()).adapter;

// Plugins add actions for the open canvas with registerUI("canvases", ...),
// either a dom spec or a function returning one.
let canvasActions = () => controller.getUI("canvases")
	.map((component) => typeof component == "function" ? component() : component);

const canvases = [
	".section.canvases",
	["h4", "Canvases"],
	memo(() => inChannel()
		? [".canvas-list", ...canvasRows().map(canvasRow),
			["button", { onclick: newCanvas }, "+ New canvas"]]
		: [".canvas-list"],
	[state.channelCanvases, state.canvasName, state.currentSlug]),
	// channelCanvases changes on every load, even when the slug doesn't.
	memo(() => [".canvas-actions", ...canvasActions()],
		[state.currentSlug, state.channelCanvases]),
];

// Plugins add the people present in the open canvas with
// registerUI("people", ...). The section is empty outside rooms.
const people = memo(() => {
	let parts = controller.getUI("people")
		.map((component) => typeof component == "function" ? component() : component);
	return [".section.people", ["h4", "People"], ...parts];
}, [state.currentSlug]);

let logout = ["p", ["button", {
	onclick: () => {
		localStorage.setItem("auth", "");
		state.authSlug.next("");
	},
}, "logout"]];

let authbar = memo(() =>
	state.authSlug.value() == ""
		? ["div", ["input", {
			placeholder: "Enter Token",
			oninput: (e) => state.authKey = e.target.value.trim(),
			onkeydown: (e) => {
				if (e.key == "Enter") {
					localStorage.setItem("auth", state.authKey);
					try_auth();
				}
			},
		}], ["button", {
			onclick: () => {
				localStorage.setItem("auth", state.authKey);
				try_auth();
			},
		}, "try"], ["a", 
				{ href: "https://www.are.na/developers/personal-access-tokens" },
				[ "p", "Get your token here", ]]]
		: ["p", ["img.icon", { src: state.me.avatar }], [
			"p",
			state.authSlug,
		], logout], [state.authSlug]);

let authenticate = [".section.auth", ["h4", "Authenticate"], authbar];
let pluginSettings = [".section.plugins", ["h4", "Plugins"], [
	["button", { onclick: experimentalPlugins }, "Experimental plugins"],
]];
let monospaceness = [".section.monospaceness", ["h4", "Monospaceness"], [
	"input",
	{
		type: "range",
		oninput: (e) => {
			document.documentElement.style.setProperty(
				"--monospaceness",
				e.target.value,
			);
		},
		value: 65,
		min: 0,
		max: 100,
	},
]];

export let sidebar = [
	".sidebar",
	{ open: state.sidebarOpen },
	["h2", "Canvas"],
	search,
	canvases,
	people,
	authenticate,
	pluginSettings,
	monospaceness,
];
