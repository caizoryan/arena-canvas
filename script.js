import { memo, reactive } from "./chowk.js";
import { dom } from "./dom.js";
import { register } from "./plugin.js";
import { addNode, removeEdge, state, store, try_set_channel } from "./state.js";
import { Keymanager } from "./keymanager.js";
import { sidebar } from "./sidebar.js";
import { dragOperations } from "./dragOperations.js";
import { notificationpopup } from "./notification.js";
import { add_block, add_file, add_link, connect_block, get_block,
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
import blockRenderers from "./plugins/builtin-block-renderers.js";
import jumpLink from "./plugins/jump-link.js";

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

export const round = (n, r) => r ? Math.ceil(n / r) * r : n;

let canvasData = () => ({
	...store.get(["data"]),
	transform: {
		x: state.canvasX.value(),
		y: state.canvasY.value(),
		scale: state.canvasScale.value(),
	},
});

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
	download_json(canvasData(), state.currentSlug.value());
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

				console.log("will connect block: ", id, " to slug");
				connect_block(state.currentSlug.value(), id)
					.then(async (response) => {
						// v3 returns connection resources (`data` is an array), not
						// the connected block. Fetch the block for rendering.
						let block = response?.data || response;
						if (!block?.type || !block?.id) block = await get_block(id);
						if (!block?.id) throw new Error("Connected block was not returned");

						let newBlock = constructBlockData(block, {
							x: state.canvasX.value(),
							y: state.canvasY.value(),
							width: 350,
							height: 350,
						});
						addNode(newBlock);
						document.querySelector(".container")?.appendChild(
							BlockElement(block),
						);
					})
					.catch((error) => {
						console.log("Failed to connect block:", error);
						notificationpopup("Failed to add block", true);
					});
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

let uploadDroppedFile = (file, index = 0) => {
	return add_file(state.currentSlug.value(), file)
		.then((block) => {
			if (!block?.id) {
				notificationpopup(`Failed to create block for ${file.name}`, true);
				return;
			}

			let width = 300;
			let height = 300;
			// The container's transform origin includes the current pan, so the
			// visible viewport center is this canvas-space coordinate. Offset
			// files in the same drop so they do not all land on top of each other.
			let offset = index * 40;
			let x = state.canvasX.value() + window.innerWidth / 2 - width / 2 + offset;
			let y = state.canvasY.value() + window.innerHeight / 2 - height / 2 + offset;
			let node = constructBlockData(block, { x, y, width, height });

			addNode(node);
			let element = BlockElement(block);
			document.querySelector(".container")?.appendChild(element);
			if (block.state == "processing") {
				notificationpopup(`Processing ${file.name}...`);
				refetchProcessingFile(block.id, element);
			}
			else notificationpopup(`${file.name} added 👍`);
		})
		.catch((error) => {
			console.log("File upload failed:", error);
			notificationpopup(`Failed to upload ${file.name}`, true);
		});
};

let uploadDroppedFiles = (files) => {
	notificationpopup(`Uploading ${files.length} file${files.length == 1 ? "" : "s"}...`);
	files.forEach((file, index) => uploadDroppedFile(file, index));
};

let refetchProcessingFile = (blockId, element) => {
	setTimeout(() => {
		get_block(blockId).then((block) => {
			if (!block) return;
			if (block.state == "processing") {
				refetchProcessingFile(blockId, element);
				notificationpopup("Still processing...");
				return;
			} else notificationpopup("File added 👍");

			let freshElement = BlockElement(block);
			element.replaceWith(freshElement);
		});
	}, 1500);
};

// --------------------
// ACTIONS
// --------------------
let toggleTrackingMode = () => state.trackpad_movement = !state.trackpad_movement;
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

	// Cancel an in-progress connection.
	state.block_connection_buffer = undefined;
	state.connectionFromX.next(0);
	state.connectionFromY.next(0);
	state.connectionToX.next(0);
	state.connectionToY.next(0);
	document.querySelectorAll(".wobble").forEach((e) => {
		e.classList.remove("wobble");
	});
};

export let saveCanvasToArena = () => {
	let content = JSON.stringify(canvasData());
	if (state.dot_canvas?.id) {
		let description =
			`This block was made using [Are.na Canvas](http://canvas.a-p.space). You can view this channel as a canvas [here](http://canvas.a-p.space/#${state.currentSlug.value()})`;
		return update_block(state.dot_canvas.id, {
			content,
			title: ".canvas",
			description,
		})
			.then((res) => {
				if (res.ok) {
					notificationpopup("Updated 👍");
					state.updated.next(true);
					return true;
				} else if (res.status == 404) {
					state.dot_canvas = undefined;
					return saveCanvasToArena();
				} else if (res.status == 401) {
					notificationpopup("Failed: Unauthorized :( ", true);
				} else notificationpopup("Failed :( status: " + res.status, true);
				return false;
			});
	} else {
		return add_block(state.currentSlug.value(), ".canvas", content).then((res) => {
			if (res?.id) {
				state.dot_canvas = res;
				notificationpopup("Saved 👍");
				state.updated.next(true);
				return true;
			} else if (!res) {
				notificationpopup("Failed to save :(", true);
			}
			return false;
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

let snappingSliderOpen = reactive(false);
let toggleSnappingSlider = () =>
	snappingSliderOpen.next((open) => !open);
let toggleSnapping = () =>
	state.snapSize.next((size) => size == 0 ? 25 : 0);

let snappingToggle = ["button.snap-toggle", {
	onclick: toggleSnapping,
	style: memo(() => state.snapSize.value() == 0
		? "background: transparent; color: black;"
		: "background: black; color: white;", [state.snapSize]),
}, memo(
	() => state.snapSize.value() == 0 ? "↺" : "⊕",
	[state.snapSize],
)];

let snappingButton = button("SNAPPING", toggleSnappingSlider);
let snappingSlider = ["input.snap-slider", {
	type: "range",
	min: 0,
	max: 200,
	step: 5,
	value: state.snapSize,
	oninput: (event) => state.snapSize.next(parseInt(event.target.value, 10)),
}];
let snappingValue = ["span.snap-value", memo(
	() => state.snapSize.value() + "px",
	[state.snapSize],
)];
let snappingPanel = [
	".snapping-panel",
	{ open: snappingSliderOpen },
	snappingSlider,
	snappingValue,
];
let snapping = [".snapping-control", snappingToggle, snappingButton, snappingPanel];

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
		return [hour, mins, secs]
			.map((number) => String(number).padStart(2, "0"))
			.join(":");
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
	snapping,
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
export function focusBlock(id) {
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

// Keep the previous name available to existing callers.
export const moveToBlock = focusBlock;

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
// File drop
// ~~~~~~~~~~~~~~~~~~~
document.addEventListener("dragover", (e) => {
	if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
});

const MAX_DROPPED_FILES = 5;
const supportedFileTypes = new Set([
	"image/jpeg",
	"image/png",
	"image/gif",
	"video/mp4",
	"audio/mpeg",
	"audio/mp3",
	"application/pdf",
]);
const supportedFileExtensions = /\.(jpe?g|png|gif|mp4|mp3|pdf)$/i;

let isSupportedFile = (file) =>
	supportedFileTypes.has((file.type || "").toLowerCase()) ||
	supportedFileExtensions.test(file.name);

document.addEventListener("drop", (e) => {
	let files = Array.from(e.dataTransfer?.files || []);
	if (!files.length) return;

	e.preventDefault();
	if (files.length > MAX_DROPPED_FILES) {
		notificationpopup("Please drop no more than 5 files at a time", true);
		return;
	}

	let supportedFiles = files.filter(isSupportedFile);
	if (supportedFiles.length != files.length) {
		notificationpopup(
			"Only JPG, PNG, GIF, MP4, MP3, and PDF files can be uploaded",
			true,
		);
	}
	if (supportedFiles.length) uploadDroppedFiles(supportedFiles);
});

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
// Load built-in renderers after the application module graph has initialized.
// The renderer plugin imports state and the Arena API, so loading it statically
// would create a circular initialization path.
register(jumpLink);
register(blockRenderers)

mount()
