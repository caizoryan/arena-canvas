import { memo } from "./chowk.js";
import { dom } from "./dom.js";
import { state, try_set_channel } from "./state.js";
import { try_auth } from "./arena.js";
import { experimentalPlugins } from "./plugin.js";

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
	authenticate,
	pluginSettings,
	monospaceness,
];
