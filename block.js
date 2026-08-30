import { add_block } from "./arena.js";
import { memo, reactive } from "./chowk.js";
import { dom } from "./dom.js";
import { drag } from "./drag.js";
import { notificationpopup } from "./notification.js";
import { registeredRenderers } from "./plugin.js";
import { round } from "./script.js";
import {
	addEdge,
	addNode,
	getNodeLocation,
	mouse,
	removeNode,
	state,
	store,
	subscribeToId,
} from "./state.js";
import { svgx } from "./svg.js";

// ---------
// Utilities
// ~~~~~~~~~
const uuid = () => Math.random().toString(36).slice(-6);
export const button = (
	t,
	fn,
	opts = {},
) => ["button", { onclick: fn, ...opts }, t];
export const unwrap = (t) => t.isReactive ? t.value() : t;
export const CSSTransform = (x, y, width, height) => {
	let v = `
		position: absolute;
		left: ${unwrap(x)}px;
		top: ${unwrap(y)}px;`;

	if (width != undefined) v += `width: ${unwrap(width)}px;`;
	if (height != undefined) v += `height: ${unwrap(height)}px;`;

	return v;
};

export const Transform = (x, y, width, height) => ({ x, y, width, height });
const Color = (i) => "background-color: var(--b" + i + ");";
const GColor = (i) => "background-color: var(--g" + i + ");";
export const isRectContained = (rect1, rect2) => {
	return (
		rect2.x >= rect1.x &&
		rect2.y >= rect1.y &&
		rect2.x + rect2.width <= rect1.x + rect1.width &&
		rect2.y + rect2.height <= rect1.y + rect1.height
	);
};

export const isRectIntersecting = (rect1, rect2) => {
	return !(
		rect1.x + rect1.width <= rect2.x ||
		rect1.x >= rect2.x + rect2.width ||
		rect1.y + rect1.height <= rect2.y ||
		rect1.y >= rect2.y + rect2.height
	);
};

const convertBlockToV3 = (block) => {
	if (block.class) {
		block.type = block.class;
		if (block.type == "Text") {
			block.content = { markdown: block.content };
		}
		// if has image the change url to src or whatever
	}

	if (block.type == "Channel") block.id = "c" + block.id;

	return block;
};

// Reactive interface:
// ~> (to plug into the store)
// ~~~~~~~~~~~~~~~~~~~
let R = (location, id) => (key) => ({
	isReactive: true,
	value: () => store.get(location.concat([key])),
	next: (v) => store.tr(location, "set", [key, v]),
	subscribe: (fn) => subscribeToId(id, [key], fn),
});

let groupTitleLabel = (group) => {
	let location = getNodeLocation(group.id);
	let r = R(location, group.id);
	let label = r("label");

	let editingLabel = reactive(false);
	let textLabel = () => ["h4", {
		onclick: () => {
			editingLabel.next(true);
		},
	}, label];
	let editLabel = () => ["div", ["input", {
		oninput: (e) => {
			label.next(e.target.value);
		},
		onkeydown: (e) => {
			if (e.key == "Enter") editingLabel.next(false);
			if (e.key == "Escape") editingLabel.next(false);
		},
		value: label,
	}], button("set", () => editingLabel.next(false))];

	let title = dom([
		".label",
		memo(() => editingLabel.value() ? editLabel() : textLabel(), [
			editingLabel,
		]),
	]);

	return title;
};
let colorBars = (node, btn = ["span"]) => {
	let r = R(getNodeLocation(node.id), node.id);
	let color = r("color");
	let setcolorfn = (i) => () => color.next(i + "");
	let colorbuttons = [
		".color-bar",
		...[1, 2, 3, 4, 5, 6].map((i) =>
			button("x", setcolorfn(i), {
				style: "background-color: var(--b" + i + ");",
			})
		),
		btn,
	];
	return colorbuttons;
};

// ------------------
// Block and Group El
// ------------------
export function BlockElement(block) {
	// Convert From  v3 to v2 incase
	block = convertBlockToV3(block);
	let location = getNodeLocation(block.id);

	if (!location) {
		let newNode = constructBlockData(block, 0);
		addNode(newNode);
		location = getNodeLocation(block.id);
	}

	let r = R(location, block.id);

	let left = r("x");
	let top = r("y");
	let color = r("color");
	let height = r("height");
	let width = r("width");
	let isSelected = memo(
		() => state.selected.value().includes(block.id),
		[state.selected],
	);

	let isMultiSelected = memo(
		() =>
			state.selected.value().length > 1 &&
			state.selected.value().includes(block.id),
		[state.selected],
	);

	let addToSelection = (e) => {
		if (e.shiftKey) {
			state.selected.next((e) => [...e, block.id]);
		} else state.selected.next([block.id]);
	};

	let style = memo(() =>
		CSSTransform(left, top, width, height) +
		Color(color.value()), [left, top, width, height, color]);

	let renderer = registeredRenderers.find((renderer) => renderer.match(block));
	let result;

	if (renderer) {
		result = renderer.render(block);
	} else {
		// Keep an unknown block from preventing the rest of the canvas from
		// rendering. A plugin can claim it later by registering a renderer.
		console.warn("No renderer registered for block", block);
		result = {
			body: [".block", block.title || ""],
			topBar: [],
			bottomBar: [],
			attributes: {},
		};
	}

	let {
		body,
		topBar = [],
		bottomBar = [],
		attributes = {},
	} = result;

	let t = [".top-bar", colorBars(block), ...topBar];
	let b = [
		".bottom-bar",
		...Object.values(BasicComponents(block)),
		...bottomBar,
	];

	let copy = null

	let onstart = (e) => {
		if (e.altKey) {
			add_block(
				state.currentSlug.value(),
				"",
				store.get(getNodeLocation(block.id).concat(["text"])),
			)
				.then((res) => {
					let newBlock = constructBlockData(res, {
						x: left.value() + 50,
						y: top.value() + 50,
						width: width.value(),
						height: height.value(),
						color: color.value(),
					});
					addNode(newBlock);
					document.querySelector(".container").appendChild(BlockElement(res));
				});
			return;
		}

		addToSelection(e);
		copy = {
			left: left.value(),
			top: top.value(),
			width: width.value(),
			height: height.value(),
		}

		store.pauseTracking();
	};

	let onend = () => {
		// Pointer-up can bubble from controls (or from an embedded renderer)
		// without a matching pointer-down on the draggable node.
		if (!copy) return;

		// TODO: figure out how to do this in a simpler way...
		let changed =
			left.value() != copy.left ||
			height.value() != copy.height ||
			width.value() != copy.width ||
			top.value() != copy.top;

		if (changed) {
			let tobe = {
				left: left.value(),
				top: top.value(),
				width: width.value(),
				height: height.value(),
			};
			store.startBatch();
			left.next(copy.left);
			top.next(copy.top);
			width.next(copy.width);
			height.next(copy.height);
			store.endBatch();

			store.resumeTracking();
			store.startBatch();
			left.next(tobe.left);
			top.next(tobe.top);
			width.next(tobe.width);
			height.next(tobe.height);
			store.endBatch();
		} else {
			store.resumeTracking();
		}
		copy = null;
	}

	let edges = resizers(left, top, width, height, { onstart, onend });

	let connectionEdges = connectors(block, left, top, width, height);

	let el = dom(
		".draggable.node",
		{
			style,
			"block-id": block.id,
			selected: isSelected,
			"multi-selected": isMultiSelected,
			...attributes,
			// onclick: addToSelection,
		},
		t,
		body,
		...edges,
		...connectionEdges,
		b,
	);

	setTimeout(() => {
		drag(el, {
			onstart,
			onend,
			pan_switch: () => attributes?.edit ? !attributes.edit.value() : true,
			set_position: (x, y) => {
				left.next(round(x, state.snapSize.value()));
				top.next(round(y, state.snapSize.value()));
			},
		});
	}, 50);

	return el;
}
export function GroupElement(group) {
	// Convert From  v3 to v2 incase
	let r = R(getNodeLocation(group.id), group.id);
	let anchored = [];

	let left = r("x");
	let top = r("y");
	let color = r("color");
	let height = r("height");
	let width = r("width");

	let style = memo(
		() => CSSTransform(left, top, width, height) + GColor(color.value()),
		[left, top, width, height, color],
	);

	let onstart = (e) => {
		state.selected.next([]);

		// saves this location for undo
		store.startBatch();

		if (!e.metaKey) {
			store.get(["data", "nodes"]).forEach((e, i) => {
				let fn = isRectIntersecting;
				if (e.type == "group") fn = isRectContained;

				if (
					fn(
						Transform(
							left.value(),
							top.value(),
							width.value(),
							height.value(),
						),
						e,
					)
				) {
					let item = {
						blockLocation: ["data", "nodes", i],
						position: { x: e.x, y: e.y },
						offset: {
							x: e.x - left.value(),
							y: e.y - top.value(),
						},
					};
					anchored.push(item);
				}
			});

			anchored.forEach((e, i) => {
				store.tr(e.blockLocation, "set", ["x", e.position.x]);
				store.tr(e.blockLocation, "set", ["y", e.position.y]);
			});
		} else {
			left.next(left.value());
			top.next(top.value());
			width.next(width.value());
			height.next(height.value());
		}

		store.endBatch();
		store.pauseTracking();
	};
	let onend = () => {
		store.resumeTracking();
		anchored = [];
	};

	let remove = () => {
		removeNode(group);
		el.remove();
	};

	let removeButton = () => {
		let click = reactive(0);
		let words = ["delete", "DELETE", "DELETE!", "DELEETEEEE!!!!"];
		let onclick = () => {
			click.next((e) => e + 1);
			if (click.value() == words.length) remove();
		};
		return button(memo(() => words[click.value()], [click]), onclick);
	};

	let edges = resizers(left, top, width, height, { onstart, onend });
	let connectionEdges = connectors(group, left, top, width, height);
	let el = dom(
		".draggable.group",
		{ style },
		colorBars(group, removeButton()),
		groupTitleLabel(group),
		...edges,
		...connectionEdges,
	);

	setTimeout(() => {
		drag(el, {
			onstart,
			onend,
			set_position: (x, y) => {
				x = round(x, state.snapSize.value());
				y = round(y, state.snapSize.value());

				left.next(x);
				top.next(y);

				anchored.forEach((e) => {
					let xPos = x + e.offset.x;
					let yPos = y + e.offset.y;

					store.tr(e.blockLocation, "set", ["x", xPos]);
					store.tr(e.blockLocation, "set", ["y", yPos]);
				});
			},
		});
	}, 50);

	return el;
}

const resizers = (left, top, width, height, opts = {}) => {
	let MainCorner = dom(".absolute.flex-center.box.cur-se", {
		style: memo(() =>
			CSSTransform(
				width.value() - 15,
				height.value() - 15,
				30,
				30,
			), [width, height]),
	}, svgx(30));

	let WidthMiddle = dom(".absolute.flex-center.box.cur-e", {
		style: memo(() =>
			CSSTransform(
				width.value() - 15,
				15,
				30,
				height.value() - 30,
			), [width, height]),
	}, svgx(30));

	let HeightMiddle = dom(".absolute.flex-center.box.cur-s", {
		style: memo(() =>
			CSSTransform(
				15,
				height.value() - 15,
				width.value() - 30,
				30,
			), [width, height]),
	}, svgx(30));

	setTimeout(() => {
		drag(MainCorner, {
			set_position: (x, y) => {
				width.next(round(x, state.snapSize.value()));
				height.next(round(y, state.snapSize.value()));
			},
			...opts,
		});
		drag(WidthMiddle, {
			set_left: (v) => width.next(round(v, state.snapSize.value())),
			set_top: () => null,
			...opts,
		});
		drag(HeightMiddle, {
			set_left: () => null,
			set_top: (v) => height.next(round(v, state.snapSize.value())),
			...opts,
		});
	}, 100);

	return [MainCorner, WidthMiddle, HeightMiddle];
};
const connectors = (block, left, top, width, height, opts = {}) => {
	let unwrapFn = (v) => typeof v == "function" ? v() : v;
	let connectionPoint = (side, x, y) =>
		dom(".edge-connector.absolute.flex-center.box", {
			style: memo(() => CSSTransform(unwrapFn(x), unwrapFn(y)), [
				height,
				width,
			]),
			onpointerdown: (e) => {
				e.stopImmediatePropagation();
				e.stopPropagation();

				if (state.block_connection_buffer) {
					// add edge

					document.querySelectorAll(".wobble").forEach((e) => {
						e.classList.toggle("wobble");
					});

					state.connectionFromX.next(0);
					state.connectionFromY.next(0);
					state.connectionToX.next(0);
					state.connectionToY.next(0);

					if (state.block_connection_buffer.fromNode == block.id) {
						state.block_connection_buffer = undefined;
						notificationpopup("Can't connect to self", true);
						return;
					}

					addEdge({
						id: uuid(),
						...state.block_connection_buffer,
						toNode: block.id,
						toSide: side,
					});

					state.block_connection_buffer = undefined;
				} else {
					e.target.classList.toggle("wobble");

					console.log(left.value() + unwrapFn(x), top.value() + unwrapFn(y));
					state.connectionFromX.next(left.value() + unwrapFn(x));
					state.connectionFromY.next(top.value() + unwrapFn(y));
					state.connectionToX.next(left.value() + unwrapFn(x));
					state.connectionToY.next(top.value() + unwrapFn(y));

					state.block_connection_buffer = {
						fromNode: block.id,
						fromSide: side,
					};
				}
			},
		}, "X");

	let connectionPoints = [
		connectionPoint("top", () => width.value() / 2, -15),
		connectionPoint("left", -15, () => height.value() / 2),

		connectionPoint(
			"right",
			() => width.value() - 15,
			() => height.value() / 2,
		),
		connectionPoint(
			"bottom",
			() => width.value() / 2,
			() => height.value() - 15,
		),
	];

	return connectionPoints;
};

// ----------------------------------------

const BasicComponents = (block) => {
	let components = {};
	let copyLink = button("copy", (e) => {
		let link = "https://are.na/block/" + block.id;
		if (e.metaKey) link = `[title](${link})`;
		navigator.clipboard.writeText(link);
	});

	let jumpToArena = button("", (e) => {
		let link = "https://are.na/block/" + block.id;
		window.open(link, "_blank").focus();
	});

	let sourceLink = button("source", (e) => {
		let link = block.source?.url;
		window.open(link, "_blank").focus();
	});

	components["copy-link"] = copyLink;
	components["jump-to-are.na"] = jumpToArena;

	if (block.source) components["source-link"] = sourceLink;

	return components;
};

export let constructBlockData = (e, i) => {
	let padding = 400;
	let d = {
		id: e.id,
		width: 300,
		height: 300,
		color: "1",
	};
	if (typeof i == "number") {
		d.x = (i % 8) * 400 + padding;
		d.y = (Math.floor(i / 8)) * 450 + padding;
	} else {
		d.x = i.x;
		d.y = i.y;
		d.width = i.width;
		d.height = i.height;
		d.color = i.color ? i.color : d.color;
	}

	if (e.type == "Text") {
		d.type = "text";
		d.text = e.content.markdown;
	} else if (e.type == "Image") {
		d.type = "link";
		d.url = e.image?.large?.src || e.image?.large?.url;
	} else if (e.type == "Link") {
		d.type = "link";
		d.url = e.source.url;
	} else if (e.type == "Attachment") {
		d.type = "link";
		d.url = e.attachment.url;
	} else if (e.type == "Embed") {
		d.type = "link";
		d.url = e.source.url;
	} else {
		d.type = "text";
		d.text = "";
	}

	return d;
};
export let constructGroupData = (x, y, width, height) => {
	let d = {
		type: "group",
		label: "Group",
		id: "group-" + uuid(),
		x,
		y,
		width,
		height,
		color: "6",
	};

	return d;
};
