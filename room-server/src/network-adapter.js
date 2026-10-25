import { NetworkAdapter, cbor } from "@automerge/automerge-repo";

// automerge-repo networking over the Durable Object's hibernatable
// WebSockets. Speaks the same wire protocol as
// @automerge/automerge-repo-network-websocket: a client sends a CBOR `join`,
// the server answers `peer`, then both exchange CBOR repo messages.
//
// Each socket's attachment records { peerId, peerMetadata } from its join.
// Attachments survive hibernation, so a rebuilt adapter re-adopts sockets
// from them and clients never notice the room was evicted.
export class DurableObjectNetworkAdapter extends NetworkAdapter {
	constructor(ctx) {
		super();
		this.ctx = ctx;
		this.sockets = new Map(); // peerId -> socket
	}

	isReady() {
		return true;
	}

	whenReady() {
		return Promise.resolve();
	}

	connect(peerId, peerMetadata) {
		this.peerId = peerId;
		this.peerMetadata = peerMetadata;
		for (let socket of this.ctx.getWebSockets()) this.adopt(socket);
		this.emit("ready", { network: this });
	}

	disconnect() {}

	// Track a socket that joined before this adapter existed.
	adopt(socket) {
		let peer = socket.deserializeAttachment();
		if (!peer?.peerId || this.sockets.get(peer.peerId) == socket) return peer;
		this.sockets.set(peer.peerId, socket);
		this.emit("peer-candidate", { peerId: peer.peerId, peerMetadata: peer.peerMetadata });
		return peer;
	}

	send(message) {
		let socket = this.sockets.get(message.targetId);
		if (!socket) return;
		let bytes = cbor.encode(message);
		try {
			socket.send(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
		} catch {
			// The socket closed under us; webSocketClose will clean up.
		}
	}

	receive(socket, raw) {
		let message;
		try {
			message = cbor.decode(new Uint8Array(raw));
		} catch {
			return;
		}

		if (message.type == "join") {
			let { senderId, peerMetadata } = message;
			let previous = this.sockets.get(senderId);
			if (previous && previous != socket) {
				this.emit("peer-disconnected", { peerId: senderId });
			}
			socket.serializeAttachment({ peerId: senderId, peerMetadata });
			this.sockets.set(senderId, socket);
			this.emit("peer-candidate", { peerId: senderId, peerMetadata });
			this.send({
				type: "peer",
				senderId: this.peerId,
				peerMetadata: this.peerMetadata,
				selectedProtocolVersion: "1",
				targetId: senderId,
			});
			return;
		}

		// A socket may only speak as the peer that joined on it. Clients relay
		// messages carrying other peers' senderIds; trusting those would
		// re-route that peer's traffic to the wrong socket.
		let peer = this.adopt(socket);
		if (!peer || peer.peerId != message.senderId) return;
		this.emit("message", message);
	}

	closed(socket) {
		for (let [peerId, known] of this.sockets) {
			if (known != socket) continue;
			this.sockets.delete(peerId);
			this.emit("peer-disconnected", { peerId });
		}
	}
}
