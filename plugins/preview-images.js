import { parse_arena_block_url } from "../md.js";
import { dom } from "../dom.js";

const PreviewBlockLink = {
	id: "builtin-preview-block-links",

	setup(controller) {
		// --------------------------------
		// Create data to later switch out
		// --------------------------------
		let markPreviewLinks = 
		controller.registerHook("markdown:link",

			({ children, attributes }) => {
				let blockId = parse_arena_block_url(attributes.href)?.id;
				let label = textContent(children).trim().toLowerCase();
				if (!blockId ) return;

			  if ( label == "clip:preview"
					|| label == "image"
					|| label == "video") {
					return { 
						handled: true,
						body: ['.preview', { "data-preview-block": blockId, }, 'loading...']
					}
				}

				else {
					return
				}
			},

			{ priority: 10 },
		);

		// --------------------------------
		// Switch it out after being rendered
		// --------------------------------
		let renderPreviews = 
		controller.registerHook("markdown:after-rendered",

			({ element }) => {
				if (!element?.querySelectorAll) return;

				element.querySelectorAll("[data-preview-block]").forEach((link) => {
					if (link.dataset.previewMounted) return;
					link.dataset.previewMounted = "true";

					let preview = dom([
						".markdown-link-preview",
						"Loading…",
					]);

					link.innerHTML = ''
					link.appendChild(preview)

					let id = link.getAttribute("data-preview-block");
					controller.getBlock(id)
						.then((block) => {
							preview.replaceWith(dom([
								".markdown-link-preview",
								previewBody(block),
							]));
						})
						.catch(() => {
							preview.textContent = "Preview unavailable";
						});
				});
			},
		);

		return () => {
			markPreviewLinks();
			renderPreviews();
		};
	},
};

// --------------------------------
// Helpers
// --------------------------------
const textContent = (value, isNodeDescription = false) => {
	if (typeof value == "string") return value;
	if (!Array.isArray(value)) return "";

	let contents = isNodeDescription && typeof value[0] == "string"
		? value.slice(1)
		: value;
	return contents.map((item) =>
		textContent(item, Array.isArray(item))
	).join("");
};

const previewBody = (block) => {
	if (!block) return ["span", "Preview unavailable"];

	let image = block.image?.large?.src || block.image?.large?.url;
	if (image) return ["img", { src: image, alt: block.title || "" }];

	if (block.type == "Text" && block.content?.markdown) {
		let text = block.content.markdown;
		if (text.length > 240) text = text.slice(0, 240) + "…";
		return ["span", text];
	}

	if (block.title) return ["span", block.title];
	if (block.source?.url) {
		return ["a", {
			href: block.source.url,
			target: "_blank",
		}, block.source.url];
	}

	return ["span", "Preview unavailable"];
};


export default PreviewBlockLink ;
