// Presence in a room (ADR 0006, GLOSSARY.md): who is here, where their cursor
// and viewport are, and following someone's view. Presence travels as JSON
// text frames beside automerge-repo's binary ones; the room server stamps each
// with the sender's peer id and fans it out to the other sockets. It is never
// stored. Everything here is plain logic with injected timers and storage, so
// it runs the same in Node tests and in the browser.

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ~~~~~~~~~~~~~~
// Coordinates
// ~~~~~~~~~~~~~~
// The canvas element is transformed with
//   transform-origin: (x + W/2, y + H/2); translate(-x, -y) scale(s)
// where {x, y, scale} is the viewport and W x H the window, so a point on the
// screen maps to the canvas as below (and back).
export const screenToCanvas = ({ x, y, scale }, size, point) => ({
	x: x + size.width / 2 + (point.x - size.width / 2) / scale,
	y: y + size.height / 2 + (point.y - size.height / 2) / scale,
});

export const canvasToScreen = ({ x, y, scale }, size, point) => ({
	x: size.width / 2 + (point.x - x - size.width / 2) * scale,
	y: size.height / 2 + (point.y - y - size.height / 2) * scale,
});

// ~~~~~~~~~~~~~~
// Sending
// ~~~~~~~~~~~~~~
export const SEND_INTERVAL_MS = 100; // ~10 Hz

// Sends the latest presence only when it changed, at most once per interval.
// While the interval is running, newer values replace the waiting one, and
// the waiting one is always sent when it ends, so the final position is
// delivered.
export const createPresenceSender = ({
	send,
	interval = SEND_INTERVAL_MS,
	now = Date.now,
	setTimer = setTimeout,
	clearTimer = clearTimeout,
}) => {
	let latest; // the newest presence given to update()
	let sent; // the newest presence actually sent
	let sentAt = -Infinity;
	let timer;

	let flush = () => {
		timer = undefined;
		if (latest === undefined || same(latest, sent)) return;
		sent = latest;
		sentAt = now();
		send(sent);
	};

	return {
		update(presence) {
			if (same(presence, latest)) return;
			latest = presence;
			if (timer !== undefined) return;
			let wait = sentAt + interval - now();
			if (wait <= 0) flush();
			else timer = setTimer(flush, wait);
		},
		// Send the current presence again regardless of change: after a
		// reconnect, or when somebody new has arrived and can't know it yet.
		resend() {
			if (latest === undefined) return;
			clearTimer(timer);
			timer = undefined;
			sent = latest;
			sentAt = now();
			send(sent);
		},
		stop() {
			clearTimer(timer);
			timer = undefined;
		},
	};
};

// ~~~~~~~~~~~~~~
// Receiving
// ~~~~~~~~~~~~~~
// Everyone else in the room, by peer id. Peers vanish when the server says
// their socket closed.
export const createPeers = () => {
	let peers = new Map();
	let listeners = new Set();
	let emit = (event) => listeners.forEach((listener) => listener(event));

	return {
		// Feed one text frame from the server. Returns what it was, or
		// undefined if it wasn't valid presence.
		receive(text) {
			let message;
			try {
				message = typeof text == "string" ? JSON.parse(text) : text;
			} catch {
				return;
			}
			let peerId = message?.peerId;
			if (typeof peerId != "string") return;

			if (message.type == "presence-left") {
				if (peers.delete(peerId)) emit({ type: "left", peerId });
				return "left";
			}
			if (message.type != "presence" || typeof message.presence != "object" || !message.presence) return;
			let isNew = !peers.has(peerId);
			let peer = { peerId, ...message.presence };
			peers.set(peerId, peer);
			emit({ type: "update", peerId, peer, isNew });
			return isNew ? "new" : "update";
		},
		get: (peerId) => peers.get(peerId),
		list: () => [...peers.values()],
		clear() {
			let ids = [...peers.keys()];
			peers.clear();
			ids.forEach((peerId) => emit({ type: "left", peerId }));
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
};

// ~~~~~~~~~~~~~~
// Following
// ~~~~~~~~~~~~~~
// While following, every update from that person sets our viewport to theirs
// via setViewport. Any pan or zoom of our own ends it; the app reports those
// with viewportMoved(). Our own setViewport calls are not mistaken for that.
export const createFollower = ({ peers, setViewport, onChange = () => {} }) => {
	let target;
	let applying = false;

	let apply = (viewport) => {
		if (!viewport) return;
		applying = true;
		try {
			setViewport(viewport);
		} finally {
			applying = false;
		}
	};

	let stop = () => {
		if (target === undefined) return;
		target = undefined;
		onChange(undefined);
	};

	peers.subscribe((event) => {
		if (event.peerId != target) return;
		if (event.type == "left") stop();
		else apply(event.peer.viewport);
	});

	return {
		following: () => target,
		follow(peerId) {
			if (!peers.get(peerId)) return;
			target = peerId;
			onChange(peerId);
			apply(peers.get(peerId).viewport);
		},
		stop,
		viewportMoved() {
			if (!applying) stop();
		},
	};
};

// ~~~~~~~~~~~~~~
// Identity
// ~~~~~~~~~~~~~~
const ADJECTIVES = ["Amber", "Brisk", "Calm", "Dapper", "Eager", "Fuzzy", "Gentle", "Hazy", "Jolly", "Keen", "Lucid", "Mellow", "Nimble", "Plucky", "Quiet", "Rosy", "Sunny", "Tidy", "Vivid", "Wry"];
const ANIMALS = ["Otter", "Heron", "Lynx", "Finch", "Marten", "Newt", "Badger", "Ibis", "Gecko", "Wren", "Tapir", "Stoat", "Pika", "Civet", "Lemur", "Quail", "Moth", "Koi", "Yak", "Hare"];

const pick = (list, random) => list[Math.floor(random() * list.length)];

export const generateIdentity = (random = Math.random) => ({
	name: `${pick(ADJECTIVES, random)} ${pick(ANIMALS, random)}`,
	color: `hsl(${Math.floor(random() * 360)} 70% 45%)`,
});

// Who we are in a room. The Are.na name wins when logged in; otherwise the
// generated (or renamed) name from storage. The colour is always the
// persisted one, so it is stable across reloads and logins.
//   storage  { get(key), set(key, value) }
//   me       () => the Are.na user, or an empty object when not logged in
export const createIdentity = ({ storage, me = () => ({}), random = Math.random }) => {
	let saved;
	try {
		saved = JSON.parse(storage.get("room-identity"));
	} catch {
		// unreadable: start again
	}
	if (!saved?.name || !saved?.color) {
		saved = generateIdentity(random);
		storage.set("room-identity", JSON.stringify(saved));
	}

	let arena = () => me() ?? {};
	return {
		get() {
			let user = arena();
			return { name: user.name || user.slug || saved.name, color: saved.color };
		},
		loggedIn: () => Boolean(arena().slug || arena().name),
		rename(name) {
			name = String(name ?? "").trim().slice(0, 40);
			if (!name) return false;
			saved = { ...saved, name };
			storage.set("room-identity", JSON.stringify(saved));
			return true;
		},
	};
};

// ~~~~~~~~~~~~~~
// Wire
// ~~~~~~~~~~~~~~
// Presence over a room's WebSocket client adapter. Binary frames still go to
// automerge-repo; text frames are taken here first. The adapter replaces its
// socket on every reconnect, so we wrap its receiveMessage instead of
// listening on a socket. Returns { send(presence), onMessage(fn),
// onConnect(fn), stop() }.
export const linkPresence = (network) => {
	let messages = new Set();
	let connects = new Set();
	let original = network.receiveMessage;
	network.receiveMessage = function (data) {
		if (typeof data == "string") messages.forEach((listener) => listener(data));
		else return original.call(this, data);
	};
	// The server answering our join means a (re)connected socket.
	let connected = () => connects.forEach((listener) => listener());
	network.on("peer-candidate", connected);

	return {
		send(presence) {
			let socket = network.socket;
			if (socket?.readyState !== 1) return;
			socket.send(JSON.stringify({ type: "presence", presence }));
		},
		onMessage: (listener) => (messages.add(listener), () => messages.delete(listener)),
		onConnect: (listener) => (connects.add(listener), () => connects.delete(listener)),
		stop() {
			network.receiveMessage = original;
			network.off("peer-candidate", connected);
			messages.clear();
			connects.clear();
		},
	};
};
