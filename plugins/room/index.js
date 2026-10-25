// Rooms: live, collaborative copies of a canvas (see GLOSSARY.md).
// Registers the Room state adapter, mirrors the store while a room is open,
// and adds "Eject to a room" to the sidebar's Canvases section.
import { BlockElement, GroupElement } from "../../block.js";
import { notificationpopup } from "../../notification.js";
import { canvasData } from "../../script.js";
import { addNode, removeNode, state, store, try_set_channel } from "../../state.js";
import { createRoomAdapter } from "./adapter.js";
import { createRoomDocument, roomIdOf } from "./document.js";
import { startMirror } from "./mirror.js";

// The deployed dev Room server until production is deployed. Set
// localStorage "room-server" to use another one.
const DEFAULT_SERVER = "wss://arena-canvas-rooms-dev.pashineaaryan.workers.dev";

const readStorage = (key) => {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
};
const writeStorage = (key, value) => {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Private mode or storage full: the viewport just isn't remembered.
	}
};

export const roomServer = () => readStorage("room-server") || DEFAULT_SERVER;

// Loaded only when a room is first used, so Are.na-only use costs nothing.
const loadAutomerge = async () => {
	let AM = await import("../../vendor/automerge/automerge-repo.js");
	await AM.initializeWasm(new URL("../../vendor/automerge/automerge.wasm", import.meta.url));
	return AM;
};

// Each person's pan/zoom per room, never synced.
const viewport = {
	get: (roomId) => {
		try {
			return JSON.parse(readStorage(`room-viewport:${roomId}`)) ?? undefined;
		} catch {
			return undefined;
		}
	},
	set: (roomId, transform) => writeStorage(`room-viewport:${roomId}`, JSON.stringify(transform)),
};

const currentTransform = () => ({
	x: state.canvasX.value(),
	y: state.canvasY.value(),
	scale: state.canvasScale.value(),
});

const nodeElement = (node) => document.querySelector(
	`.container [block-id="${CSS.escape(String(node.id))}"], ` +
	`.container [node-id="${CSS.escape(String(node.id))}"]`,
);

export default {
	id: "rooms",
	name: "Rooms",
	description: "Eject a canvas into a live room that everyone with the link can edit together.",
	setup(controller) {
		let adapter = createRoomAdapter({
			loadAutomerge,
			connect: (AM, roomId) => new AM.BrowserWebSocketClientAdapter(`${roomServer()}/room/${roomId}`),
			fallback: controller.getStateAdapter("arena"),
			viewport,
			getSlug: () => state.currentSlug.value(),
		});
		controller.registerStateAdapter(adapter);

		// Show a node a collaborator added, or hide one they removed.
		let mount = (node, block) => {
			addNode(node);
			let container = document.querySelector(".container");
			if (node.type == "group") container?.appendChild(GroupElement(node));
			else if (block) {
				controller.setChannelBlocks([...controller.getChannelBlocks(), block]);
				container?.appendChild(BlockElement(block));
			}
		};
		let unmount = (node) => {
			removeNode(node);
			nodeElement(node)?.remove();
		};

		let stopMirror;
		let stopViewport;
		let leaveRoom = () => {
			stopMirror?.();
			stopViewport?.();
			stopMirror = stopViewport = undefined;
		};

		controller.registerHook("canvas:loaded", ({ slug }) => {
			leaveRoom();
			let roomId = roomIdOf(slug);
			if (!roomId) return;

			stopMirror = startMirror({
				store,
				adapter,
				slug,
				getData: canvasData,
				mount,
				unmount,
				edgesChanged: () => state.reRenderEdges.next((n) => n + .0001),
			});

			// Remember this person's viewport for the room as they pan and zoom.
			let timer;
			let remember = () => {
				clearTimeout(timer);
				timer = setTimeout(() => viewport.set(roomId, currentTransform()), 300);
			};
			let unsubscribers = [state.canvasX, state.canvasY, state.canvasScale]
				.map((value) => value.subscribe(remember));
			stopViewport = () => {
				clearTimeout(timer);
				unsubscribers.forEach((unsubscribe) => unsubscribe());
			};
		});

		let eject = async () => {
			let slug = state.currentSlug.value();
			notificationpopup("Ejecting into a room...");
			try {
				let document = createRoomDocument({
					originSlug: slug,
					canvasName: state.canvasName.value(),
					blocks: controller.getChannelBlocks(),
					data: canvasData(),
				});
				let room = await adapter.createRoom(document);
				viewport.set(roomIdOf(room), currentTransform());
				try_set_channel(room, () => notificationpopup("You're in the room. Share the link to collaborate."));
			} catch (error) {
				console.error("Eject failed", error);
				notificationpopup("Couldn't eject: " + error.message, true);
			}
		};

		// Rooms can't be ejected again (yet); everything else can.
		controller.registerUI("canvases", () => roomIdOf(state.currentSlug.value())
			? ["p.room-note", "Live room: changes sync as you make them."]
			: ["button", { onclick: eject }, "Eject to a room"]);

		return leaveRoom;
	},
};
