import { Repo } from "@automerge/automerge-repo";
import { DurableObjectNetworkAdapter } from "./network-adapter.js";
import { DurableObjectStorageAdapter } from "./storage-adapter.js";

// Batch document saves: one storage write per ~2 s of activity instead of one
// per sync message keeps rooms inside the Free plan's daily row writes.
const SAVE_DEBOUNCE_MS = 2000;

// One instance per room (ADR 0001). It holds the room's Automerge document in
// a server-side Repo, persists it to its own storage and syncs it between the
// room's sockets.
//
// Binary frames are automerge-repo messages. Text frames are presence
// (ADR 0006): JSON `{ type: "presence", presence }`, which the room stamps
// with the sender's peer id and forwards to every other joined socket. It is
// never stored. When a socket closes the others get
// `{ type: "presence-left", peerId }`.
//
// A plain class rather than `extends DurableObject`: the runtime only needs
// these methods, and the tests can construct it in Node with a fake ctx.
export class Room {
	constructor(ctx, env = {}) {
		this.ctx = ctx;
		this.network = new DurableObjectNetworkAdapter(ctx);
		this.repo = new Repo({
			// Stable across hibernation, so peers see the same server.
			peerId: "room-server-" + ctx.id.toString().slice(0, 8),
			network: [this.network],
			storage: new DurableObjectStorageAdapter(ctx.storage),
			saveDebounceRate: Number(env.SAVE_DEBOUNCE_MS ?? SAVE_DEBOUNCE_MS),
			// Hold every document a peer brings: whoever has the id may sync it.
			sharePolicy: async () => true,
		});
	}

	async fetch() {
		let [client, server] = Object.values(new WebSocketPair());
		// Hibernation API: idle rooms are evicted without closing sockets.
		this.ctx.acceptWebSocket(server);
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(socket, message) {
		if (typeof message == "string") this.presence(socket, message);
		else this.network.receive(socket, message);
	}

	async webSocketClose(socket) {
		this.left(socket);
	}

	async webSocketError(socket) {
		this.left(socket);
	}

	presence(socket, text) {
		let peer = socket.deserializeAttachment();
		if (!peer?.peerId) return;
		let message;
		try {
			message = JSON.parse(text);
		} catch {
			return;
		}
		if (message?.type != "presence") return;

		this.broadcast(socket, {
			type: "presence",
			peerId: peer.peerId,
			presence: message.presence,
		});
	}

	left(socket) {
		this.network.closed(socket);
		let peer = socket.deserializeAttachment();
		if (peer?.peerId) this.broadcast(socket, { type: "presence-left", peerId: peer.peerId });
	}

	// Send to every joined socket except the sender.
	broadcast(sender, message) {
		let text = JSON.stringify(message);
		for (let socket of this.ctx.getWebSockets()) {
			if (socket == sender || !socket.deserializeAttachment()?.peerId) continue;
			try {
				socket.send(text);
			} catch {
				// Closing; its own webSocketClose handles it.
			}
		}
	}
}
