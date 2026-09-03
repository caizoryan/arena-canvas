import { get_channel_contents } from "../arena.js";
import { dom } from "../dom.js";

const CONTENTS_PER_PAGE = 8;
const MAX_PREVIEWS = 8;
const channelRequests = new Map();

const imageUrl = (block) =>
	block.image?.small?.src ||
	block.image?.small?.url ||
	block.image?.thumb?.src ||
	block.image?.thumb?.url ||
	block.image?.large?.src ||
	block.image?.large?.url;

const previewText = (block) => {
	if (block.type == "Text") {
		return block.content?.markdown || block.title || "Untitled text block";
	}

	return block.title || block.source?.url || block.type || "Untitled block";
};

const blockPreview = (block, controller) => {
	let image = imageUrl(block);
	let label = String(previewText(block)).replace(/\s+/g, " ").trim();
	if (label.length > 90) label = label.slice(0, 87) + "…";

	let preview = dom([
		"button.channel-preview-card",
		{
			type: "button",
			onpointerdown: (event) => event.stopPropagation(),
			title: label,
			"aria-label": label,
			onclick: (event) => {
				event.preventDefault();
				event.stopPropagation();
				controller.focusBlock(block.id);
			},
		},
		image
			? ["img", { src: image, alt: label, loading: "lazy" }]
			: ["span.channel-preview-text", label],
		["span.channel-preview-label", label],
	]);

	return preview;
};

const fetchPreviews = (slug) => {
	if (!slug) return Promise.resolve([]);

	let request = channelRequests.get(slug);
	if (request) return request;

	request = get_channel_contents(slug, 1, CONTENTS_PER_PAGE)
		.then((response) => {
			if (!Array.isArray(response?.data)) throw new Error("Channel contents unavailable");
			return response.data
				.filter((block) => block.title != ".canvas")
				.slice(0, MAX_PREVIEWS);
		})
		.catch((error) => {
			channelRequests.delete(slug);
			throw error;
		});
	channelRequests.set(slug, request);
	return request;
};

const renderChannel = (channel, controller) => {
	let grid = dom([
		".channel-preview-grid",
		[".channel-preview-status", "Loading…"],
	]);
	let root = dom([
		".block.channel.channel-renderer",
		["h2", channel.title || channel.slug || "Channel"],
		["h4", channel.slug || ""],
		["p", [
			"a",
			{ href: "#" + channel.slug },
			"Open in Canvas",
		]],
		["p", [
			"a",
			{
				href: "https://are.na/channel/" + channel.slug,
				target: "_blank",
			},
			"View on Are.na",
		]],
		grid,
	]);

	fetchPreviews(channel.slug).then((blocks) => {
		if (!root.isConnected) return;
		grid.replaceChildren();
		if (!blocks.length) {
			grid.appendChild(dom([".channel-preview-status", "No blocks in this channel."]));
			return;
		}

		blocks.forEach((block) => grid.appendChild(blockPreview(block, controller)));
	}).catch(() => {
		if (!root.isConnected) return;
		grid.replaceChildren(dom([".channel-preview-status", "Could not load channel previews."]));
	});

	return {
		body: root,
		topBar: [],
		bottomBar: [],
		attributes: {},
	};
};

const channelRenderer = {
	id: "channel-renderer",
	name: "Channel previews",
	description: "Loads channel contents and displays their blocks as a two-column grid of square previews.",
	setup(controller) {
		return controller.registerRenderer({
			match: (block) => block.type == "Channel",
			render: (block) => renderChannel(block, controller),
		});
	},
};

export default channelRenderer;
