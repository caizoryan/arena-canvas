// Run: node --test tests/room-presence.test.mjs
// Presence logic (plugins/room/presence.js) with a fake clock and fake socket.
import assert from "node:assert/strict";
import test from "node:test";
import {
	canvasToScreen,
	createFollower,
	createIdentity,
	createPeers,
	createPresenceSender,
	linkPresence,
	screenToCanvas,
} from "../plugins/room/presence.js";

// A manual clock: timers fire when advance() reaches them.
const clock = () => {
	let time = 0;
	let timers = [];
	return {
		now: () => time,
		setTimer: (fn, ms) => { const timer = { fn, at: time + ms }; timers.push(timer); return timer; },
		clearTimer: (timer) => { timers = timers.filter((t) => t !== timer); },
		advance(ms) {
			const end = time + ms;
			for (;;) {
				const next = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
				if (!next) break;
				timers = timers.filter((t) => t !== next);
				time = next.at;
				next.fn();
			}
			time = end;
		},
	};
};

const presence = (x, scale = 1) => ({
	me: { name: "Ann", color: "red" },
	cursor: { x, y: 0 },
	viewport: { x: 0, y: 0, scale },
});

test("sender: only on change, at most ~10 Hz, final value always delivered", () => {
	const c = clock();
	const sent = [];
	const sender = createPresenceSender({ send: (p) => sent.push(p), ...c });

	sender.update(presence(1)); // first goes out at once
	assert.equal(sent.length, 1);

	sender.update(presence(1)); // unchanged: nothing
	c.advance(500);
	assert.equal(sent.length, 1);

	// A burst of 100 movements over one second is throttled to ~10 sends.
	for (let i = 2; i <= 101; i++) {
		sender.update(presence(i));
		c.advance(10);
	}
	c.advance(200);
	assert.ok(sent.length <= 12, `sent ${sent.length}`);
	assert.ok(sent.length >= 9, `sent ${sent.length}`);
	// Gaps between sends are never shorter than the interval, and the last
	// position is the one delivered.
	assert.deepEqual(sent.at(-1), presence(101));
});

test("sender: a value that settles back to the sent one is not resent", () => {
	const c = clock();
	const sent = [];
	const sender = createPresenceSender({ send: (p) => sent.push(p), ...c });
	sender.update(presence(1));
	sender.update(presence(2));
	sender.update(presence(1));
	c.advance(200);
	assert.equal(sent.length, 1);
});

test("sender: resend repeats the current presence", () => {
	const c = clock();
	const sent = [];
	const sender = createPresenceSender({ send: (p) => sent.push(p), ...c });
	sender.resend(); // nothing to say yet
	assert.equal(sent.length, 0);
	sender.update(presence(1));
	sender.resend();
	assert.deepEqual(sent, [presence(1), presence(1)]);
});

test("peers: appear on presence, update in place, disappear when they leave", () => {
	const peers = createPeers();
	const events = [];
	peers.subscribe((e) => events.push(e.type + ":" + e.peerId));

	assert.equal(peers.receive(JSON.stringify({ type: "presence", peerId: "a", presence: presence(1) })), "new");
	assert.equal(peers.receive(JSON.stringify({ type: "presence", peerId: "a", presence: presence(2) })), "update");
	peers.receive(JSON.stringify({ type: "presence", peerId: "b", presence: presence(3) }));
	assert.deepEqual(peers.list().map((p) => p.peerId), ["a", "b"]);
	assert.equal(peers.get("a").cursor.x, 2);

	peers.receive(JSON.stringify({ type: "presence-left", peerId: "a" }));
	assert.deepEqual(peers.list().map((p) => p.peerId), ["b"]);
	assert.deepEqual(events, ["update:a", "update:a", "update:b", "left:a"]);

	// Junk is ignored.
	assert.equal(peers.receive("not json"), undefined);
	assert.equal(peers.receive(JSON.stringify({ type: "presence", presence: {} })), undefined);
	assert.equal(peers.list().length, 1);
});

const followSetup = () => {
	const peers = createPeers();
	const views = [];
	const changes = [];
	const follower = createFollower({
		peers,
		setViewport: (v) => views.push(v),
		onChange: (id) => changes.push(id),
	});
	const say = (peerId, scale) => peers.receive({ type: "presence", peerId, presence: presence(0, scale) });
	return { peers, views, changes, follower, say };
};

test("follow: copies the viewport now and on every update, only for the followed peer", () => {
	const { views, follower, say } = followSetup();
	say("a", 1);
	say("b", 2);
	follower.follow("a");
	assert.deepEqual(views, [{ x: 0, y: 0, scale: 1 }]);
	say("a", 1.5);
	say("b", 3);
	assert.deepEqual(views.map((v) => v.scale), [1, 1.5]);
});

test("follow: our own pan or zoom stops it, but applying their view does not", () => {
	const { views, changes, follower, say } = followSetup();
	say("a", 1);
	follower.follow("a");
	assert.equal(follower.following(), "a");
	follower.viewportMoved(); // outside an apply: the user moved
	assert.equal(follower.following(), undefined);
	say("a", 2);
	assert.equal(views.length, 1, "no longer mirrored");
	assert.deepEqual(changes, ["a", undefined]);
});

test("follow: viewport changes caused by mirroring don't count as the user's", () => {
	const peers = createPeers();
	let follower;
	follower = createFollower({
		peers,
		// Like the real app, setting the viewport notifies viewportMoved.
		setViewport: () => follower.viewportMoved(),
	});
	peers.receive({ type: "presence", peerId: "a", presence: presence(0) });
	follower.follow("a");
	peers.receive({ type: "presence", peerId: "a", presence: presence(5) });
	assert.equal(follower.following(), "a");
});

test("follow: ends when the followed person leaves", () => {
	const { peers, follower, say } = followSetup();
	say("a", 1);
	follower.follow("a");
	peers.receive({ type: "presence-left", peerId: "a" });
	assert.equal(follower.following(), undefined);
});

test("identity: Are.na name when logged in, else a persisted generated one that can be renamed", () => {
	const store = new Map();
	const storage = { get: (k) => store.get(k) ?? null, set: (k, v) => store.set(k, v) };
	let user = {};
	const identity = createIdentity({ storage, me: () => user });

	const first = identity.get();
	assert.ok(first.name && first.color);
	assert.equal(identity.loggedIn(), false);

	// Stable across reloads (a new identity object over the same storage).
	assert.deepEqual(createIdentity({ storage, me: () => user, random: () => 0.99 }).get(), first);

	assert.equal(identity.rename("  Ann  "), true);
	assert.equal(identity.get().name, "Ann");
	assert.equal(createIdentity({ storage, me: () => user }).get().name, "Ann");
	assert.equal(identity.rename("   "), false);

	user = { name: "Ann Arena", slug: "ann-arena" };
	assert.equal(identity.loggedIn(), true);
	assert.deepEqual(identity.get(), { name: "Ann Arena", color: first.color });
});

test("coordinates: screen and canvas points convert both ways", () => {
	const size = { width: 1000, height: 800 };
	for (const viewport of [{ x: 0, y: 0, scale: 1 }, { x: 120, y: -40, scale: 0.5 }, { x: -300, y: 70, scale: 2 }]) {
		const point = { x: 250, y: 600 };
		const canvas = screenToCanvas(viewport, size, point);
		const back = canvasToScreen(viewport, size, canvas);
		assert.ok(Math.abs(back.x - point.x) < 1e-9 && Math.abs(back.y - point.y) < 1e-9);
	}
	// The window centre is the viewport centre at any zoom.
	assert.deepEqual(screenToCanvas({ x: 100, y: 50, scale: 2 }, size, { x: 500, y: 400 }), { x: 600, y: 450 });
});

test("wire: takes text frames, passes binary on, sends JSON, announces reconnects", () => {
	const handlers = {};
	const passed = [];
	const sentFrames = [];
	const network = {
		socket: { readyState: 1, send: (f) => sentFrames.push(f) },
		receiveMessage: (data) => passed.push(data),
		on: (event, fn) => { handlers[event] = fn; },
		off: (event) => { delete handlers[event]; },
	};
	const link = linkPresence(network);
	const got = [];
	let connects = 0;
	link.onMessage((text) => got.push(text));
	link.onConnect(() => connects++);

	network.receiveMessage('{"type":"presence"}');
	network.receiveMessage(new Uint8Array([1, 2]));
	assert.deepEqual(got, ['{"type":"presence"}']);
	assert.equal(passed.length, 1);

	link.send(presence(1));
	assert.deepEqual(JSON.parse(sentFrames[0]), { type: "presence", presence: presence(1) });
	network.socket = { readyState: 0, send: () => assert.fail("socket not open") };
	link.send(presence(2));

	handlers["peer-candidate"]();
	assert.equal(connects, 1);

	link.stop();
	network.receiveMessage('{"type":"presence"}');
	assert.equal(got.length, 1);
});
