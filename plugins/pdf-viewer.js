/* A deliberately small PDF renderer for Arena blocks.
 *
 * There is no virtualisation, text layer, sidebar, or cache here. The viewer
 * keeps one canvas and renders one page at a time. This makes the renderer
 * useful as a dependable baseline before adding more PDF features.
 */
import {
	getDocument,
	GlobalWorkerOptions,
} from "../pdfjs/build/pdf.mjs";
import { dom } from "../dom.js";

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
	constructor(url) {
		this.url = url;
		this.pdf = null;
		this.loadingTask = null;
		this.renderTask = null;
		this.pageNumber = 1;
		this.request = 0;
		this.destroyed = false;

		this.canvas = dom(["canvas.pdf-simple-canvas"]);
		this.status = dom(["span.pdf-simple-status", "Loading PDF…"]);
		this.pageLabel = dom(["span.pdf-simple-page-label", "Page 1 / —"]);
		this.previous = button("previous", () => this.showPage(this.pageNumber - 1), "Previous page");
		this.next = button("next", () => this.showPage(this.pageNumber + 1), "Next page");
		this.retry = button("retry", () => this.load(), "Retry loading PDF");
		this.retry.hidden = true;

		this.root = dom([
			".pdf-simple-viewer",
			[
				".pdf-simple-toolbar",
				this.previous,
				this.next,
				this.pageLabel,
				this.status,
				this.retry,
			],
			[".pdf-simple-page", this.canvas],
		]);
		this.root.pdfViewer = this;

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
		this.pageNumber = 1;
		this.retry.hidden = true;
		this.previous.disabled = true;
		this.next.disabled = true;
		this.pageLabel.textContent = "Page 1 / —";
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
		this.status.textContent = "Rendering…";
		this.pageLabel.textContent = `Page ${number} / ${this.pdf.numPages}`;
		this.previous.disabled = number == 1;
		this.next.disabled = number == this.pdf.numPages;

		let page;
		let renderTask;
		try {
			page = await this.pdf.getPage(number);
			if (pageRequest != this.request || this.destroyed) return;

			const naturalViewport = page.getViewport({ scale: 1 });
			const pageContainer = this.canvas.parentElement;
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
			await renderTask.promise;
			if (pageRequest != this.request || this.destroyed) return;
			this.status.textContent = "";
		} catch (error) {
			if (this.isCancellation(error) || pageRequest != this.request || this.destroyed) return;
			console.error(`Could not render PDF page ${number}`, error);
			this.status.textContent = error?.message || "Could not render page";
		} finally {
			if (this.renderTask === renderTask) this.renderTask = null;
			page?.cleanup();
		}
	}

	isCancellation(error) {
		return error?.name == "RenderingCancelledException" ||
			error?.name == "AbortException" ||
			/cancel|abort/i.test(error?.message || "");
	}

	cancelRender() {
		if (!this.renderTask) return;
		this.renderTask.cancel();
		this.renderTask = null;
	}

	destroy() {
		if (this.destroyed) return;
		this.destroyed = true;
		this.request++;
		this.cancelRender();
		this.loadingTask?.destroy().catch(() => {});
		this.loadingTask = null;
		this.pdf = null;
	}
}

export const PDFBlock = (block) => ({
	body: new PDFViewer(block.attachment?.url).root,
	topBar: [],
	bottomBar: [],
	attributes: {},
});

const pdfRenderer = {
	match: (block) =>
		block.type == "Attachment" &&
		block.attachment?.file_extension?.toLowerCase() == "pdf",
	render: PDFBlock,
};

export default {
	id: "pdf-viewer",
	setup: (controller) => controller.registerRenderer(pdfRenderer),
};
