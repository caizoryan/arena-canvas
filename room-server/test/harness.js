// Runs the Room Durable Object in Node. A fake `ctx` stands in for the
// Durable Object runtime (accepted sockets with attachments, async storage),
// and a real `ws` server carries the bytes, so tests can connect the real
// automerge-repo browser client adapter. hibernate() rebuilds the Room from
// the same ctx while sockets stay open, as the runtime does after eviction.
import { WebSocketServer } from "ws";
import { Room } from "../src/room.js";

export function fakeCtx() {
	const data = new Map();
	const writes = [];
	const sockets = [];
	return {
		id: { toString: () => "0123456789abcdef" },
		storage: {
			get: async (key) => data.get(key),
			put: async (key, value) => {
				writes.push(key);
				data.set(key, structuredClone(value));
			},
			delete: async (key) => data.delete(key),
			list: async ({ prefix = "" } = {}) => new Map(
				[...data].filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => a < b ? -1 : 1),
			),
		},
		acceptWebSocket: (socket) => sockets.push(socket),
		getWebSockets: () => sockets.filter((socket) => !socket.closed),
		data, writes, sockets,
	};
}

// The parts of a hibernatable Durable Object WebSocket the Room uses.
function hibernatableSocket(raw) {
	let attachment = null;
	return {
		closed: false,
		send: (message) => raw.send(message),
		close: () => raw.close(),
		serializeAttachment: (value) => { attachment = structuredClone(value); },
		deserializeAttachment: () => structuredClone(attachment),
	};
}

const toArrayBuffer = (buffer) =>
	buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

export async function startRoom(env = {}) {
	const ctx = fakeCtx();
	let room = new Room(ctx, env);
	const wss = new WebSocketServer({ port: 0 });
	await new Promise((resolve) => wss.on("listening", resolve));

	wss.on("connection", (raw) => {
		const socket = hibernatableSocket(raw);
		ctx.acceptWebSocket(socket);
		raw.on("message", (data, isBinary) => {
			room.webSocketMessage(socket, isBinary ? toArrayBuffer(data) : data.toString());
		});
		raw.on("close", (code, reason) => {
			socket.closed = true;
			room.webSocketClose(socket, code, reason.toString(), true);
		});
	});

	return {
		ctx,
		url: `ws://localhost:${wss.address().port}/room/test`,
		get room() { return room; },
		hibernate: () => { room = new Room(ctx, env); return room; },
		close: () => new Promise((resolve) => {
			wss.clients.forEach((client) => client.terminate());
			wss.close(resolve);
		}),
	};
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Poll until check() is truthy, so tests don't depend on exact timing. A
// check that throws (e.g. a document the room hasn't received yet) counts as
// not yet.
export async function eventually(check, { timeout = 3000, interval = 20 } = {}) {
	const start = Date.now();
	let lastError;
	for (;;) {
		try {
			const value = await check();
			if (value) return value;
		} catch (error) {
			lastError = error;
		}
		if (Date.now() - start > timeout) {
			throw new Error("Timed out waiting for condition", { cause: lastError });
		}
		await wait(interval);
	}
}
