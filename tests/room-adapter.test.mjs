// Run: node --test tests/room-adapter.test.mjs
// The Room adapter against an in-memory "server": a second automerge-repo
// joined to the adapter's repo by a MessageChannel per room, no Worker.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRoomAdapter } from "../plugins/room/adapter.js";
import { createRoomDocument, roomSlug } from "../plugins/room/document.js";
import { startMirror } from "../plugins/room/mirror.js";
import { createStore } from "../store.js";
import { stateAdapterContract } from "./state-adapter-contract.mjs";

const AM = await import("../vendor/automerge/automerge-repo.js");
await AM.initializeWasm(await readFile(new URL("../vendor/automerge/automerge.wasm", import.meta.url)));

// The smallest automerge-repo network adapter over a MessagePort. Like the
// WebSocket client, it's ready once the other side has answered.
class PortAdapter extends AM.NetworkAdapter {
	constructor(port) {
		super();
		this.port = port;
		this.ready = new Promise((resolve) => { this.resolveReady = resolve; });
	}
	isReady() { return Boolean(this.remotePeerId); }
	whenReady() { return this.ready; }
	connect(peerId, peerMetadata) {
		this.peerId = peerId;
		this.port.onmessage = ({ data }) => {
			if (data.type == "arrive") {
				this.port.postMessage({ type: "welcome", senderId: peerId, peerMetadata });
			}
			if (data.type == "arrive" || data.type == "welcome") {
				if (this.remotePeerId) return;
				this.remotePeerId = data.senderId;
				this.emit("peer-candidate", { peerId: data.senderId, peerMetadata: data.peerMetadata });
				this.emit("ready", { network: this });
				this.resolveReady();
				return;
			}
			this.emit("message", data);
		};
		this.port.postMessage({ type: "arrive", senderId: peerId, peerMetadata });
	}
	send(message) { this.port.postMessage(message); }
	disconnect() { this.port.close(); }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function eventually(check, timeout = 3000) {
	const start = Date.now();
	for (;;) {
		try {
			if (await check()) return;
		} catch {
			// not yet
		}
		if (Date.now() - start > timeout) throw new Error("Timed out waiting for condition");
		await wait(10);
	}
}

const textBlock = (id, title, content) => ({
	id, title, class: "Text", type: "Text", description: "",
	content: { plain: content, markdown: content },
});

// Like the WebSocket client: declares itself ready after `forceReadyMs` even
// if the server hasn't answered, and the server answers after `answerMs`.
class SlowPortAdapter extends PortAdapter {
	constructor(port, { forceReadyMs, answerMs }) {
		super(port);
		this.forceReadyMs = forceReadyMs;
		this.answerMs = answerMs;
	}
	connect(peerId, peerMetadata) {
		setTimeout(() => {
			this.forced = true;
			this.emit("ready", { network: this });
			this.resolveReady();
		}, this.forceReadyMs);
		const realPort = this.port;
		const delayed = { postMessage: (m) => realPort.postMessage(m), close: () => realPort.close() };
		Object.defineProperty(delayed, "onmessage", {
			set: (fn) => { realPort.onmessage = (event) => setTimeout(() => fn(event), this.answerMs); },
		});
		this.port = delayed;
		super.connect(peerId, peerMetadata);
	}
	isReady() { return this.forced || super.isReady(); }
}

// One server repo per room, as there is one Durable Object per room.
async function harness({ slowServer, fresh } = {}) {
	const servers = new Map(); // roomId -> repo
	const serverFor = (roomId) => {
		if (!servers.has(roomId)) servers.set(roomId, new AM.Repo({ network: [], sharePolicy: async () => true }));
		return servers.get(roomId);
	};
	let slug;
	let nextId = 100;
	const viewports = new Map();
	const fallbackBlocks = new Map();
	// When `fresh`, loads finish in reverse order, as concurrent dynamic
	// imports and WASM inits can in a browser.
	let loads = 0;
	const adapter = createRoomAdapter({
		loadAutomerge: async () => {
			if (fresh) await wait(++loads == 1 ? 50 : 10);
			return AM;
		},
		connect: (_, roomId) => {
			const { port1, port2 } = new MessageChannel();
			serverFor(roomId).networkSubsystem.addNetworkAdapter(new PortAdapter(port2));
			return slowServer ? new SlowPortAdapter(port1, slowServer) : new PortAdapter(port1);
		},
		// Stands in for the Are.na adapter, which rooms fall back to for
		// blocks they don't hold.
		fallback: { get_block: async (id) => fallbackBlocks.get(Number(id)) },
		viewport: { get: (id) => viewports.get(id), set: (id, value) => viewports.set(id, value) },
		getSlug: () => slug,
	});

	// Rooms made elsewhere: created on a server repo that then serves only them.
	const seedRoom = (name, blocks, data = { nodes: [], edges: [] }) => {
		const document = createRoomDocument({ originSlug: name, canvasName: "", blocks, data });
		const origin = new AM.Repo({ network: [], sharePolicy: async () => true });
		const handle = origin.create(document);
		servers.set(handle.documentId, origin);
		return handle;
	};
	const seed = async (name, items) => {
		const blocks = items.map(({ title, content }) => textBlock(nextId++, title, content));
		blocks.forEach((block) => fallbackBlocks.set(block.id, block));
		return roomSlug(seedRoom(name, blocks).documentId);
	};

	// A room the adapter already has open, for remote changes.
	const lily = textBlock(nextId++, "Lily", "white");
	const pond = seedRoom("pond", [lily]);
	if (!slowServer && !fresh) await adapter.get_channel_contents(roomSlug(pond.documentId));
	let round = 0;

	return {
		adapter, serverFor, seed, seedRoom, viewports,
		useCanvas: async (id) => {
			slug = id;
			await adapter.get_channel_contents(id);
		},
		remoteChange: async () => {
			const title = `Lily ${++round}`;
			pond.change((doc) => { doc.blocks[lily.id].title = title; });
			await eventually(async () => (await adapter.get_block(lily.id)).title == title);
		},
		close: async () => {
			await adapter.teardown();
			await Promise.all([...servers.values()].map((repo) => repo.shutdown()));
		},
	};
}

stateAdapterContract("Room", harness);

// A store shaped like the app's, plus the callbacks the app gives the mirror.
function appStore(canvas) {
	const store = createStore({ data: { nodes: canvas.nodes, edges: canvas.edges } });
	const mounted = [];
	const unmounted = [];
	let edgeRenders = 0;
	const callbacks = {
		mount: (node) => { mounted.push(node.id); store.apply(["data", "nodes"], "push", node, false); },
		unmount: (node) => {
			unmounted.push(node.id);
			const index = store.get(["data", "nodes"]).findIndex((n) => n.id == node.id);
			store.apply(["data", "nodes"], "remove", [index, 1], false);
		},
		edgesChanged: () => { edgeRenders++; },
	};
	return {
		store, callbacks, mounted, unmounted,
		get edgeRenders() { return edgeRenders; },
		node: (id) => store.get(["data", "nodes"]).find((n) => n.id == id),
		set: (id, key, value) => {
			const index = store.get(["data", "nodes"]).findIndex((n) => n.id == id);
			store.apply(["data", "nodes", index], "set", [key, value]);
		},
	};
}

const node = (id, x, y) => ({ id, type: "text", x, y, width: 100, height: 80 });

async function openRoom(h, data) {
	const blocks = data.nodes.map((n) => textBlock(n.id, `Block ${n.id}`, ""));
	const handle = h.seedRoom("garden", blocks, data);
	const slug = roomSlug(handle.documentId);
	await h.useCanvas(slug);
	const canvasBlock = (await h.adapter.get_channel_contents(slug)).data.find((b) => b.title == ".canvas");
	const app = appStore(JSON.parse(canvasBlock.content.plain));
	const stop = startMirror({
		store: app.store, adapter: h.adapter, slug,
		getData: () => app.store.get(["data"]),
		delay: 0, ...app.callbacks,
	});
	return { handle, slug, app, stop };
}

test("eject snapshots the canvas: copied blocks keep their ids, nodes get z, extras become plugin data", () => {
	const blocks = [textBlock(7, "Seven", "7"), textBlock(9, "Nine", "9"), textBlock(1, ".canvas", "{}"), textBlock(2, ".room:old", "{}")];
	const data = {
		nodes: [node(9, 0, 0), node(7, 10, 10)],
		edges: [{ id: "e1", fromNode: 9, toNode: 7, fromSide: "right", toSide: "left" }],
		nodeHash: { 9: ["data", "nodes", 0] },
		transform: { x: 1, y: 2, scale: 1 },
		scenes: [{ name: "intro" }],
	};
	const doc = createRoomDocument({
		originSlug: "garden", canvasName: "spring", blocks, data, now: new Date("2026-10-25T10:00:00Z"),
	});

	assert.deepEqual(doc.meta, { originSlug: "garden", canvasName: "spring", ejectedAt: "2026-10-25T10:00:00.000Z", closed: false });
	assert.deepEqual(Object.keys(doc.blocks).sort(), ["7", "9"]);
	assert.equal(doc.blocks[7].id, 7);
	assert.deepEqual(doc.canvas.nodes[9], { ...node(9, 0, 0), z: 0 });
	assert.deepEqual(doc.canvas.nodes[7], { ...node(7, 10, 10), z: 1 });
	assert.deepEqual(doc.canvas.edges.e1, data.edges[0]);
	assert.deepEqual(doc.plugins, { scenes: [{ name: "intro" }] });
});

test("an ejected room reaches the server and opens as a live canvas", async () => {
	const h = await harness();
	try {
		const doc = createRoomDocument({
			originSlug: "garden", canvasName: "", blocks: [textBlock(7, "Seven", "7")],
			data: { nodes: [node(7, 5, 6)], edges: [] },
		});
		const slug = await h.adapter.createRoom(doc);
		const roomId = slug.replace("room:", "");

		await eventually(async () => (await h.serverFor(roomId).find(`automerge:${roomId}`)).doc().blocks[7].title == "Seven");
		assert.equal(h.adapter.saveMode, "live");
		const contents = await h.adapter.get_channel_contents(slug);
		const canvas = JSON.parse(contents.data.find((b) => b.title == ".canvas").content.plain);
		assert.deepEqual(canvas.nodes, [node(7, 5, 6)]);
		assert.equal((await h.adapter.get_channel(slug)).title, "garden (room)");
	} finally {
		await h.close();
	}
});

test("rooms only share their document with their own server", async () => {
	const h = await harness();
	try {
		const empty = { nodes: [], edges: [] };
		const a = (await h.adapter.createRoom(createRoomDocument({ originSlug: "a", blocks: [], data: empty }))).slice(5);
		const b = (await h.adapter.createRoom(createRoomDocument({ originSlug: "b", blocks: [], data: empty }))).slice(5);
		await eventually(async () => (await h.serverFor(a).find(`automerge:${a}`)).doc());
		await eventually(async () => (await h.serverFor(b).find(`automerge:${b}`)).doc());
		await wait(100);

		assert.equal(h.serverFor(b).handles[a], undefined, "room b's server never received room a");
		assert.equal(h.serverFor(a).handles[b], undefined, "room a's server never received room b");
	} finally {
		await h.close();
	}
});

test("local saves don't notify subscribers", async () => {
	const h = await harness();
	try {
		const slug = await h.seed("garden", [{ title: "Tulip", content: "red" }]);
		await h.useCanvas(slug);
		const seen = [];
		h.adapter.subscribe((change) => seen.push(change));
		await h.adapter.saveCanvas({ nodes: [node(1, 0, 0)], edges: [] });
		await wait(50);
		assert.equal(seen.length, 0);
	} finally {
		await h.close();
	}
});

test("a local store change reaches the other client", async () => {
	const h = await harness();
	try {
		const { handle, app, stop } = await openRoom(h, { nodes: [node(1, 0, 0), node(2, 200, 0)], edges: [] });

		app.set(1, "x", 500);
		app.set(2, "height", 300);

		await eventually(() => handle.doc().canvas.nodes[1].x == 500 && handle.doc().canvas.nodes[2].height == 300);
		stop();
	} finally {
		await h.close();
	}
});

test("a remote change lands in the store without undo history and isn't echoed back", async () => {
	const h = await harness();
	try {
		const { handle, app, stop } = await openRoom(h, {
			nodes: [node(1, 0, 0), node(2, 200, 0)], edges: [],
		});

		handle.change((doc) => {
			doc.canvas.nodes[2].y = 75;
			doc.canvas.edges.e1 = { id: "e1", fromNode: 1, toNode: 2, fromSide: "right", toSide: "left" };
		});
		const changesAfterRemote = AM.Automerge.getAllChanges(handle.doc()).length;

		await eventually(() => app.node(2).y == 75);
		assert.deepEqual(app.store.get(["data", "edges"]).map((e) => e.id), ["e1"]);
		assert.ok(app.edgeRenders > 0);
		assert.equal(app.store.canUndo(), false);

		await wait(100);
		assert.equal(AM.Automerge.getAllChanges(handle.doc()).length, changesAfterRemote);
		stop();
	} finally {
		await h.close();
	}
});

test("remote node additions and removals mount and unmount blocks", async () => {
	const h = await harness();
	try {
		const { handle, app, stop } = await openRoom(h, { nodes: [node(1, 0, 0), node(2, 200, 0)], edges: [] });

		handle.change((doc) => {
			delete doc.canvas.nodes[1];
			doc.canvas.nodes[3] = { ...node(3, 50, 50), z: 10 };
		});

		await eventually(() => app.mounted.includes(3) && app.unmounted.includes(1));
		assert.deepEqual(app.store.get(["data", "nodes"]).map((n) => n.id).sort(), [2, 3]);
		stop();
	} finally {
		await h.close();
	}
});

test("node order follows z, and saving only rewrites z where the order changed", async () => {
	const h = await harness();
	try {
		const handle = h.seedRoom("garden", [], { nodes: [], edges: [] });
		handle.change((doc) => {
			doc.canvas.nodes.a = { ...node("a", 0, 0), z: 3 };
			doc.canvas.nodes.b = { ...node("b", 0, 0), z: 1 };
			doc.canvas.nodes.c = { ...node("c", 0, 0), z: 2 };
		});
		const slug = roomSlug(handle.documentId);
		await h.useCanvas(slug);
		const read = async () => JSON.parse((await h.adapter.get_channel_contents(slug)).data
			.find((b) => b.title == ".canvas").content.plain);
		assert.deepEqual((await read()).nodes.map((n) => n.id), ["b", "c", "a"]);

		// Move "b" to the front (end of the array).
		await h.adapter.saveCanvas({ nodes: [node("c", 0, 0), node("a", 0, 0), node("b", 0, 0)], edges: [] });
		await eventually(() => handle.doc().canvas.nodes.b.z > handle.doc().canvas.nodes.a.z);
		assert.equal(handle.doc().canvas.nodes.c.z, 2);
		assert.equal(handle.doc().canvas.nodes.a.z, 3);
		assert.deepEqual((await read()).nodes.map((n) => n.id), ["c", "a", "b"]);
	} finally {
		await h.close();
	}
});

test("the viewport stays with each user and never enters the document", async () => {
	const h = await harness();
	try {
		const slug = await h.seed("garden", [{ title: "Tulip", content: "red" }]);
		await h.useCanvas(slug);
		const roomId = slug.slice(5);

		await h.adapter.saveCanvas({ nodes: [node(1, 0, 0)], edges: [], transform: { x: 40, y: 50, scale: 2 } });

		const doc = (await h.serverFor(roomId).find(`automerge:${roomId}`)).doc();
		assert.equal(JSON.stringify(doc).includes("transform"), false);
		assert.deepEqual(h.viewports.get(roomId), { x: 40, y: 50, scale: 2 });
		const canvas = JSON.parse((await h.adapter.get_channel_contents(slug)).data
			.find((b) => b.title == ".canvas").content.plain);
		assert.deepEqual(canvas.transform, { x: 40, y: 50, scale: 2 });
	} finally {
		await h.close();
	}
});

test("the room's canvas block can be fetched by id without asking Are.na", async () => {
	const h = await harness();
	try {
		const slug = await h.seed("garden", [{ title: "Tulip", content: "red" }]);
		await h.useCanvas(slug);
		await h.adapter.saveCanvas({ nodes: [node(1, 3, 4)], edges: [] });
		const listed = (await h.adapter.get_channel_contents(slug)).data.find((b) => b.title == ".canvas");

		const fetched = await h.adapter.get_block(listed.id);

		assert.deepEqual(fetched, listed);
	} finally {
		await h.close();
	}
});

test("a room opens even when its server answers after the client gave up waiting", async () => {
	const h = await harness({ slowServer: { forceReadyMs: 20, answerMs: 300 } });
	try {
		const slug = await h.seed("garden", [{ title: "Tulip", content: "red" }]);

		const contents = await h.adapter.get_channel_contents(slug);

		assert.deepEqual(contents.data?.map((b) => b.title), ["Tulip"]);
	} finally {
		await h.close();
	}
});

test("the first room opened can be asked for several things at once", async () => {
	// The app loads a canvas's contents and its channel in parallel.
	const h = await harness({ fresh: true });
	try {
		const slug = await h.seed("garden", [{ title: "Tulip", content: "red" }]);

		const [contents, channel] = await Promise.all([
			h.adapter.get_channel_contents(slug),
			h.adapter.get_channel(slug),
		]);

		assert.deepEqual(contents.data?.map((b) => b.title), ["Tulip"]);
		assert.equal(channel?.slug, slug);
	} finally {
		await h.close();
	}
});
