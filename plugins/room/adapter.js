import {
	isEmptyCanvas,
	readCanvas,
	roomIdOf,
	roomSlug,
	roomTitle,
	writeCanvas,
} from "./document.js";

// The Room state adapter (ADR 0003): Are.na's operations over Room documents,
// addressed as `room:<roomId>` where the room id is the Automerge document id.
// Saving is live: every change syncs, there is no Save.
//
//   loadAutomerge()      resolves to the vendored automerge-repo module, only
//                        when a room is first used
//   connect(AM, roomId)  the network adapter that reaches that room's server
//   fallback             the Are.na adapter, for slugs that aren't rooms,
//                        blocks a room doesn't hold, and `me`
//   viewport             { get(roomId), set(roomId, transform) }: each user's
//                        own pan/zoom, kept outside the document
//   getSlug()            the open canvas's slug, which saveCanvas writes to
const NATIVE_ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

// Native blocks get random ids, never a counter, so blocks made offline by
// different people can't collide.
const nativeId = () => "DURABLE-" + Array.from(
	crypto.getRandomValues(new Uint8Array(10)),
	(byte) => NATIVE_ID_ALPHABET[byte % NATIVE_ID_ALPHABET.length],
).join("");

const plain = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

// The WebSocket client calls itself ready after 1 s even if the server
// hasn't answered, and a find() before the server answers reports the room
// unavailable. A cold room (TLS, Durable Object start, WASM) can take longer,
// so wait for the server's answer, up to this long.
const SERVER_WAIT_MS = 10000;

const reachServer = (network) => new Promise((resolve) => {
	if (network.remotePeerId) return resolve();
	let done = () => {
		clearTimeout(timer);
		network.off("peer-candidate", done);
		resolve();
	};
	let timer = setTimeout(done, SERVER_WAIT_MS);
	network.on("peer-candidate", done);
});

export const createRoomAdapter = ({
	loadAutomerge,
	connect,
	fallback = {},
	viewport,
	getSlug = () => undefined,
}) => {
	let AM;
	let repo;
	let connections = new Map(); // roomId -> network adapter
	let handles = new Map(); // roomId -> DocHandle
	let listeners = new Set();
	// Last copy of every block seen, so a block removed from a room can still
	// be looked up (it lives on in Are.na).
	let knownBlocks = new Map();
	// Set while this adapter changes a document. automerge-repo emits change
	// events synchronously inside handle.change and doesn't say where a change
	// came from, so this is how local changes stay out of subscribe.
	let changingLocally = false;

	// A document goes only to its own room's server.
	let ownServer = async (peerId, documentId) =>
		connections.get(documentId)?.remotePeerId == peerId;

	// One load and one repo, however many calls arrive before it's ready.
	let starting;
	let ready = () => starting ??= (async () => {
		AM = await loadAutomerge();
		repo = new AM.Repo({
			network: [],
			shareConfig: { announce: ownServer, access: ownServer },
		});
		return repo;
	})();

	let watch = (roomId, handle) => {
		handle.on("change", ({ doc }) => {
			if (changingLocally) return;
			let slug = roomSlug(roomId);
			listeners.forEach((listener) => listener({
				slug,
				canvas: readCanvas(doc),
				// Channel cards sit on the canvas as `c<id>`.
				block: (id) => plain(doc.blocks[String(id)] ?? doc.blocks[String(id).replace(/^c/, "")]),
			}));
		});
	};

	let link = (roomId) => {
		if (connections.has(roomId)) return;
		let network = connect(AM, roomId);
		connections.set(roomId, network);
		repo.networkSubsystem.addNetworkAdapter(network);
	};

	let open = async (roomId) => {
		if (handles.has(roomId)) return handles.get(roomId);
		await ready();
		link(roomId);
		await reachServer(connections.get(roomId));
		let handle = await repo.find("automerge:" + roomId);
		if (handles.has(roomId)) return handles.get(roomId);
		handles.set(roomId, handle);
		watch(roomId, handle);
		return handle;
	};

	let change = (handle, fn) => {
		changingLocally = true;
		try {
			handle.change(fn);
		} finally {
			changingLocally = false;
		}
	};

	// The open room holding a block, if any.
	let roomWith = (blockId) => {
		for (let [roomId, handle] of handles) {
			if (handle.doc()?.blocks[String(blockId)]) return { roomId, handle };
		}
	};

	let remember = (block) => {
		if (block?.id !== undefined) knownBlocks.set(String(block.id), block);
		return block;
	};

	// The default canvas of a room, shaped like an Are.na `.canvas` block so
	// the app's loading path opens rooms unchanged.
	let canvasBlock = (roomId, doc) => ({
		id: `room-canvas:${roomId}`,
		title: ".canvas",
		class: "Text",
		type: "Text",
		content: {
			plain: JSON.stringify(readCanvas(doc, viewport?.get(roomId))),
		},
	});

	let get_channel = async (slug, ...rest) => {
		let roomId = roomIdOf(slug);
		if (!roomId) return fallback.get_channel?.(slug, ...rest);
		try {
			let { meta } = (await open(roomId)).doc();
			return { id: roomId, slug, title: roomTitle(meta) };
		} catch {
			return undefined;
		}
	};

	let get_channel_contents = async (slug, ...rest) => {
		let roomId = roomIdOf(slug);
		if (!roomId) return fallback.get_channel_contents?.(slug, ...rest);
		let doc;
		try {
			doc = (await open(roomId)).doc();
		} catch {
			return { error: "Room not found" };
		}
		let blocks = Object.values(doc.blocks).map(plain).map(remember);
		if (!isEmptyCanvas(doc)) blocks.push(canvasBlock(roomId, doc));
		return { data: blocks };
	};

	let get_block = async (id) => {
		let canvasOf = String(id).match(/^room-canvas:(.+)$/)?.[1];
		if (canvasOf) {
			let handle = handles.get(canvasOf);
			return handle && canvasBlock(canvasOf, handle.doc());
		}
		let found = roomWith(id);
		if (found) return remember(plain(found.handle.doc().blocks[String(id)]));
		return knownBlocks.get(String(id)) ?? fallback.get_block?.(id);
	};

	let add_block = async (slug, title, value) => {
		let roomId = roomIdOf(slug);
		if (!roomId) return fallback.add_block?.(slug, title, value);
		let handle = await open(roomId);
		let now = new Date().toISOString();
		let block = {
			id: nativeId(),
			title: title ?? "",
			class: "Text",
			type: "Text",
			description: "",
			content: { plain: value ?? "", markdown: value ?? "" },
			created_at: now,
			updated_at: now,
		};
		change(handle, (doc) => { doc.blocks[block.id] = block; });
		return remember(block);
	};

	let update_block = async (id, body = {}) => {
		let found = roomWith(id);
		if (!found) return { ok: false, status: 404 };
		change(found.handle, (doc) => {
			let block = doc.blocks[String(id)];
			if (body.title !== undefined) block.title = body.title;
			if (body.description !== undefined) block.description = body.description;
			if (body.content !== undefined) {
				block.content = { ...plain(block.content), plain: body.content, markdown: body.content };
			}
			block.updated_at = new Date().toISOString();
		});
		return { ok: true, status: 200 };
	};

	// Connecting into a room copies the block in, keeping its Are.na id.
	let connect_block = async (slug, id, connectableType = "Block") => {
		let roomId = roomIdOf(slug);
		if (!roomId) return fallback.connect_block?.(slug, id, connectableType);
		let block = connectableType == "Channel"
			? await fallback.get_channel?.(id)
			: await get_block(id);
		if (!block) throw new Error(`Couldn't connect block: ${id} not found`);
		let handle = await open(roomId);
		change(handle, (doc) => { doc.blocks[String(block.id)] = plain(block); });
		return remember(plain(block));
	};

	// Removing a block from a room also removes it from the room's canvas.
	let disconnect_block = async (slug, id) => {
		let roomId = roomIdOf(slug);
		if (!roomId) return fallback.disconnect_block?.(slug, id) ?? { ok: false, status: 404 };
		let handle = await open(roomId);
		let key = String(id);
		if (!handle.doc().blocks[key]) return { ok: false, status: 404 };
		remember(plain(handle.doc().blocks[key]));
		change(handle, (doc) => {
			delete doc.blocks[key];
			delete doc.canvas.nodes[key];
			Object.entries(doc.canvas.edges).forEach(([edgeKey, edge]) => {
				if (String(edge.fromNode) == key || String(edge.toNode) == key) {
					delete doc.canvas.edges[edgeKey];
				}
			});
		});
		return { ok: true };
	};

	// Uploads stored by rooms are out of scope; ticket 16 adds uploading to
	// Are.na from a room instead.
	let refuseUpload = async () => {
		throw new Error("Uploads aren't supported in rooms yet");
	};

	let saveCanvas = async (data) => {
		let roomId = roomIdOf(getSlug());
		let handle = roomId && handles.get(roomId);
		if (!handle) return { ok: false };
		change(handle, (doc) => writeCanvas(doc, data));
		if (data.transform) viewport?.set(roomId, plain(data.transform));
		return { ok: true, created: false };
	};

	let subscribe = (listener) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};

	// Start a room from an eject snapshot; resolves to its slug.
	let createRoom = async (document) => {
		await ready();
		let handle = repo.create(document);
		let roomId = handle.documentId;
		handles.set(roomId, handle);
		watch(roomId, handle);
		link(roomId);
		return roomSlug(roomId);
	};

	// Leaving rooms closes their sockets. The repo is rebuilt on next use.
	let teardown = async () => {
		let closing = starting && await starting;
		starting = undefined;
		repo = undefined;
		handles = new Map();
		connections = new Map();
		await closing?.shutdown();
	};

	return {
		id: "room",
		prefix: "room",
		saveMode: "live",
		get_channel,
		get_channel_contents,
		get_block,
		add_block,
		add_link: (slug, url) => add_block(slug, "", url),
		add_file: refuseUpload,
		add_image: refuseUpload,
		update_block,
		connect_block,
		disconnect_block,
		upload_file: refuseUpload,
		upload_image: refuseUpload,
		me: (...args) => fallback.me?.(...args),
		saveCanvas,
		subscribe,
		createRoom,
		teardown,
		// The network adapter reaching a room's server, once the room is open;
		// presence rides its WebSocket (presence.js).
		network: (roomId) => connections.get(roomId),
	};
};
