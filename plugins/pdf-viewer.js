/* A deliberately small PDF renderer for Arena blocks.
 *
 * There is no virtualisation, sidebar, or cache here. The viewer keeps one
 * canvas and one selectable text layer, and renders one page at a time. This
 * makes the renderer useful as a dependable baseline before adding more PDF
 * features.
 */
import {
	getDocument,
	GlobalWorkerOptions,
	TextLayer,
} from "../pdfjs/build/pdf.mjs";
import { dom } from "../dom.js";
import { parse_arena_block_url } from "../md.js";

GlobalWorkerOptions.workerSrc = new URL(
	"../pdfjs/build/pdf.worker.mjs",
	import.meta.url,
).href;

const CMAP_URL = new URL("../pdfjs/web/cmaps/", import.meta.url).href;
const STANDARD_FONT_URL = new URL(
	"../pdfjs/web/standard_fonts/",
	import.meta.url,
).href;
const WASM_URL = new URL("../pdfjs/web/wasm/", import.meta.url).href;

// Persistent for the lifetime of this plugin module.
const pdfHighlightTable = {};
const pdfBlockInstances = new Map();

const button = (label, onclick, title = label) => dom([
	"button",
	{
		type: "button",
		title,
		"aria-label": title,
		onclick,
	},
	label,
]);

export class PDFViewer {
	constructor(url, blockId) {
		this.url = url;
		this.blockId = String(blockId);
		this.pdf = null;
		this.loadingTask = null;
		this.renderTask = null;
		this.textLayerTask = null;
		this.textContentItems = [];
		this.pageNumber = 1;
		this.request = 0;
		this.destroyed = false;

		this.canvas = dom(["canvas.pdf-simple-canvas"]);
		this.annotationLayer = dom(["div.pdf-simple-annotation-layer"]);
		this.textLayer = dom([
			"div.pdf-simple-text-layer.textLayer",
			{
				// Let the browser perform normal text selection, but do not let
				// Arena's draggable block consume the pointer gesture.
				onpointerdown: (event) => event.stopPropagation(),
				oncontextmenu: (event) => this.showSelectionMenu(event),
			},
		]);
		this.selectionChange = () => this.logSelection();
		document.addEventListener("selectionchange", this.selectionChange);
		this.currentSelection = null;
		this.selectionMenu = null;
		this.pendingNavigation = null;
		this.status = dom(["span.pdf-simple-status", "Loading PDF…"]);
		this.pageLabel = dom(["span.pdf-simple-page-label", "Page 1 / —"]);
		this.selectionInput = dom([
			"input.pdf-selection-input",
			{
				type: "text",
				placeholder: "start,end,start,end",
				title: "Enter text selection offsets and press Enter",
				"aria-label": "PDF text selection offsets",
				onkeydown: (event) => {
					if (event.key == "Enter") {
						event.preventDefault();
						this.addSelection(this.selectionInput.value);
					}
				},
			},
		]);
		this.selectionInput.disabled = true;
		this.previous = button("previous", () => this.showPage(this.pageNumber - 1), "Previous page");
		this.next = button("next", () => this.showPage(this.pageNumber + 1), "Next page");
		this.rerender = button(
			"re-render",
			() => this.rerenderCurrentPage(),
			"Re-render current page",
		);
		this.retry = button("retry", () => this.load(), "Retry loading PDF");
		this.retry.hidden = true;

		this.page = dom([
			".pdf-simple-page",
			this.canvas,
			this.annotationLayer,
			this.textLayer,
		]);
		this.root = dom([
			".pdf-simple-viewer",
			[
				".pdf-simple-toolbar",
				this.previous,
				this.next,
				this.rerender,
				this.pageLabel,
				this.selectionInput,
				this.status,
				this.retry,
			],
			this.page,
		]);
		this.root.pdfViewer = this;
		this.dismissSelectionMenu = () => {
			if (!this.selectionMenu) return;
			this.selectionMenu.remove();
			this.selectionMenu = null;
		};

		this.dismissSelectionMenuOnKeydown = () => this.dismissSelectionMenu();
		this.dismissSelectionMenuOnPointerdown = (event) => {
			if (!this.selectionMenu?.contains(event.target)) this.dismissSelectionMenu();
		};
		document.addEventListener("keydown", this.dismissSelectionMenuOnKeydown);
		document.addEventListener("pointerdown", this.dismissSelectionMenuOnPointerdown, true);
		// block.js mounts renderer bodies synchronously. Wait one turn so the
		// canvas has its real block dimensions before calculating its scale.
		setTimeout(() => this.load(), 0);
	}

	async load() {
		if (this.destroyed) return;
		const request = ++this.request;
		this.cancelRender();
		if (this.loadingTask) {
			this.loadingTask.destroy().catch(() => {});
			this.loadingTask = null;
		}
		this.pdf = null;
		this.textContentItems = [];
		this.currentSelection = null;
		this.selectionInput.value = "";
		this.textLayer.replaceChildren();
		this.pageNumber = 1;
		this.retry.hidden = true;
		this.previous.disabled = true;
		this.next.disabled = true;
		this.rerender.disabled = true;
		this.pageLabel.textContent = "Page 1 / —";
		this.selectionInput.disabled = true;
		this.status.textContent = "Loading PDF…";

		try {
			const loadingTask = getDocument({
				url: this.url,
				cMapUrl: CMAP_URL,
				cMapPacked: true,
				standardFontDataUrl: STANDARD_FONT_URL,
				wasmUrl: WASM_URL,
			});
			this.loadingTask = loadingTask;
			loadingTask.onProgress = ({ loaded, total }) => {
				if (request != this.request || this.destroyed) return;
				this.status.textContent = total
					? `Loading PDF… ${Math.round(loaded / total * 100)}%`
					: "Loading PDF…";
			};

			const pdf = await loadingTask.promise;
			if (request != this.request || this.destroyed) {
				await loadingTask.destroy();
				return;
			}
			this.pdf = pdf;
			this.pageLabel.textContent = `Page 1 / ${pdf.numPages}`;
			await this.showPage(1, request);
			const pendingNavigation = this.pendingNavigation;
			this.pendingNavigation = null;
			if (pendingNavigation) {
				if (pendingNavigation.page == 1) {
					this.currentSelection = {
						page: pendingNavigation.page,
						value: pendingNavigation.selection,
					};
					this.selectionInput.value = pendingNavigation.selection;
				} else {
					const rendered = await this.showPage(pendingNavigation.page);
					if (rendered && !this.destroyed) {
						this.currentSelection = {
							page: pendingNavigation.page,
							value: pendingNavigation.selection,
						};
						this.selectionInput.value = pendingNavigation.selection;
					}
				}
			}
		} catch (error) {
			if (request != this.request || this.destroyed) return;
			console.error("Could not load PDF", error);
			this.status.textContent = error?.message || "Could not load PDF";
			this.retry.hidden = false;
		}
	}

	async showPage(number, request = this.request) {
		if (!this.pdf || request != this.request || this.destroyed) return;
		if (number < 1 || number > this.pdf.numPages) return;
		const pageRequest = ++this.request;
		this.cancelRender();
		this.pageNumber = number;
		this.currentSelection = null;
		this.selectionInput.value = "";
		this.status.textContent = "Rendering…";
		this.selectionInput.disabled = true;
		this.pageLabel.textContent = `Page ${number} / ${this.pdf.numPages}`;
		this.previous.disabled = number == 1;
		this.next.disabled = number == this.pdf.numPages;
		this.rerender.disabled = false;

		let page;
		let renderTask;
		let textLayerTask;
		try {
			page = await this.pdf.getPage(number);
			if (pageRequest != this.request || this.destroyed) return;

			const textContent = await page.getTextContent({
				includeMarkedContent: true,
				disableNormalization: true,
			});
			if (pageRequest != this.request || this.destroyed) return;
			this.textContentItems = textContent.items.filter((item) => item.str !== undefined);

			const naturalViewport = page.getViewport({ scale: 1 });
			const pageContainer = this.page;
			const availableWidth = Math.max(1, pageContainer.clientWidth - 16);
			const availableHeight = Math.max(1, pageContainer.clientHeight - 16);
			const scale = Math.min(
				availableWidth / naturalViewport.width,
				availableHeight / naturalViewport.height,
			);
			const viewport = page.getViewport({ scale: scale > 0 ? scale : 1 });
			const outputScale = Math.min(window.devicePixelRatio || 1, 2);

			this.canvas.width = Math.ceil(viewport.width * outputScale);
			this.canvas.height = Math.ceil(viewport.height * outputScale);
			this.canvas.style.width = `${viewport.width}px`;
			this.canvas.style.height = `${viewport.height}px`;
			this.textLayer.replaceChildren();
			this.textLayer.style.setProperty("--pdf-text-layer-width", `${viewport.width}px`);
			this.textLayer.style.setProperty("--pdf-text-layer-height", `${viewport.height}px`);
			this.textLayer.style.setProperty("--total-scale-factor", String(scale));
			this.annotationLayer.style.width = `${viewport.width}px`;
			this.annotationLayer.style.height = `${viewport.height}px`;
			textLayerTask = new TextLayer({
				textContentSource: textContent,
				container: this.textLayer,
				viewport,
			});
			this.textLayerTask = textLayerTask;
			// pdf.js sets these dimensions with CSS round(), which is not
			// supported by every browser. Use the same values without rounding.
			this.textLayer.style.width = "calc(var(--pdf-text-layer-width))";
			this.textLayer.style.height = "calc(var(--pdf-text-layer-height))";
			const context = this.canvas.getContext("2d", { alpha: false });
			renderTask = page.render({
				canvasContext: context,
				viewport,
				transform: outputScale == 1
					? null
					: [outputScale, 0, 0, outputScale, 0, 0],
				background: "white",
			});
			this.renderTask = renderTask;
			await Promise.all([
				renderTask.promise,
				textLayerTask.render(),
			]);
			if (pageRequest != this.request || this.destroyed) return;
			this.decorateTextLayer(textLayerTask);
			this.renderHighlights();
			this.selectionInput.disabled = false;
			this.status.textContent = "";
			return true;
		} catch (error) {
			if (this.isCancellation(error) || pageRequest != this.request || this.destroyed) return;
			console.error(`Could not render PDF page ${number}`, error);
			this.status.textContent = error?.message || "Could not render page";
		} finally {
			if (this.renderTask === renderTask) this.renderTask = null;
			if (this.textLayerTask === textLayerTask) this.textLayerTask = null;
			page?.cleanup();
		}
	}

	decorateTextLayer(textLayerTask) {
		// TextLayer keeps textDivs in the same order as the text items passed
		// to it. Empty items have no DOM span, but their index is still kept.
		for (const [index, textDiv] of textLayerTask.textDivs.entries()) {
			if (!textDiv.isConnected) continue;
			textDiv.classList.add("pdf-text-layer-node");
			textDiv.dataset.idx = String(index);
		}
	}

	getTextLayerNode(node) {
		if (!node || !this.textLayer.contains(node)) return null;
		const element = node.nodeType == Node.ELEMENT_NODE
			? node
			: node.parentElement;
		const textDiv = element?.closest(".pdf-text-layer-node");
		return textDiv && this.textLayer.contains(textDiv) ? textDiv : null;
	}

	getOffsetInTextLayerNode(textDiv, node, offset) {
		if (!textDiv || !textDiv.contains(node)) return null;
		if (node == textDiv) {
			return Array.from(node.childNodes)
				.slice(0, offset)
				.reduce((total, child) => total + (child.textContent?.length || 0), 0);
		}

		const iterator = document.createNodeIterator(textDiv, NodeFilter.SHOW_ALL);
		let current;
		let result = 0;
		while ((current = iterator.nextNode())) {
			if (current == node) {
				if (node.nodeType == Node.TEXT_NODE) result += offset;
				else {
					result += Array.from(node.childNodes)
						.slice(0, offset)
						.reduce((total, child) => total + (child.textContent?.length || 0), 0);
				}
				return result;
			}
			if (current.nodeType == Node.TEXT_NODE) {
				result += current.textContent?.length || 0;
			}
		}
		return null;
	}

	logSelection() {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed || !selection.rangeCount) return;
		const range = selection.getRangeAt(0);
		if (!this.textLayer.contains(range.startContainer) ||
			!this.textLayer.contains(range.endContainer)) return;

		const startTextDiv = this.getTextLayerNode(range.startContainer);
		const endTextDiv = this.getTextLayerNode(range.endContainer);
		if (!startTextDiv || !endTextDiv) return;

		const beginOffset = this.getOffsetInTextLayerNode(
			startTextDiv,
			range.startContainer,
			range.startOffset,
		);
		const endOffset = this.getOffsetInTextLayerNode(
			endTextDiv,
			range.endContainer,
			range.endOffset,
		);
		if (beginOffset == null || endOffset == null) return;

		const selectionString = [
			Number(startTextDiv.dataset.idx),
			beginOffset,
			Number(endTextDiv.dataset.idx),
			endOffset,
		].join(",");
		this.currentSelection = {
			page: this.pageNumber,
			value: selectionString,
		};
		this.selectionInput.value = selectionString;
		console.log(selectionString);
		return selectionString;
	}

	textNodeIn(textDiv, last = false) {
		const iterator = document.createNodeIterator(textDiv, NodeFilter.SHOW_TEXT);
		const nodes = [];
		let node;
		while ((node = iterator.nextNode())) nodes.push(node);
		return last ? nodes.at(-1) : nodes[0];
	}

	getSelectionRange(value, showError = true) {
		const fail = (message) => {
			if (showError) this.status.textContent = message;
			return null;
		};
		const offsets = value.split(",").map((part) => Number(part.trim()));
		if (offsets.length != 4 || offsets.some((offset) => !Number.isInteger(offset) || offset < 0)) {
			return fail("Use start,end,start,end");
		}

		const [beginIndex, beginOffset, endIndex, endOffset] = offsets;
		if (beginIndex > endIndex || beginIndex == endIndex && beginOffset > endOffset) {
			return fail("Selection start must come before its end");
		}
		const textDivs = Array.from(
			this.textLayer.querySelectorAll(".pdf-text-layer-node[data-idx]"),
		);
		const startTextDiv = textDivs.find(
			(textDiv) => Number(textDiv.dataset.idx) == beginIndex,
		);
		const endTextDiv = textDivs.find(
			(textDiv) => Number(textDiv.dataset.idx) == endIndex,
		);
		const startNode = startTextDiv ? this.textNodeIn(startTextDiv) : null;
		const endNode = endTextDiv ? this.textNodeIn(endTextDiv, true) : null;
		if (!startNode || !endNode ||
			beginOffset > startNode.textContent.length ||
			endOffset > endNode.textContent.length) {
			return fail("Selection is not available on this page");
		}

		try {
			const range = document.createRange();
			range.setStart(startNode, beginOffset);
			range.setEnd(endNode, endOffset);
			return { offsets, range };
		} catch (error) {
			console.warn("Could not create PDF text selection", error);
			return fail("Could not highlight selection");
		}
	}

	openSelection(page, selection) {
		const navigation = { page: Number(page), selection };
		if (!this.pdf) {
			this.pendingNavigation = navigation;
			return;
		}
		this.showPage(navigation.page).then((rendered) => {
			if (rendered && !this.destroyed) {
				this.currentSelection = { page: navigation.page, value: selection };
				this.selectionInput.value = selection;
			}
		});
	}

	addSelection(value) {
		const parsed = this.getSelectionRange(value);
		if (!parsed) return;
		const selectionString = parsed.offsets.join(",");
		const blockSelections = pdfHighlightTable[this.blockId] ||= {};
		const pageSelections = blockSelections[this.pageNumber] ||= [];
		if (!pageSelections.includes(selectionString)) pageSelections.push(selectionString);
		this.currentSelection = { page: this.pageNumber, value: selectionString };
		this.selectionInput.value = selectionString;
		this.renderHighlights();
	}

	showSelectionMenu(event) {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed || !selection.rangeCount) return;
		if (!this.currentSelection || this.currentSelection.page != this.pageNumber) {
			this.logSelection();
		}
		if (!this.currentSelection || this.currentSelection.page != this.pageNumber) return;

		event.preventDefault();
		event.stopPropagation();
		this.dismissSelectionMenu();

		const page = this.currentSelection.page;
		const selectionString = this.currentSelection.value;
		const link = `https://are.na/block/${encodeURIComponent(this.blockId)}?page=${page}&selection=${selectionString}`;
		const selectedText = selection.toString().trim();
		const copy = (value) => {
			navigator.clipboard.writeText(value)
				.catch((error) => console.warn("Could not copy PDF link", error));
			this.dismissSelectionMenu();
		};
		const menu = dom([
			"div.pdf-selection-menu",
			{
				role: "menu",
				tabIndex: 0,
			},
			button(
				"copy as markdown link",
				(event) => {
					event.preventDefault();
					event.stopPropagation();
					copy(`[pg, ${page}](${link})`);
				},
			),
			button(
				"copy link and text",
				(event) => {
					event.preventDefault();
					event.stopPropagation();
					copy(`${selectedText}\n[pg, ${page}](${link})`);
				},
			),
		]);
		menu.style.position = "fixed";
		menu.style.left = `${event.clientX}px`;
		menu.style.top = `${event.clientY}px`;
		document.body.append(menu);
		this.selectionMenu = menu;
	}

	renderHighlights() {
		this.annotationLayer.replaceChildren();
		const selections = pdfHighlightTable[this.blockId]?.[this.pageNumber] || [];
		for (const selection of selections) {
			const parsed = this.getSelectionRange(selection, false);
			if (parsed) this.createHighlight(parsed.range);
		}
	}

	createHighlight(range) {
		const annotationLayerRect = this.annotationLayer.getBoundingClientRect();
		const annotationScaleX = this.annotationLayer.offsetWidth
			? annotationLayerRect.width / this.annotationLayer.offsetWidth
			: 1;
		const annotationScaleY = this.annotationLayer.offsetHeight
			? annotationLayerRect.height / this.annotationLayer.offsetHeight
			: 1;

		for (const rect of range.getClientRects()) {
			if (!rect.width || !rect.height) continue;

			// Range rectangles are in viewport pixels. The annotation layer is
			// transformed, so convert them to its untransformed local pixels.
			const highlight = dom(["div.pdf-simple-highlight"]);
			highlight.style.left = `${(rect.left - annotationLayerRect.left) / annotationScaleX}px`;
			highlight.style.top = `${(rect.top - annotationLayerRect.top) / annotationScaleY}px`;
			highlight.style.width = `${rect.width / annotationScaleX}px`;
			highlight.style.height = `${rect.height / annotationScaleY}px`;
			this.annotationLayer.append(highlight);
		}
	}

	rerenderCurrentPage() {
		// This deliberately calls showPage rather than load: the existing PDF
		// document and worker stay alive, while the current page gets a new
		// viewport based on the viewer's current size.
		if (this.pdf) this.showPage(this.pageNumber);
	}

	isCancellation(error) {
		return error?.name == "RenderingCancelledException" ||
			error?.name == "AbortException" ||
			/cancel|abort/i.test(error?.message || "");
	}

	cancelRender() {
		this.dismissSelectionMenu?.();
		if (this.renderTask) {
			this.renderTask.cancel();
			this.renderTask = null;
		}
		if (this.textLayerTask) {
			this.textLayerTask.cancel();
			this.textLayerTask = null;
		}
		this.textLayer?.replaceChildren();
		this.annotationLayer?.replaceChildren();
	}

	destroy() {
		if (this.destroyed) return;
		this.destroyed = true;
		this.request++;
		this.cancelRender();
		this.loadingTask?.destroy().catch(() => {});
		this.loadingTask = null;
		document.removeEventListener("selectionchange", this.selectionChange);
		document.removeEventListener("keydown", this.dismissSelectionMenuOnKeydown);
		document.removeEventListener("pointerdown", this.dismissSelectionMenuOnPointerdown, true);
		document.removeEventListener("focusin", this.dismissSelectionMenuOnFocusin, true);
		this.dismissSelectionMenu();
		this.root.removeEventListener(
			"pdf-selection-menu-dismiss",
			this.dismissSelectionMenu,
		);
		this.pdf = null;
	}
}

export const PDFBlock = (block) => {
	const imageUrl = block.image?.large?.src || block.image?.large?.url;
	let viewer;

	const preview = dom([
		".pdf-simple-preview",
		imageUrl
			? ["img", { src: imageUrl, alt: block.title || "PDF preview" }]
			: ["p", "PDF preview unavailable"],
		,
	]);

	const mountViewer = () => {
		if (viewer) return viewer;
		viewer = new PDFViewer(block.attachment?.url, block.id);
		preview.replaceWith(viewer.root);
		return viewer;
	};
	pdfBlockInstances.set(String(block.id), { mount: mountViewer });

	return {
		body: preview,
		topBar: [],
		bottomBar: [button("load PDF", mountViewer, "Load PDF")],
		attributes: {},
	};
};

const pdfRenderer = {
	match: (block) =>
		block.type == "Attachment" &&
		block.attachment?.file_extension?.toLowerCase() == "pdf",
	render: PDFBlock,
};

export default {
	id: "pdf-viewer",
	name: "PDF viewer",
	description: "Renders PDF attachments with page navigation, selectable text, highlights, and shareable selection links.",
	setup(controller) {
		const unregisterRenderer = controller.registerRenderer(pdfRenderer);
		const unregisterLinkHook = controller.registerHook(
			"markdown:link",
			({ children, attributes }) => {
				const parsed = parse_arena_block_url(attributes.href);
				if (!parsed) return;

				const page = Number(parsed.url.searchParams.get("page"));
				const selection = parsed.url.searchParams.get("selection");
				if (!Number.isInteger(page) || page < 1 || !selection) return;

				const offsets = selection.split(",").map((part) => Number(part.trim()));
				if (offsets.length != 4 ||
					offsets.some((offset) => !Number.isInteger(offset) || offset < 0)) return;
				const selectionString = offsets.join(",");
				const blockSelections = pdfHighlightTable[parsed.id] ||= {};
				const pageSelections = blockSelections[page] ||= [];
				if (!pageSelections.includes(selectionString)) pageSelections.push(selectionString);

				return {
					handled: true,
					body: [
						"button.pdf-selection-link",
						{
							type: "button",
							onclick: (event) => {
								event.preventDefault();
								controller.focusBlock(parsed.id);
								const instance = pdfBlockInstances.get(String(parsed.id));
								const viewer = instance?.mount();
								viewer?.openSelection(page, selectionString);
							},
						},
						...children,
					],
				};
			},
			{ priority: 10 },
		);

		return () => {
			unregisterLinkHook();
			unregisterRenderer();
		};
	},
};
