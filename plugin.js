import { update_block } from "./arena.js";
import { memo, reactive } from "./chowk.js";
import { dom } from "./dom.js";
import { MD } from "./md.js";
import { notificationpopup } from "./notification.js";
import {
	getNodeLocation,
	state,
	store,
	subscribeToId,
} from "./state.js";

// A renderer returns an object with this shape:
// {
//   body,              // a dom.js description or an HTMLElement
//   topBar: [],        // components to put in the block's top bar
//   bottomBar: [],     // components to put in the block's bottom bar
//   attributes: {},    // attributes/events for the block body
// }
export const registeredRenderers = [];
export const registeredPlugins = [];

let activeRegistration;

const remove = (items, item) => {
	let index = items.indexOf(item);
	if (index !== -1) items.splice(index, 1);
};

const runCleanup = (cleanup) => {
	if (typeof cleanup !== "function") return;
	try {
		cleanup();
	} catch (error) {
		console.error("Plugin cleanup failed", error);
	}
};

export const controller = {
	registerRenderer: (renderer) => {
		if (!renderer || typeof renderer.match !== "function" ||
			typeof renderer.render !== "function") {
			throw new TypeError(
				"A renderer must have match(block) and render(block) functions",
			);
		}

		registeredRenderers.push(renderer);

		const unregister = () => remove(registeredRenderers, renderer);
		if (activeRegistration) activeRegistration.cleanups.push(unregister);
		return unregister;
	},
};

// Register a plugin for the lifetime of the returned function. Renderer
// registrations made from setup are also removed when the plugin is removed,
// even if setup does not explicitly return a cleanup function.
export function register(plugin) {
	if (!plugin || typeof plugin !== "object") {
		throw new TypeError("A plugin must be an object");
	}
	if (plugin.setup !== undefined && typeof plugin.setup !== "function") {
		throw new TypeError("A plugin setup must be a function");
	}

	const registration = { plugin, cleanups: [] };
	registeredPlugins.push(plugin);

	let cleanup;
	const previousRegistration = activeRegistration;
	activeRegistration = registration;
	try {
		cleanup = plugin.setup ? plugin.setup(controller) : undefined;
	} catch (error) {
		activeRegistration = previousRegistration;
		runCleanup(cleanup);
		registration.cleanups.forEach(runCleanup);
		remove(registeredPlugins, plugin);
		throw error;
	}
	activeRegistration = previousRegistration;

	let unregistered = false;
	return () => {
		if (unregistered) return;
		unregistered = true;
		runCleanup(cleanup);
		registration.cleanups.forEach(runCleanup);
		remove(registeredPlugins, plugin);
	};
}

// ---------------------------------------------------------------------------
// Built-in block renderers
// ---------------------------------------------------------------------------
// These live here as the first users of the renderer registration API. Keeping
// the renderer functions here also means adding a renderer does not require
// changing BlockElement's dispatch code.

const button = (text, onclick, options = {}) => [
	"button",
	{ onclick, ...options },
	text,
];

// Reactive interface used by the text renderer for the canvas node backing an
// Arena block. This is intentionally local to the renderer plugin for now.
const R = (location, id) => (key) => ({
	isReactive: true,
	value: () => store.get(location.concat([key])),
	next: (value) => store.tr(location, "set", [key, value]),
	subscribe: (fn) => subscribeToId(id, [key], fn),
});

const TextBlock = (block) => {
	let root = dom(".block");
	let child = dom([".block.text", ...MD(block.content.markdown)]);
	root.appendChild(child);

	let attributes = {
		edit: reactive(false),
	};

	let owned = memo(() => state.authSlug.value() == block.user?.slug, [
		state.authSlug,
	]);

	let value = block.content?.markdown;
	let old = "";
	let wc = reactive(value?.split(" ").length);
	let wordCount = dom(["button", "words: ", wc]);
	let reset = () => root.innerHTML = "";

	let editBlock = (e) => {
		e.stopImmediatePropagation();
		e.stopPropagation();
		if (attributes.edit.value()) return;
		attributes.edit.next(true);
		reset();
		child = dom([".block.text", textarea(value)]);
		root.appendChild(child);
	};
	attributes.ondblclick = editBlock;
	let editButton = button("edit", editBlock);

	let saveBlock = () => {
		attributes.edit.next(false);
		update_block(block.id, { content: value })
			.then((res) => {
				if (res.ok) {
					notificationpopup("Updated 👍");
					store.apply(getNodeLocation(block.id), "set", ["text", value], false);
					console.log(
						"Updated",
						store.get(getNodeLocation(block.id).concat(["text"])),
					);
				} else if (res.status == 401) {
					notificationpopup("Failed: Unauthorized :( ", true);
				} else {
					console.log(res);
					notificationpopup("Failed :( status: " + res.status, true);
				}
			});
		reset();

		child = dom([".block.text", ...MD(value)]);
		root.appendChild(child);
	};
	let saveButton = dom(button("save", saveBlock));

	let cancelEdit = () => {
		setValue(old);
		attributes.edit.next(false);
		reset();
		root.appendChild(dom([".block.text", ...MD(value)]));
	};
	let cancelButton = dom(button("cancel", cancelEdit));

	let blockUserTag = ["p.tag", block.user?.slug];

	let editOrTagOrSave = memo(
		() =>
			attributes.edit.value()
				? owned ? [saveButton, cancelButton] : [cancelButton]
				: owned && block.type == "Text"
					? [editButton]
					: [blockUserTag],
		[state.authSlug, attributes.edit],
	);

	let setValue = (text) => {
		wc.next(text.split(" ").length);
		value = text;
	};

	let textarea = (markdown) => {
		old = value;
		return dom(["textarea", {
			oninput: (e) => setValue(e.target.value),
			onkeydown: (e) => {
				if (e.key == "s" && (e.metaKey || e.ctrlKey)) saveBlock();
			},
		}, markdown]);
	};

	return {
		body: root,
		topBar: [editOrTagOrSave],
		bottomBar: [wordCount],
		attributes,
	};
};

const ProcessingBlock = () => ({
	body: [".block.processing", ["p.processing-animation", "Processing…"]],
	topBar: [],
	bottomBar: [],
	attributes: {},
});

const ImageBlock = (block) => {
	let link = block.image?.large?.src || block.image?.large?.url;
	return {
		body: [".block.image", ["img", { src: link }]],
		topBar: [],
		bottomBar: [],
		attributes: {},
	};
};

const LinkBlock = (block) => {
	let imgLink = block.image?.large?.src || block.image?.large?.url;
	let link = block.source?.url;
	let element = dom([".block.image", ["img", { src: imgLink }]]);
	let load = button("load", () => {
		if (!link) return;
		element.innerHTML = `<iframe src="${link}"></iframe>`;
	});
	return {
		body: [".block.embed", element],
		topBar: [],
		bottomBar: [load],
		attributes: {},
	};
};

const MediaBlock = ImageBlock;

const EmbedBlock = (block) => {
	let link = block.image?.large?.src || block.image?.large?.url;
	let element = dom([".block.image", ["img", { src: link }]]);
	let load = button("load", () => {
		element.innerHTML = block?.embed?.html;
	});
	return {
		body: [".block.embed", element],
		topBar: [],
		bottomBar: [load],
		attributes: {},
	};
};

const AttachmentBlock = (block) => {
	let fileExtension = block.attachment?.file_extension?.toLowerCase();
	if (fileExtension == "mp4") {
		let link = block.attachment.url;
		let video = dom(["video", { src: link }]);
		let togglePlay = () => {
			video.paused ? video.play() : video.pause();
			video.paused
				? playPause.innerText = "play"
				: playPause.innerText = "pause";
		};
		let playPause = dom(["button", {
			onclick: togglePlay,
		}, "play"]);

		video.ontimeupdate = () => {
			seeker.value = video.currentTime / video.duration;
		};

		let seeker = dom([
			"input",
			{
				oninput: (e) =>
					video.currentTime = parseFloat(e.target.value) * video.duration,
				type: "range",
				min: 0,
				max: 1,
				step: 0.01,
				value: 0,
			},
		]);

		let controls = [
			".controls",
			playPause,
			seeker,
		];
		return {
			body: [".block.image", video],
			topBar: [],
			bottomBar: [controls],
			attributes: { ondblclick: togglePlay },
		};
	} else if (fileExtension == "mp3") {
		let audio = dom(["audio", {
			src: block.attachment.url,
			controls: true,
		}]);
		return {
			body: [".block.image", audio],
			topBar: [],
			bottomBar: [],
			attributes: {},
		};
	} else if (fileExtension == "pdf") {
		let link = block.image?.large?.src || block.image?.large?.url;
		let pdflink = block.attachment.url;
		let d = dom([".block.image", ["img", { src: link }]]);
		let mountPdf = () => {
			d.innerHTML = "";
			let iframe = ["iframe", { src: pdflink }];
			d.appendChild(dom(iframe));
		};
		return {
			body: d,
			topBar: [],
			bottomBar: [button("view pdf", mountPdf)],
			attributes: {},
		};
	} else {
		let link = block.image?.large?.src || block.image?.large?.url;
		return {
			body: [".block.image", ["img", { src: link }]],
			topBar: [],
			bottomBar: [],
			attributes: {},
		};
	}
};

const Channel = (block) => ({
	body: [
		".block.channel",
		["h2", block.title],
		["h4", ["strong", block.slug]],
		["p", ["a", { href: "#" + block.slug }, button("Open in Canvas")]],
		["p", [
			"a",
			{ href: "https://are.na/channel/" + block.slug },
			button("View on Are.na"),
		]],
	],
	topBar: [],
	bottomBar: [],
	attributes: {},
});

const builtinRenderers = [
	{ match: (block) => block.state == "processing", render: ProcessingBlock },
	{ match: (block) => block.type == "Text", render: TextBlock },
	{ match: (block) => block.type == "Image", render: ImageBlock },
	{ match: (block) => block.type == "Embed", render: EmbedBlock },
	{ match: (block) => block.type == "Attachment", render: AttachmentBlock },
	{ match: (block) => block.type == "Link", render: LinkBlock },
	{ match: (block) => block.type == "Media", render: MediaBlock },
	{ match: (block) => block.type == "Channel", render: Channel },
];

// Built-ins use the same public registration path as future plugins.
register({
	id: "builtin-block-renderers",
	setup: (controller) => {
		let unregister = builtinRenderers.map((renderer) =>
			controller.registerRenderer(renderer)
		);
		return () => unregister.forEach((removeRenderer) => removeRenderer());
	},
});
