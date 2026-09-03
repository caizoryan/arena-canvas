import { reactive } from "./chowk.js";
import {
	BlockElement,
	constructBlockData,
	constructGroupData,
	GroupElement,
	isRectContained,
	isRectIntersecting,
	Transform,
} from "./block.js";
import { addNode, state, store } from "./state.js";
import { add_block } from "./arena.js";

let anchor = undefined;

let startX = reactive(0);
let startY = reactive(0);
let endX = reactive(0);
let endY = reactive(0);

export let dragTransforms = { startX, startY, endX, endY };

/** @type {( "pan" | "making-block" | 'making-group' | 'select' | 'zoom')}*/
let dragAction = "pan";

export let dragOperations = {
	onpointerdown: (e) => {
		let target = e.target;
		if (e.target != document.querySelector(".container")) return;
		// state.selected.next([])

		state.canceled.next(false);
		state.selected.next([]);

		let rect = target.getBoundingClientRect();
		let localX = (e.clientX - rect.left) / state.canvasScale.value();
		let localY = (e.clientY - rect.top) / state.canvasScale.value();
		startX.next(localX);
		startY.next(localY);
		endX.next(localX);
		endY.next(localY);

		target.setPointerCapture(e.pointerId);

		if (e.altKey) {
			dragAction = "zoom";
			state.dragMode.next("zoom");
		} else if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
			dragAction = "making-group";
		} else if (e.shiftKey) {
			dragAction = "select";
		} else if (e.metaKey || e.ctrlKey) {
			dragAction = "making-block";
		} else {
			anchor = {
				x: state.canvasX.value(),
				y: state.canvasY.value(),
				scale: state.canvasScale.value(),
			};

			state.holdingCanvas.next(true);
		}
	},
	onpointermove: (e) => {
		let target = e.target;

		if (!target.hasPointerCapture(e.pointerId)) return;

		const deltaX = e.movementX / state.canvasScale.value();
		const deltaY = e.movementY / state.canvasScale.value();
		endX.next((v) => v + deltaX);
		endY.next((v) => v + deltaY);

		if (anchor) {
			state.canvasX.next(anchor.x + startX.value() - endX.value());
			state.canvasY.next(anchor.y + startY.value() - endY.value());
		}
	},
	onpointerup: (e) => {
		let target = e.target;
		state.holdingCanvas.next(false);
		let pointsToAt = (x1, y1, x2, y2) => ({
			x: Math.min(x1, x2),
			y: Math.min(y1, y2),
			width: Math.abs(x2 - x1),
			height: Math.abs(y2 - y1),
		});
		let { x, y, width, height } = pointsToAt(
			startX.value(),
			startY.value(),
			endX.value(),
			endY.value(),
		);

		target.releasePointerCapture(e.pointerId);

		startX.next(0);
		startY.next(0);
		endX.next(0);
		endY.next(0);

		if (anchor) {
			anchor = undefined;
			return;
		}

		if (state.canceled.value()) {
			state.canceled.next(false);
			return;
		}

		if (dragAction == "making-block") {
			dragAction = "pan";
			if (width < 150 || height < 150) return;
			add_block(state.currentSlug.value(), "", "# New Block")
				.then((res) => {
					let newBlock = constructBlockData(res, { x, y, width, height });
					addNode(newBlock);
					document.querySelector(".container").appendChild(BlockElement(res));
				});
		} else if (dragAction == "making-group") {
			dragAction = "pan";
			if (width < 250 || height < 250) return;
			let d = constructGroupData(x, y, width, height);
			addNode(d);
			document.querySelector(".container").appendChild(GroupElement(d));
		} else if (dragAction == "zoom") {
			dragAction = "pan";
			state.dragMode.next("");
			if (width < 50 || height < 50) return;

			let newScale = Math.min(
				window.innerWidth / width,
				window.innerHeight / height,
			);
			newScale = Math.max(0.2, Math.min(2.3, newScale));

			let rectCenterX = x + width / 2;
			let rectCenterY = y + height / 2;
			let newCanvasX = rectCenterX - (window.innerWidth / 2) / newScale;
			let newCanvasY = rectCenterY - (window.innerHeight / 2) / newScale;

			state.canvasScale.next(newScale);
			state.canvasX.next(newCanvasX);
			state.canvasY.next(newCanvasY);
		} else if (dragAction == "select") {
			dragAction = "pan";
			let nodes = store.get(["data", "nodes"]);
			let selection = [];
			nodes.forEach((node) => {
				let fn = isRectIntersecting;
				if (node.type == "group") fn = isRectContained;
				fn(Transform(x, y, width, height), node)
					? selection.push(node.id)
					: null;
			});

			state.selected.next(selection);
		}
	},
};
