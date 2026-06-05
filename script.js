import { memo, reactive } from "./chowk.js";
import { dom } from "./dom.js";
import { addNode, removeEdge, state, store, try_set_channel } from "./state.js";
import { Keymanager } from "./keymanager.js";
import { sidebar } from "./sidebar.js";
import { dragOperations } from "./dragOperations.js";
import { notificationpopup } from "./notification.js";
import { add_block, add_link,
	// connect_block,
	update_block } from "./arena.js";
import {
	BlockElement,
	button,
	constructBlockData,
	CSSTransform,
} from "./block.js";
import { helpbar } from "./help.js";
import { history } from "./history.js";
import { extract_block_id, link_is_block } from "./md.js";

// first order of business
// 1. Get canvas showing and moving like before
// 2. Load blocks from Are.na
// 3. Implement store
// 4. Add nodes to store
// 5. Render block

// -------------
// Utitlies
// ~~~~~~~~~~~~~
let checkSlugUrl = (url) => {
	if (!url.includes("#")) return;
	else return url.split("#").filter((e) => e != "").pop();
};

export const round = (n, r) => Math.ceil(n / r) * r;

let downloadData = () => {
	let download_json = (json, file = "data") => {
		let a = document.createElement("a");

		json = JSON.stringify(json);
		console.log(json);
		let blob = new Blob([json], { type: "octet/stream" });
		let url = window.URL.createObjectURL(blob);

		a.href = url;
		a.download = file + ".canvas";
		a.click();
		window.URL.revokeObjectURL(url);
	};
	download_json(store.get(["data"]), state.currentSlug.value());
};

const link_is_url = (
	str,
) => (str.includes("http://") || str.includes("https://"));

let pasteInBlock = () => {
	navigator.clipboard.readText().then((res) =>
		res.split("\n").forEach((res) => {
			console.log(res, link_is_url(res));
			if (link_is_block(res)) {
				// also check if block exists
				let id = extract_block_id(res);
				let f = store.get(["data", "nodes"]).find((f) => f.id == id);
				if (f) {
					notificationpopup("BLOCK ALREADY EXISTS", true);
					return;
				}

				console.log("will connect block: ", id, " to slug [DISABLED?? ]");
				// connect_block(state.currentSlug.value(), extract_block_id(res))
				// 	.then((block) => {
				// 		console.log("BLock?", block);
				// 		let newBlock = constructBlockData(block, {
				// 			x: state.canvasX.value(),
				// 			y: state.canvasY.value(),
				// 			width: 350,
				// 			height: 350,
				// 		});
				// 		addNode(newBlock);
				// 		document.querySelector(".container").appendChild(
				// 			BlockElement(block),
				// 		);
				// 	});
			} else if (link_is_url(res)) {
				add_link(state.currentSlug.value(), res.trim())
					.then((block) => {
						console.log("BLock?", block);
						let newBlock = constructBlockData(block, {
							x: state.canvasX.value(),
							y: state.canvasY.value(),
							width: 350,
							height: 350,
						});
						addNode(newBlock);
						document.querySelector(".container").appendChild(
							BlockElement(block),
						);
					});
			}
		})
	);
};

let copySelection = () => {
	let text = state.selected.value().map((e) => "https://are.na/block/" + e)
		.join("\n");

	console.log(text);
	navigator.clipboard.writeText(text);
};

// --------------------
// ACTIONS
// --------------------
let toggleTrackingMode = () =>
	state.trackpad_movement = !state.trackpad_movement;
let toggleSidebar = () => state.sidebarOpen.next((e) => !e);
let toggleHelpbar = () => state.helpOpen.next((e) => !e);
let removeCurrentEdge = () =>
	state.selected_connection ? removeEdge(state.selected_connection) : null;

let increaseSnapSize = () => state.snapSize.next((e) => e + 5);
let decreaseSnapSize = () => {
	state.snapSize.next((e) => e - 5);
	if (state.snapSize.value() < 5) state.snapSize.next(5);
};

let undo = () => store.canUndo() ? store.doUndo() : null;
let redo = () => store.canRedo() ? store.doRedo() : null;

let inc = (e = false) => e ? 250 : 120;
let zoomIn = (num) => state.canvasScale.next((f) => f + ((num ? num : inc()) / 1500));
let zoomOut = (num) => state.canvasScale.next((f) => f - ((num ? num : inc()) / 1500));
let moveLeft = (num) => state.canvasX.next((f) => f - (num ? num : inc()));
let moveRight = (num) => state.canvasX.next((f) => f + (num ? num : inc()));
let moveUp = (num) => state.canvasY.next((f) => f - (num ? num : inc()));
let moveDown = (num) => state.canvasY.next((f) => f + (num ? num : inc()));

let vistLast = () => {
	let last = state.last_history.pop();
	if (last) animateMove(last.x, last.y);
};

let escape = () => {
	state.canceled.next(true);
	state.selected.next([]);
};

let saveCanvasToArena = () => {
	let content = JSON.stringify(store.get(["data"]));
	if (state.dot_canvas?.id) {
		let description =
			`This block was made using [Are.na Canvas](http://canvas.a-p.space). You can view this channel as a canvas [here](http://canvas.a-p.space/#${state.currentSlug.value()})`;
		update_block(state.dot_canvas.id, {
			content,
			title: ".canvas",
			description,
		})
			.then((res) => {
				if (res.ok) {
					notificationpopup("Updated 👍");
					state.updated.next(true);
				} else if (res.status == 401) {
					notificationpopup("Failed: Unauthorized :( ", true);
				} else notificationpopup("Failed :( status: " + res.status, true);
			});
	} else {
		add_block(state.currentSlug.value(), ".canvas", content).then((res) => {
			if (res.status == 204) {
				window.location.reload();
				// for now jsut refresh, butt todo later:
				// fetch from v3 api so get the content.plain and then make that dotcanvas.
				// make this the dotcanvas
			}
		});
	}
};

// ---------------------
// Main Buttons
// ~~~~~~~~~~~~~~~~~~~~~

export const CSSTransformNoUnit = (x, y, width, height) => {
	let v = `
		position: absolute;
		left: ${x};
		top: ${y};`;

	if (width != undefined) v += `width: ${width};`;
	if (height != undefined) v += `height: ${height};`;

	return v;
};

let openbtn = button(["span", "SIDEBAR ", ["code", "⌘E"]], toggleSidebar);
let savebtn = button(["span", "SAVE ", ["code", "⌘S"]], saveCanvasToArena, {
	updated: state.updated,
});

let helpbtn = button(
	["span", "HELP ", ["code", "?"]],
	() => state.helpOpen.next((e) => !e),
);

let incSpan = button(
	["span", "+ ", ["code", "⇧+]"]],
	increaseSnapSize,
);

let san = button(
	["span", "snapping: ", ["code", state.snapSize]],
	() => null,
);

let decSpan = button(
	["span", "- ", ["code", "⇧+["]],
	decreaseSnapSize,
);

let clock = (() => {
	let time = reactive(Date.now());
	let tick = (delta) => {
		time.next(Date.now());
		requestAnimationFrame(tick);
	};

	requestAnimationFrame(tick);
	return { time };
})();

let timer = () => {
	let active = reactive(false);
	let running = reactive(false);
	let timerTime = reactive(5);
	let audio = new Audio("./gong.mp3");

	let playingAudio = false;
	audio.onended = (e) => {
		if (running.value() && timeLeft.value() == 0) {
			setTimeout(() => {
				audio.play();
			}, 1000);
		} else playingAudio = false;
	};

	let startedAt;

	let timeLeft = memo(() => {
		if (!running.value()) return undefined;
		let elapsed = startedAt - Date.now();
		let total = timerTime.value() * 60 * 1000;
		let left = total + elapsed;

		console.log("LEFT:", left);

		if (left < 0) {
			if (!playingAudio) {
				audio.play();
				playingAudio = true;
			}

			active.next(true);
			return 0;
		}

		const minutes = Math.floor(left / 60000);
		const seconds = Math.floor((left % 60000) / 1000);
		const text = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")
			}`;

		return text;
	}, [clock.time]);

	let timeInHours = memo(() => {
		if (timeLeft.value()) return timeLeft.value();
		let seconds = clock.time.value();
		let date = new Date(seconds);
		let hour = date.getHours();
		let mins = date.getMinutes();
		let secs = date.getSeconds();
		return hour + ":" + mins + ":" + secs;
	}, [clock.time]);

	let startTimer = () => {
		running.next(true);
		active.next(false);
		startedAt = Date.now();
	};

	let cancelTimer = () => {
		running.next(false);
		startedAt = undefined;
	};

	let panel = memo(() => {
		if (!running.value()) {
			return [
				["input", {
					type: "range",
					min: 1,
					max: 60,
					value: timerTime,
					oninput: (e) => timerTime.next(e.target.value),
				}],
				["span", memo(() => timerTime.value() + ":00 mins", [timerTime])],
				["button", "start", { onclick: startTimer }],
			];
		} else {
			return [
				[
					"p",
					memo(() => timeLeft.value() == 0 ? "Time Up!" : "", [
						timeLeft,
					]),
				],
				["button", "cancel", { onclick: cancelTimer }],
			];
		}
	}, [running]);

	return dom(
		[".timer", button(timeInHours, () => active.next((e) => !e)), [
			".timer-panel",
			{ active },
			panel,
		]],
	);
};


let topButtons = [
	".top-buttons",
	savebtn,
	openbtn,
	helpbtn,
	// decSpan,
	// san,
	// incSpan,
	timer(),
	history(),
];

let zoom = ['.spaced', 
button("-", () => state.canvasScale.next(e => e-=.05)),
	button(
		memo(() => parseFloat(state.canvasScale.value() * 100).toFixed(0) + "%", [state.canvasScale]),
		() => {state.canvasScale.next(1)}
	),
button("+", () => state.canvasScale.next(e => e+=.05)),
]
// let zoomPlus = ['div', ]
// let zoomMinus = ['div', ]

let x = ['div', button(memo(() => "X: " + parseFloat(state.canvasX.value()).toFixed(0) + "px", [state.canvasX]))]
let y = ['div', button(memo(() => "Y: " + parseFloat(state.canvasY.value()).toFixed(0) + "px", [state.canvasY]))]

let bottomButtons = [
	".bottom-buttons",
	// decSpan,
	// san,
	// incSpan,
	// zoomMinus,
	zoom,
	// zoomPlus,
	x,y,
];

// --------------------
// Move this somewhere
// xxxxxxxxxxxxxxxxxxxxx
export function moveToBlock(id) {
	let found = document.querySelector("*[block-id='" + id + "']");
	if (found) {
		if (state.moving_timeout) clearTimeout(state.moving_timeout);
		let { x, y, width, height } = found.getBoundingClientRect();
		let xDist = x - 150;
		let yDist = y - 150;

		if (width < window.innerWidth) {
			let left = (window.innerWidth - width) / 2;
			xDist = x - left;
		}

		// if visible don't move
		if (
			!(x > 0 && x + width < window.innerWidth) ||
			!(y > 0 && y + 150 < window.innerHeight)
		) {
			let last = {};
			last.x = state.canvasX.value();
			last.y = state.canvasY.value();

			state.last_history.push(last);

			let destX = (xDist / state.canvasScale.value()) + last.x;
			let destY = (yDist / state.canvasScale.value()) + last.y;

			animateMove(destX, destY);
		}

		let c = found.style.backgroundColor;
		let z = found.style.zindex;
		found.style.backgroundColor = "yellow";
		found.style.zIndex = 99;
		setTimeout(() => {
			found.style.backgroundColor = c;
			found.style.zIndex = z;
		}, 800);
	} else {
		notificationpopup(
			["span", "Block not found, ", ["a", {
				href: "https://are.na/block/" + id,
				target: "_blank",
			}, "jump to link"], "?"],
		);
	}
}

// --------------
// Animation
// --------------
const lerp = (start, stop, amt) => amt * (stop - start) + start;
const InOutQuad = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
let animateMove = (destX, destY) => {
	let last = {};
	last.x = state.canvasX.value();
	last.y = state.canvasY.value();

	let t = 0;
	let v = 0;
	let progress = () => {
		t += .03;
		v = InOutQuad(t);
		state.canvasX.next(lerp(last.x, destX, v));
		state.canvasY.next(lerp(last.y, destY, v));
		if (t > .99) return;
		state.moving_timeout = setTimeout(progress, 1000 / 60);
	};
	progress();
};

// -------------
// Mounters
// -------------
export let mount = () => {
	let url = location.href;
	let slug = checkSlugUrl(url);
	slug ? try_set_channel(slug) : try_set_channel(state.currentSlug.value());

	document.body.appendChild(dom(helpbar));
	document.body.appendChild(dom(sidebar));
	document.body.appendChild(dom(topButtons));
	document.body.appendChild(dom(bottomButtons));
};

let unmountContainer = () => {
	let exists = document.querySelector(".container");
	if (exists) exists.remove();
};
export let mountContainer = (children) => {
	unmountContainer();

	// CSS transforms
	// ~~~~~~~~~~~~~~~~~~~~
	let stylemmeo = memo(() => `
		transform-origin:
			${state.canvasX.value() + window.innerWidth / 2}px
			${state.canvasY.value() + window.innerHeight / 2}px;

		transform:
				translate(
						${state.canvasX.value() * -1}px,
						${state.canvasY.value() * -1}px)
				scale(${state.canvasScale.value()});`, [
		state.canvasX,
		state.canvasY,
		state.canvasScale,
	]);

	// cursor
	// ~~~~~~~
	let cursor = [".cursor", {
		style: memo(() =>
			CSSTransform(
				state.canvasX.value() +
				((window.innerWidth * .6) / state.canvasScale.value()),
				//+ window.innerWidth / 2,
				state.canvasY.value() + window.innerHeight / 2,
				45,
				45,
			) +
			"transition:all 50ms ", [state.canvasX, state.canvasY]),
	}];

	// DOM
	// ~~~~
	let root = dom([".container", {
		holding: state.holdingCanvas,
		style: stylemmeo,
		onpointerdown,
		onpointermove,
		onpointerup,
		...dragOperations,
	}, ...children]);

	root.onmousemove = (e) => {
		if (e.target != root) return;
		state.containerMouseX.next(e.offsetX);
		state.containerMouseY.next(e.offsetY);

		if (state.block_connection_buffer) {
			state.connectionToY.next(e.offsetY);
			state.connectionToX.next(e.offsetX);
			console.log(
				state.connectionFromX.value(),
				state.connectionFromY.value(),
				state.connectionToX.value(),
				state.connectionToY.value(),
			);
		}
	};

	// ---------
	// MOUNT
	// ~~~~~~~~~
	document.body.appendChild(root);
	// ---------
};
// ---------------
// Data Logic
// ---------------
// Processing blocks
// Updating data
// Constructing data
// setting slug
// pulling from are.na

// ---------------
// Nodes
// ---------------
// x
// y
// scale
// minimap

// ---------------
// Buttons
// ---------------
// help
// save
// sidebar

// ---------------
// event listeners
// ---------------
// keydown
// wheel
// drag and drop

// -------------------
// Wheel Event (!)
// ~~~~~~~~~~~~~~~~~~~
document.addEventListener("wheel", (e) => {
	if (e.ctrlKey) {
		// trackpad...
		e.preventDefault();
		state.canvasScale.next((f) => f - (e.deltaY / 350));
	} else if (e.metaKey) {
		e.preventDefault();
		state.canvasScale.next((f) => f - (e.deltaY / 1000));
	} else if (state.trackpad_movement) {
		e.preventDefault();
		state.canvasY.next((f) => f + e.deltaY * 1.5);
		state.canvasX.next((f) => f + e.deltaX * 1.5);
	}
}, { passive: false });

let keys = new Keymanager();
let prevent = { preventDefault: true };
let disableInputAndPrevent = {disable_in_input: true, preventDefault: true}
let disableInput = {disable_in_input: true}

keys.on("cmd + z", undo, disableInputAndPrevent);
keys.on("ctrl + z", undo, disableInputAndPrevent);

keys.on("cmd + shift + z", redo, disableInputAndPrevent);
keys.on("ctrl + shift + z", redo, disableInputAndPrevent);

keys.on("cmd + =", () => zoomIn(), prevent);
keys.on("cmd + -", () => zoomOut(), prevent);

keys.on("cmd + shift + =", () => zoomIn(inc() * 3), prevent);
keys.on("cmd + shift + -", () => zoomOut(inc() * 3), prevent);

keys.on("ArrowRight", () => moveRight(), disableInput);
keys.on("ArrowLeft", () => moveLeft(), disableInput);
keys.on("ArrowUp", () => moveUp(), disableInput);
keys.on("ArrowDown", () => moveDown(), disableInput);

keys.on("ArrowRight + shift", () => moveRight(inc() * 3), disableInput);
keys.on("ArrowLeft + shift", () => moveLeft(inc() * 3), disableInput);
keys.on("ArrowUp + shift", () => moveUp(inc() * 3), disableInput);
keys.on("ArrowDown + shift", () => moveDown(inc() * 3), disableInput);


keys.on("d", moveRight, disableInput);
keys.on("a", moveLeft, disableInput);
keys.on("w", moveUp, disableInput);
keys.on("s", moveDown, disableInput);

keys.on("cmd + e", toggleSidebar, prevent);
keys.on("ctrl + e", toggleSidebar, prevent);

keys.on("escape", escape, { modifiers: false, disable_in_input: true });
keys.on("b", vistLast, { modifiers: false, disable_in_input: true });
keys.on("t", toggleTrackingMode, disableInput);

keys.on("cmd + s", saveCanvasToArena, prevent);
keys.on("ctrl + s", saveCanvasToArena, prevent);

keys.on("shift + ]",  increaseSnapSize, disableInputAndPrevent);
keys.on("shift + [", decreaseSnapSize, disableInputAndPrevent);

keys.on("shift + /", toggleHelpbar, disableInput);

keys.on("cmd + v", pasteInBlock, disableInputAndPrevent);
keys.on("ctrl + v", pasteInBlock, disableInputAndPrevent);

keys.on("cmd + c", copySelection, disableInputAndPrevent);

keys.on("ctrl + c", copySelection, disableInputAndPrevent);
keys.on("cmd + d", downloadData, disableInputAndPrevent);
keys.on("ctrl + d", downloadData, disableInputAndPrevent);

keys.on("backspace", removeCurrentEdge, disableInputAndPrevent);

document.onkeydown = (e) => keys.event(e);

// --------------------
// Hash watcher
// --------------------
window.onhashchange = (event) => {
	let slug = checkSlugUrl(event.newURL);
	if (slug) try_set_channel(slug);
};
// -------------------
// Initialization FN
// -------------------
mount();
