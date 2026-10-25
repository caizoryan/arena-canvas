// Smoke-test a deployed Room server with two real clients.
// Run: node scripts/smoke.js wss://arena-canvas-rooms-dev.<account>.workers.dev
import { Repo } from "@automerge/automerge-repo";
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";

const base = process.argv[2]?.replace(/\/$/, "");
if (!base) {
	console.error("Usage: node scripts/smoke.js <wss://worker-host>");
	process.exit(1);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function eventually(label, check, timeout = 10000) {
	const start = Date.now();
	for (;;) {
		try {
			if (await check()) return console.log(`ok   ${label} (${Date.now() - start} ms)`);
		} catch {
			// not yet
		}
		if (Date.now() - start > timeout) throw new Error(`FAIL ${label}`);
		await wait(50);
	}
}

// A raw socket for presence, which the repo client doesn't speak.
async function presenceSocket(url, peerId) {
	const { cbor } = await import("@automerge/automerge-repo");
	const socket = new WebSocket(url);
	socket.binaryType = "arraybuffer";
	const presence = [];
	socket.addEventListener("message", ({ data }) => {
		if (typeof data == "string") presence.push(JSON.parse(data));
	});
	await new Promise((resolve, reject) => {
		socket.addEventListener("open", resolve);
		socket.addEventListener("error", reject);
	});
	socket.send(cbor.encode({ type: "join", senderId: peerId, peerMetadata: { isEphemeral: true }, supportedProtocolVersions: ["1"] }));
	await wait(500);
	return { socket, presence };
}

const repos = [];
const sockets = [];
try {
	// The room id is the document id, so create the document before connecting.
	const alice = new Repo();
	repos.push(alice);
	const handle = alice.create({ title: "smoke", count: 0 });
	const url = `${base}/room/${handle.documentId}`;
	console.log("room", url);
	alice.networkSubsystem.addNetworkAdapter(new WebSocketClientAdapter(url));

	const bob = new Repo({ network: [new WebSocketClientAdapter(url)] });
	repos.push(bob);
	const bobHandle = await bob.find(handle.url);
	await eventually("bob receives alice's document", () => bobHandle.doc().title == "smoke");

	handle.change((doc) => { doc.count = 1; });
	await eventually("alice → bob edit", () => bobHandle.doc().count == 1);
	bobHandle.change((doc) => { doc.title = "smoke, both"; });
	await eventually("bob → alice edit", () => handle.doc().title == "smoke, both");

	handle.change((doc) => { doc.left = "alice"; });
	bobHandle.change((doc) => { doc.right = "bob"; });
	await eventually("concurrent edits merge on both sides", () =>
		handle.doc().right == "bob" && bobHandle.doc().left == "alice");

	const p1 = await presenceSocket(url, "presence-1");
	const p2 = await presenceSocket(url, "presence-2");
	sockets.push(p1.socket, p2.socket);
	p1.socket.send(JSON.stringify({ type: "presence", presence: { cursor: { x: 1, y: 2 } } }));
	await eventually("presence reaches the other socket", () =>
		p2.presence.some((m) => m.type == "presence" && m.peerId == "presence-1"));
	await wait(300);
	if (p1.presence.some((m) => m.peerId == "presence-1")) throw new Error("FAIL presence echoed to sender");
	console.log("ok   presence not echoed to sender");
	p1.socket.close();
	await eventually("leaving is announced", () =>
		p2.presence.some((m) => m.type == "presence-left" && m.peerId == "presence-1"));

	// Let the ~2 s batched save land, disconnect everyone, then load cold.
	await wait(3000);
	await Promise.all(repos.splice(0).map((repo) => repo.shutdown()));
	p2.socket.close();
	await wait(1000);
	const carol = new Repo({ network: [new WebSocketClientAdapter(url)] });
	repos.push(carol);
	const carolHandle = await carol.find(handle.url);
	await eventually("a later client loads the stored document", () =>
		carolHandle.doc().title == "smoke, both" && carolHandle.doc().right == "bob");
	console.log("all checks passed");
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
} finally {
	sockets.forEach((socket) => socket.close());
	await Promise.all(repos.map((repo) => repo.shutdown()));
	setTimeout(() => process.exit(), 100);
}
