import { memo, reactive } from "./chowk.js";
import { dom } from "./dom.js";
import { drag } from "./drag.js";
import { round } from "./script.js";
import { controller } from "./plugin.js";
import { getNodeLocation, state, store } from "./state.js";
import { svgx } from "./svg.js";
import { registerSelectionDrag } from "./selection-drag.js";

export let mountBoundingBox = () => {
	let anchored = [];
	let boundingAnchor = {};
	let resizeAnchor;

	// This lets the bounding box recalculate after a resize without causing
	// anchored to be rebuilt. anchored must stay based on the original selection.
	let dimChanged = reactive(0);

	let updateAnchored = (selection) => {
		anchored = [];
		selection.forEach((e) => {
			anchored.push({
				blockLocation: getNodeLocation(e.id),
				offset: {
					x: e.x,
					y: e.y,
					width: e.width,
					height: e.height,
				},
			});
		});
	};

	let selectionMemo = memo(() => {
		let selection = store.get(["data", "nodes"])
			.filter((e) => state.selected.value().includes(e.id));

		updateAnchored(selection);
		return selection;
	}, [state.selected]);

	let dimsMemo = memo(() => {
		let selection = selectionMemo.value();
		let dimension = selection.reduce((acc, e, i) => {
			if (i == 0) {
				Object.assign(acc, {
					x: e.x,
					y: e.y,
					x2: e.x + e.width,
					y2: e.y + e.height,
				});
			} else {
				acc.x = Math.min(acc.x, e.x);
				acc.y = Math.min(acc.y, e.y);
				acc.x2 = Math.max(acc.x2, e.x + e.width);
				acc.y2 = Math.max(acc.y2, e.y + e.height);
			}

			return acc;
		}, {});

		return { dimension, selection };
	}, [selectionMemo, dimChanged]);

	let dawgWalkers = memo(() => {
		let { dimension, selection } = dimsMemo.value();

		boundingAnchor = {
			x: dimension.x,
			y: dimension.y,
			width: dimension.x2 - dimension.x,
			height: dimension.y2 - dimension.y,
		};

		if (selection.length > 1) {
			return `
			left: ${dimension.x}px;
			top: ${dimension.y}px;
			width: ${dimension.x2 - dimension.x}px;
			height: ${dimension.y2 - dimension.y}px;
			border: 4px solid var(--bor6);`;
		} else return "display: none;";
	}, [dimsMemo]);

	let handleStyle = (type) => memo(() => {
		let { dimension, selection } = dimsMemo.value();
		if (selection.length <= 1) return "display: none;";

		let width = dimension.x2 - dimension.x;
		let height = dimension.y2 - dimension.y;

		if (type == "corner") {
			return `left: ${width - 15}px; top: ${height - 15}px;`;
		}

		if (type == "east") {
			return `left: ${width - 15}px; top: 15px; width: 30px; height: ${height - 30}px;`;
		}

		return `left: 15px; top: ${height - 15}px; width: ${width - 30}px; height: 30px;`;
	}, [dimsMemo]);

	let MainCorner = dom(
		".absolute.flex-center.box.cur-se",
		{ style: handleStyle("corner") },
		svgx(30),
	);
	let WidthMiddle = dom(
		".absolute.flex-center.box.cur-e",
		{ style: handleStyle("east") },
		svgx(30),
	);
	let HeightMiddle = dom(
		".absolute.flex-center.box.cur-s",
		{ style: handleStyle("south") },
		svgx(30),
	);

	let bigbox = dom(
		".absolute.big-box",
		{ style: dawgWalkers },
		memo(() => {
			let { dimension } = dimsMemo.value();
			let { x2, x, y2, y } = dimension;
			x2 = x2 || 1;
			x = x || 1;
			y = y || 1;
			y2 = y2 || 1;
			return svgx(x2 - x, y2 - y, "#E3CFF5");
		}, [dimsMemo]),
		MainCorner,
		WidthMiddle,
		HeightMiddle,
	);

	let onstart = (items = anchored) => {
		// Saves this location for undo.
		store.startBatch();
		items.forEach((e) => {
			let x = store.get(e.blockLocation.concat(["x"]));
			let y = store.get(e.blockLocation.concat(["y"]));
			store.tr(e.blockLocation, "set", ["x", x]);
			store.tr(e.blockLocation, "set", ["y", y]);
		});
		store.endBatch();
		store.pauseTracking();
	};

	let resetAnchors = () => {
		let selection = store.get(["data", "nodes"])
			.filter((e) => state.selected.value().includes(e.id));

		updateAnchored(selection);
		dimChanged.next((e) => e + 1);
	};

	let onend = (event, changed = true) => {
		store.resumeTracking();
		resetAnchors();
		if (!changed) return;

		controller.dispatchHook("canvas:drag-end", {
			event,
			kind: "selection",
			phase: "move",
			changed,
		});
	};

	let onresizestart = () => {
		// Keep this fixed while the nodes are being resized.
		resizeAnchor = { ...boundingAnchor };

		// Save one undo entry containing the original geometry of every node.
		store.startBatch();
		anchored.forEach((e) => {
			store.tr(e.blockLocation, "set", ["x", e.offset.x]);
			store.tr(e.blockLocation, "set", ["y", e.offset.y]);
			store.tr(e.blockLocation, "set", ["width", e.offset.width]);
			store.tr(e.blockLocation, "set", ["height", e.offset.height]);
		});
		store.endBatch();
		store.pauseTracking();
	};

	let onresizemove = (width, height) => {
		if (!resizeAnchor || !resizeAnchor.width || !resizeAnchor.height) return;

		width = round(width, state.snapSize.value());
		height = round(height, state.snapSize.value());

		let scaleX = width / resizeAnchor.width;
		let scaleY = height / resizeAnchor.height;

		anchored.forEach((e) => {
			store.tr(e.blockLocation, "set", [
				"x",
				resizeAnchor.x + (e.offset.x - resizeAnchor.x) * scaleX,
			]);
			store.tr(e.blockLocation, "set", [
				"y",
				resizeAnchor.y + (e.offset.y - resizeAnchor.y) * scaleY,
			]);
			store.tr(e.blockLocation, "set", [
				"width",
				e.offset.width * scaleX,
			]);
			store.tr(e.blockLocation, "set", [
				"height",
				e.offset.height * scaleY,
			]);
		});

		// dimsMemo uses the fixed anchored snapshot but reads the updated nodes.
		dimChanged.next((e) => e + 1);
	};

	let onresizeend = (event) => {
		store.resumeTracking();
		resetAnchors();
		resizeAnchor = undefined;
		controller.dispatchHook("canvas:drag-end", {
			event,
			kind: "selection",
			phase: "resize",
			changed: true,
		});
	};

	let selectionDragAnchor;
	let selectionMoveAnchored = [];
	let startSelectionDrag = (nodeId) => {
		let { dimension, selection } = dimsMemo.value();
		if (selection.length <= 1) return false;

		// Box drags use the selection's top-left; block drags use that block.
		let node = nodeId === undefined
			? dimension
			: selection.find((item) => item.id == nodeId);
		if (!node) return false;

		boundingAnchor = {
			x: dimension.x,
			y: dimension.y,
			width: dimension.x2 - dimension.x,
			height: dimension.y2 - dimension.y,
		};

		let nodes = store.get(["data", "nodes"]);
		let movable = new Map(selection.map((item) => [item.id, item]));
		selection.filter((item) => item.type == "group").forEach((group) => {
			nodes.forEach((item) => {
				let contains = item.type == "group"
					? item.x >= group.x && item.y >= group.y &&
						item.x + item.width <= group.x + group.width &&
						item.y + item.height <= group.y + group.height
					: item.x < group.x + group.width &&
						item.x + item.width > group.x &&
						item.y < group.y + group.height &&
						item.y + item.height > group.y;
				if (contains) movable.set(item.id, item);
			});
		});

		selectionMoveAnchored = [...movable.values()].map((item) => ({
			blockLocation: getNodeLocation(item.id),
			offset: { x: item.x, y: item.y },
		}));
		selectionDragAnchor = { x: node.x, y: node.y };
		onstart(selectionMoveAnchored);
		return true;
	};

	let setSelectionDragPosition = (x, y) => {
		if (!selectionDragAnchor) return;

		x = round(x, state.snapSize.value());
		y = round(y, state.snapSize.value());
		let diffX = x - selectionDragAnchor.x;
		let diffY = y - selectionDragAnchor.y;

		selectionMoveAnchored.forEach((item) => {
			store.tr(item.blockLocation, "set", ["x", item.offset.x + diffX]);
			store.tr(item.blockLocation, "set", ["y", item.offset.y + diffY]);
		});

		bigbox.style.left = boundingAnchor.x + diffX + "px";
		bigbox.style.top = boundingAnchor.y + diffY + "px";
	};

	let endSelectionDrag = (event, changed) => {
		if (!selectionDragAnchor) return;
		selectionDragAnchor = undefined;
		selectionMoveAnchored = [];
		onend(event, changed);
	};

	registerSelectionDrag({
		start: startSelectionDrag,
		setPosition: setSelectionDragPosition,
		end: endSelectionDrag,
	});

	setTimeout(() => {
		drag(bigbox, {
			set_position: setSelectionDragPosition,
			onstart: () => startSelectionDrag(),
			onend: endSelectionDrag,
		});

		drag(MainCorner, {
			set_position: (x, y) => onresizemove(x + 15, y + 15),
			onstart: onresizestart,
			onend: onresizeend,
		});
		drag(WidthMiddle, {
			set_left: (x) => onresizemove(x + 15, resizeAnchor.height),
			set_top: () => null,
			onstart: onresizestart,
			onend: onresizeend,
		});
		drag(HeightMiddle, {
			set_left: () => null,
			set_top: (y) => onresizemove(resizeAnchor.width, y + 15),
			onstart: onresizestart,
			onend: onresizeend,
		});
	}, 150);

	return bigbox;
};
