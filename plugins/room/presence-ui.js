// Wires presence (presence.js) into the page while a room is open: sends our
// cursor and viewport, draws other people's cursors on the canvas, and keeps
// the list of people for the sidebar.
import {
	createFollower,
	createPeers,
	createPresenceSender,
	linkPresence,
	screenToCanvas,
} from "./presence.js";

// Cursors live in the canvas element so they pan and zoom with it.
const LAYER_CLASS = "presence-layer";

const layerOf = () => {
	let container = document.querySelector(".container");
	if (!container) return;
	let layer = container.querySelector(`:scope > .${LAYER_CLASS}`);
	if (!layer) {
		layer = document.createElement("div");
		layer.className = LAYER_CLASS;
		container.appendChild(layer);
	}
	return layer;
};

const cursorElement = (peer) => {
	let element = document.createElement("div");
	element.className = "presence-cursor";
	element.innerHTML = '<span class="presence-dot"></span><span class="presence-name"></span>';
	return element;
};

// deps:
//   network       the room's WebSocket client adapter
//   identity      createIdentity(...)
//   getViewport   () => { x, y, scale }
//   setViewport   ({ x, y, scale }) => void
//   onViewport    (listener) => unsubscribe; fires on any viewport change
//   people        reactive: [{ peerId, name, color }] present, for the sidebar
//   following     reactive: peerId being followed, or undefined
// Returns { follow(peerId), stopFollowing(), refresh(), stop() }; refresh()
// republishes our presence after the identity changed.
export const startPresence = ({
	network, identity, getViewport, setViewport, onViewport, people, following,
}) => {
	let link = linkPresence(network);
	let peers = createPeers();
	let sender = createPresenceSender({ send: link.send });
	let follower = createFollower({
		peers,
		setViewport,
		onChange: (peerId) => following.next(peerId ?? ""),
	});

	let cursor = null;
	let publish = () => sender.update({
		me: identity.get(),
		cursor,
		viewport: getViewport(),
	});

	let size = () => ({ width: window.innerWidth, height: window.innerHeight });
	let onPointerMove = (event) => {
		cursor = screenToCanvas(getViewport(), size(), { x: event.clientX, y: event.clientY });
		publish();
	};
	let onPointerLeave = () => {
		cursor = null;
		publish();
	};
	document.addEventListener("pointermove", onPointerMove, { passive: true });
	document.documentElement.addEventListener("pointerleave", onPointerLeave);

	let stopViewport = onViewport(() => {
		follower.viewportMoved();
		publish();
		scaleCursors();
	});

	// ~~~~ Other people's cursors
	let elements = new Map(); // peerId -> element

	function scaleCursors() {
		// Keep cursor labels readable whatever the zoom.
		let scale = getViewport().scale || 1;
		elements.forEach((element) => element.style.setProperty("--inverse-scale", String(1 / scale)));
	}

	let draw = (peer) => {
		let layer = layerOf();
		if (!layer) return;
		let element = elements.get(peer.peerId);
		if (!peer.cursor) {
			element?.remove();
			elements.delete(peer.peerId);
			return;
		}
		if (!element) {
			element = cursorElement(peer);
			elements.set(peer.peerId, element);
		}
		if (element.parentNode != layer) layer.appendChild(element);
		element.style.setProperty("--color", peer.me?.color ?? "gray");
		element.style.transform = `translate(${peer.cursor.x}px, ${peer.cursor.y}px) scale(var(--inverse-scale, 1))`;
		element.querySelector(".presence-name").textContent = peer.me?.name ?? "";
		scaleCursors();
	};

	// The sidebar only needs to change when someone arrives, leaves or is
	// renamed, not on every cursor movement.
	let signature = "";
	let publishPeople = () => {
		let list = peers.list().map(({ peerId, me }) => ({
			peerId, name: me?.name ?? "Someone", color: me?.color ?? "gray",
		}));
		let next = JSON.stringify(list);
		if (next == signature) return;
		signature = next;
		people.next(list);
	};

	peers.subscribe((event) => {
		if (event.type == "left") {
			elements.get(event.peerId)?.remove();
			elements.delete(event.peerId);
		} else draw(event.peer);
		publishPeople();
	});

	let stopMessages = link.onMessage((text) => {
		// Somebody new can't know where we are until we say so.
		if (peers.receive(text) == "new") sender.resend();
	});
	// After (re)connecting, say where we are; peers may have missed it.
	let stopConnect = link.onConnect(() => sender.resend());

	publish();

	return {
		refresh: publish,
		follow: (peerId) => follower.follow(peerId),
		stopFollowing: () => follower.stop(),
		stop() {
			stopMessages();
			stopConnect();
			stopViewport();
			document.removeEventListener("pointermove", onPointerMove);
			document.documentElement.removeEventListener("pointerleave", onPointerLeave);
			sender.stop();
			link.stop();
			follower.stop();
			peers.clear();
			elements.forEach((element) => element.remove());
			elements.clear();
			people.next([]);
		},
	};
};
