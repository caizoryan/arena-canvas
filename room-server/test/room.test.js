// Run: npm test (from room-server/)
import assert from "node:assert/strict";
import test from "node:test";
import * as A from "@automerge/automerge";
import { Repo, cbor } from "@automerge/automerge-repo";
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { eventually, fakeCtx, startRoom, wait } from "./harness.js";
import { Room } from "../src/room.js";

// Short throttle so tests don't wait 2 s per save.
const env = { SAVE_DEBOUNCE_MS: "50" };

// A browser-like client: the real automerge-repo websocket client adapter.
function client(server) {
	const repo = new Repo({ network: [new WebSocketClientAdapter(server.url)] });
	return repo;
}

// A bare socket that speaks the wire protocol by hand, for cases the real
// client never produces.
async function rawPeer(server, peerId, { join = true } = {}) {
	const socket = new WebSocket(server.url);
	socket.binaryType = "arraybuffer";
	const received = [];
	socket.addEventListener("message", ({ data }) => {
		received.push(typeof data == "string" ? JSON.parse(data) : cbor.decode(new Uint8Array(data)));
	});
	await new Promise((resolve) => socket.addEventListener("open", resolve));
	const peer = {
		socket, received,
		sendBinary: (message) => socket.send(cbor.encode(message)),
		sendText: (message) => socket.send(JSON.stringify(message)),
		presence: () => received.filter((m) => m.type?.startsWith("presence")),
	};
	if (join) {
		peer.sendBinary({ type: "join", senderId: peerId, peerMetadata: { isEphemeral: true }, supportedProtocolVersions: ["1"] });
		await eventually(() => received.some((m) => m.type == "peer"));
	}
	return peer;
}

async function withRoom(fn) {
	const server = await startRoom(env);
	const repos = [];
	try {
		await fn(server, (repo) => (repos.push(repo), repo));
	} finally {
		await Promise.all(repos.map((repo) => repo.shutdown()));
		await server.close();
	}
}

test("joining gets a peer reply and records the peer on the socket", () => withRoom(async (server) => {
	const peer = await rawPeer(server, "alice");

	const reply = peer.received.find((m) => m.type == "peer");
	assert.equal(reply.targetId, "alice");
	assert.equal(reply.selectedProtocolVersion, "1");
	assert.ok(reply.senderId);
	assert.deepEqual(server.ctx.sockets[0].deserializeAttachment(), {
		peerId: "alice", peerMetadata: { isEphemeral: true },
	});
	peer.socket.close();
}));

test("two clients edit one document through the room", () => withRoom(async (server, track) => {
	const alice = track(client(server));
	const bob = track(client(server));

	const handle = alice.create({ title: "hello" });
	const bobHandle = await bob.find(handle.url);
	assert.equal(bobHandle.doc().title, "hello");

	bobHandle.change((doc) => { doc.title = "hello, both"; });
	await eventually(() => handle.doc().title == "hello, both");
}));

test("a socket may only speak as the peer that joined on it", () => withRoom(async (server, track) => {
	const alice = track(client(server));
	const handle = alice.create({ title: "secret" });
	await eventually(async () => (await server.room.repo.find(handle.documentId)).doc()?.title == "secret");

	// A valid sync message carrying a change, built by syncing a local fork
	// against a copy of the room's document until it has changes to send.
	let fork = A.change(A.clone(handle.doc()), (doc) => { doc.title = "changed"; });
	let copy = A.clone(handle.doc());
	let forkState = A.initSyncState();
	let copyState = A.initSyncState();
	let data;
	for (;;) {
		[forkState, data] = A.generateSyncMessage(fork, forkState);
		if (A.decodeSyncMessage(data).changes.length) break;
		[copy, copyState] = A.receiveSyncMessage(copy, copyState, data);
		let reply;
		[copyState, reply] = A.generateSyncMessage(copy, copyState);
		[fork, forkState] = A.receiveSyncMessage(fork, forkState, reply);
	}

	const mallory = await rawPeer(server, "mallory");
	const sync = (senderId) => ({
		type: "sync", senderId, targetId: mallory.received[0].senderId,
		documentId: handle.documentId, data,
	});
	const roomTitle = async () => (await server.room.repo.find(handle.documentId)).doc().title;

	mallory.sendBinary(sync("someone-else"));
	await wait(300);
	assert.equal(await roomTitle(), "secret");

	mallory.sendBinary(sync("mallory"));
	await eventually(async () => await roomTitle() == "changed");
	mallory.socket.close();
}));

test("after hibernation the rebuilt room re-adopts open sockets and keeps syncing", () => withRoom(async (server, track) => {
	const alice = track(client(server));
	const bob = track(client(server));
	const handle = alice.create({ count: 0 });
	const bobHandle = await bob.find(handle.url);
	await eventually(() => bobHandle.doc().count == 0);
	const socketsBefore = server.ctx.sockets.length;

	server.hibernate();
	handle.change((doc) => { doc.count = 1; });
	await eventually(() => bobHandle.doc().count == 1);
	bobHandle.change((doc) => { doc.count = 2; });
	await eventually(() => handle.doc().count == 2);

	assert.equal(server.ctx.sockets.length, socketsBefore, "no client reconnected");
}));

test("document saves are batched and a fresh room loads them from storage", async () => {
	const server = await startRoom({ SAVE_DEBOUNCE_MS: "300" });
	const alice = client(server);
	try {
		const handle = alice.create({ items: [] });
		for (let i = 0; i < 20; i++) {
			handle.change((doc) => { doc.items.push(i); });
			await wait(10);
		}
		await eventually(async () => (await server.room.repo.find(handle.documentId)).doc()?.items.length == 20);
		await wait(700);

		const docWrites = server.ctx.writes.filter((key) => key.startsWith(handle.documentId));
		assert.ok(docWrites.length > 0, "the document was persisted");
		assert.ok(docWrites.length <= 4, `20 changes took ${docWrites.length} writes`);
		assert.ok(docWrites.every((key) => key.split("/").length >= 2), "keys are joined storage-key paths");

		// A new instance with no sockets, as after a restart.
		const restarted = new Room({ ...server.ctx, getWebSockets: () => [] }, {});
		const loaded = await restarted.repo.find(handle.documentId);
		assert.deepEqual([...loaded.doc().items], [...Array(20).keys()]);
		await restarted.repo.shutdown();
	} finally {
		await alice.shutdown();
		await server.close();
	}
});

test("presence goes to every other joined socket, stamped with the sender, never stored", () => withRoom(async (server) => {
	const a = await rawPeer(server, "a");
	const b = await rawPeer(server, "b");
	const c = await rawPeer(server, "c");
	const lurker = await rawPeer(server, "lurker", { join: false });
	const writes = server.ctx.writes.length;

	a.sendText({ type: "presence", peerId: "spoofed", presence: { cursor: { x: 1, y: 2 } } });
	lurker.sendText({ type: "presence", presence: { cursor: { x: 9, y: 9 } } });

	const expected = { type: "presence", peerId: "a", presence: { cursor: { x: 1, y: 2 } } };
	await eventually(() => b.presence().length && c.presence().length);
	await wait(100);
	assert.deepEqual(b.presence(), [expected]);
	assert.deepEqual(c.presence(), [expected]);
	assert.deepEqual(a.presence(), []);
	assert.deepEqual(lurker.presence(), []);
	assert.equal(server.ctx.writes.length, writes);

	// Presence still fans out after hibernation, and leaving is announced.
	server.hibernate();
	c.sendText({ type: "presence", presence: { cursor: { x: 3, y: 4 } } });
	await eventually(() => b.presence().length == 2);
	a.socket.close();
	await eventually(() => b.presence().some((m) => m.type == "presence-left"));
	assert.deepEqual(b.presence().at(-1), { type: "presence-left", peerId: "a" });
	[b, c, lurker].forEach((peer) => peer.socket.close());
}));

test("the worker routes /room/<id> websocket upgrades to that room's instance", async () => {
	const { default: worker } = await import("../src/index.js");
	const requested = [];
	const envWithRoom = {
		ROOM: {
			idFromName: (name) => ({ name }),
			get: (id) => ({ fetch: async () => (requested.push(id.name), new Response("upgraded")) }),
		},
	};
	const upgrade = { headers: { Upgrade: "websocket" } };

	const ok = await worker.fetch(new Request("https://rooms.test/room/2xYzAbC", upgrade), envWithRoom);
	assert.equal(await ok.text(), "upgraded");
	assert.deepEqual(requested, ["2xYzAbC"]);

	assert.equal((await worker.fetch(new Request("https://rooms.test/room/2xYzAbC"), envWithRoom)).status, 426);
	assert.equal((await worker.fetch(new Request("https://rooms.test/elsewhere", upgrade), envWithRoom)).status, 404);
	assert.equal((await worker.fetch(new Request("https://rooms.test/room/bad%20id", upgrade), envWithRoom)).status, 404);
	assert.deepEqual(requested, ["2xYzAbC"]);
});
