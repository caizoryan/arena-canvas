// Worker entry: routes `/room/<roomId>` WebSocket upgrades to that room's
// Durable Object. The room id is the Automerge document id (ADR 0004), so
// each room gets its own instance via idFromName (ADR 0001).
export { Room } from "./room.js";

const ROOM_PATH = /^\/room\/([A-Za-z0-9]+)$/;

export default {
	async fetch(request, env) {
		let match = new URL(request.url).pathname.match(ROOM_PATH);
		if (!match) return new Response("Not found", { status: 404 });
		if (request.headers.get("Upgrade") != "websocket") {
			return new Response("Expected a WebSocket upgrade", { status: 426 });
		}
		let room = env.ROOM.get(env.ROOM.idFromName(match[1]));
		return room.fetch(request);
	},
};
