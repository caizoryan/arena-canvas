// Run: node --test tests/arena-adapter.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { createArenaAdapter } from "../adapters/arena-adapter.js";
import { createStateAdapterRegistry } from "../adapters/registry.js";
import { stateAdapterContract } from "./state-adapter-contract.mjs";

const arenaSource = await readFile(new URL("../arena.js", import.meta.url), "utf8");
const arenaExports = [...arenaSource.matchAll(/^export (?:const|let) (\w+)/gm)].map(m => m[1]);

// An in-memory stand-in for the parts of the Are.na v3 API that arena.js uses.
function fakeArena() {
	const channels = new Map();
	const blocks = new Map();
	const requests = [];
	let nextId = 100;
	let nextConnection = 9000;
	const failures = new Map(); // "METHOD path" -> status

	const json = (body, status = 200) => new Response(JSON.stringify(body), {
		status, headers: { "Content-Type": "application/json" },
	});
	const makeBlock = (title, value) => ({
		id: nextId++, title, type: "Text", description: "",
		content: { plain: value, markdown: value },
		updated_at: new Date(0).toISOString(),
	});

	// Each block in a channel is there through a connection with its own id.
	const connect = (slug, id) => {
		const channel = channels.get(slug);
		channel.ids.push(id);
		channel.connections.set(id, nextConnection++);
	};

	const seed = (slug, items) => {
		channels.set(slug, { slug, title: slug, ids: [], connections: new Map() });
		items.forEach(({ title, content }) => {
			const block = makeBlock(title, content);
			blocks.set(block.id, block);
			connect(slug, block.id);
		});
	};

	const fetch = async (url, options = {}) => {
		const method = options.method || "GET";
		const { pathname } = new URL(url);
		const path = pathname.replace(/^\/v3\//, "");
		const body = options.body && typeof options.body == "string" ? JSON.parse(options.body) : options.body;
		requests.push({ method, path, body });
		if (failures.has(`${method} ${path}`)) return json({ error: "nope" }, failures.get(`${method} ${path}`));

		let match;
		if ((match = path.match(/^channels\/([^/]+)\/contents$/))) {
			const channel = channels.get(decodeURIComponent(match[1]));
			if (!channel) return json({ error: "not found" }, 404);
			const data = channel.ids.map(id => ({ ...blocks.get(id), connection: { id: channel.connections.get(id) } }));
			return json({ data: data.reverse(), meta: { has_more_pages: false } });
		}
		if ((match = path.match(/^channels\/([^/]+)$/))) {
			const channel = channels.get(decodeURIComponent(match[1]));
			return channel ? json({ id: 1, slug: channel.slug, title: channel.title }) : json({}, 404);
		}
		if (path == "blocks" && method == "POST") {
			const block = makeBlock(body.title, body.value);
			blocks.set(block.id, block);
			body.channel_ids.forEach(slug => connect(slug, block.id));
			return json(block);
		}
		if ((match = path.match(/^blocks\/(\d+)$/))) {
			const block = blocks.get(Number(match[1]));
			if (!block) return json({ error: "not found" }, 404);
			if (method == "PUT") {
				if (body.title !== undefined) block.title = body.title;
				if (body.description !== undefined) block.description = body.description;
				if (body.content !== undefined) block.content = { plain: body.content, markdown: body.content };
				block.updated_at = new Date().toISOString();
			}
			return json(block);
		}
		if (path == "connections") {
			body.channels.forEach(({ id }) => connect(id, body.connectable_id));
			return json({ ok: true });
		}
		if ((match = path.match(/^connections\/(\d+)$/)) && method == "DELETE") {
			const id = Number(match[1]);
			const channel = [...channels.values()].find(c => [...c.connections.values()].includes(id));
			if (!channel) return json({ error: "not found" }, 404);
			const [blockId] = [...channel.connections].find(([, conn]) => conn == id);
			channel.ids = channel.ids.filter(other => other != blockId);
			channel.connections.delete(blockId);
			return new Response(null, { status: 204 });
		}
		if (path == "uploads/presign") {
			return json({ files: [{
				upload_url: `https://uploads.test/${body.files[0].filename}?signature=x`,
				content_type: body.files[0].content_type,
			}] });
		}
		if (path.startsWith("uploads.test") || url.startsWith("https://uploads.test/")) return new Response("", { status: 200 });
		if (path == "me") return json({ slug: "gardener", name: "Gardener" });
		return json({ error: `unhandled ${method} ${path}` }, 500);
	};

	return {
		fetch, seed, requests, blocks, channels,
		fail: (route, status) => failures.set(route, status),
		deleteBlock: id => {
			blocks.delete(id);
			channels.forEach(channel => { channel.ids = channel.ids.filter(other => other != id); });
		},
	};
}

// Run the unchanged arena.js against the fake server, with its app imports stubbed.
function loadArena(server) {
	const notices = [];
	const context = vm.createContext({
		fetch: server.fetch, Response, URL, JSON, Number, Error,
		console: { log() {} },
		state: { authKey: "token", me: {}, authSlug: { next() {} } },
		notificationpopup: (...args) => notices.push(args),
	});
	const script = arenaSource
		.replace(/^import[\s\S]*?;\n/gm, "")
		.replace(/^export (const|let) /gm, "$1 ")
		+ `\nglobalThis.api = { ${arenaExports.join(", ")} };`;
	vm.runInContext(script, context);
	return { api: context.api, notices };
}

async function harness() {
	const server = fakeArena();
	const { api, notices } = loadArena(server);
	let slug;
	let canvasName = "";
	const adapter = createArenaAdapter(api, { getSlug: () => slug, getCanvasName: () => canvasName });
	return {
		adapter, server, notices,
		seed: server.seed,
		// Opening a canvas loads its channel, as the app does. No name opens
		// the default canvas.
		useCanvas: async (next, name = "") => {
			slug = next;
			canvasName = name;
			await adapter.get_channel_contents(next);
		},
		canvasTitles: slug => server.channels.get(slug).ids
			.map(id => server.blocks.get(id).title).filter(title => title.startsWith(".canvas")).sort(),
	};
}

stateAdapterContract("Are.na", harness);

test("Are.na adapter exposes every operation of the Are.na module", async () => {
	const { adapter } = await harness();
	const operations = arenaExports;
	assert.ok(operations.length >= 8);
	operations.forEach(name => assert.equal(typeof adapter[name], "function", name));
	assert.equal(adapter.id, "arena");
	assert.equal(adapter.saveMode, "explicit");
	assert.equal(createStateAdapterRegistry().register(adapter).constructor, Function);
});

test("Are.na adapter passes blocks, me and uploads straight through", async () => {
	const { adapter, seed } = await harness();
	seed("garden", [{ title: "Tulip", content: "red" }]);
	const [block] = (await adapter.get_channel_contents("garden")).data;
	assert.deepEqual(Object.keys(block).sort(), ["connection", "content", "description", "id", "title", "type", "updated_at"]);
	assert.equal((await (await adapter.me()).json()).slug, "gardener");
	assert.equal(await adapter.upload_file({ name: "a.png", type: "image/png", arrayBuffer: async () => new ArrayBuffer(1) }),
		"https://uploads.test/a.png");
});

test("first save of a channel without a canvas creates the .canvas block", async () => {
	const { adapter, seed, server, useCanvas } = await harness();
	seed("garden", [{ title: "Tulip", content: "red" }]);
	await useCanvas("garden");

	const result = await adapter.saveCanvas({ nodes: [] });

	assert.ok(result.ok);
	assert.equal(result.created, true);
	assert.equal(result.block.title, ".canvas");
	const create = server.requests.find(r => r.method == "POST" && r.path == "blocks");
	assert.deepEqual(create.body.channel_ids, ["garden"]);
	assert.equal(create.body.title, ".canvas");
});

test("saving an existing canvas updates its block with the Are.na Canvas description", async () => {
	const { adapter, seed, server, useCanvas } = await harness();
	seed("garden", [{ title: ".canvas", content: "{}" }]);
	await useCanvas("garden");
	const [canvas] = [...server.blocks.values()];

	const result = await adapter.saveCanvas({ nodes: [] });
	assert.ok(result.ok);
	assert.equal(result.created, false);

	const update = server.requests.find(r => r.method == "PUT");
	assert.equal(update.path, `blocks/${canvas.id}`);
	assert.equal(update.body.title, ".canvas");
	assert.equal(update.body.content, JSON.stringify({ nodes: [] }));
	assert.match(update.body.description, /canvas\.a-p\.space\/#garden/);
	assert.equal(server.requests.filter(r => r.method == "POST").length, 0);
});

test("saving writes to the open canvas, not to a channel loaded only for a preview", async () => {
	const { adapter, seed, server, useCanvas } = await harness();
	seed("garden", [{ title: ".canvas", content: "{}" }]);
	seed("nested", [{ title: ".canvas", content: "{}" }]);
	await useCanvas("garden");
	const gardenCanvas = server.channels.get("garden").ids[0];
	await adapter.get_channel_contents("nested");

	await adapter.saveCanvas({ nodes: [] });

	assert.equal(server.requests.find(r => r.method == "PUT").path, `blocks/${gardenCanvas}`);
});

test("saving recreates the canvas block when it was deleted on Are.na", async () => {
	const { adapter, seed, server, useCanvas } = await harness();
	seed("garden", [{ title: ".canvas", content: "{}" }]);
	await useCanvas("garden");
	server.deleteBlock(server.channels.get("garden").ids[0]);

	const result = await adapter.saveCanvas({ nodes: [] });

	assert.ok(result.ok);
	assert.equal(server.channels.get("garden").ids.length, 1);
	assert.equal((await adapter.saveCanvas({ nodes: [1] })).block.id, result.block.id);
});

test("a rejected save reports the status instead of throwing", async () => {
	const { adapter, seed, server, useCanvas } = await harness();
	seed("garden", [{ title: ".canvas", content: "{}" }]);
	await useCanvas("garden");
	server.fail(`PUT blocks/${server.channels.get("garden").ids[0]}`, 401);

	assert.deepEqual(await adapter.saveCanvas({ nodes: [] }), { ok: false, status: 401 });
});

test("a named canvas saves to its own .canvas:<name> block, leaving the default alone", async () => {
	const { adapter, seed, useCanvas, canvasTitles, server } = await harness();
	seed("garden", [{ title: ".canvas", content: "{\"nodes\":[]}" }]);
	await useCanvas("garden", "spring plan");

	const first = await adapter.saveCanvas({ nodes: [1] });
	const second = await adapter.saveCanvas({ nodes: [2] });

	assert.equal(first.created, true);
	assert.equal(second.created, false);
	assert.equal(second.block.id, first.block.id);
	assert.deepEqual(canvasTitles("garden"), [".canvas", ".canvas:spring plan"]);
	const def = [...server.blocks.values()].find(b => b.title == ".canvas");
	assert.equal(def.content.plain, "{\"nodes\":[]}");
	assert.equal(server.blocks.get(first.block.id).content.plain, JSON.stringify({ nodes: [2] }));
});

test("opening a named canvas saves to that canvas, not the first .canvas block", async () => {
	const { adapter, seed, useCanvas, server } = await harness();
	seed("garden", [{ title: ".canvas", content: "{}" }, { title: ".canvas:b", content: "{}" }]);
	await useCanvas("garden", "b");
	const named = [...server.blocks.values()].find(b => b.title == ".canvas:b");

	await adapter.saveCanvas({ nodes: [] });

	assert.equal(server.requests.find(r => r.method == "PUT").path, `blocks/${named.id}`);
	assert.equal(server.requests.find(r => r.method == "PUT").body.title, ".canvas:b");
});

test("renaming a canvas block keeps saves going to it under its new name", async () => {
	const { adapter, seed, useCanvas, server, canvasTitles } = await harness();
	seed("garden", [{ title: ".canvas:old", content: "{}" }]);
	await useCanvas("garden", "old");
	const block = [...server.blocks.values()][0];

	assert.ok((await adapter.update_block(block.id, { title: ".canvas:new" })).ok);
	await useCanvas("garden", "new");
	// The contents endpoint can lag behind; the adapter must not rely on it here.
	server.blocks.get(block.id).title = ".canvas:old";
	const result = await adapter.saveCanvas({ nodes: [] });

	assert.equal(result.created, false);
	assert.equal(result.block.id, block.id);
	assert.deepEqual(canvasTitles("garden"), [".canvas:new"]);
});

test("disconnecting a canvas removes it from the channel through its connection", async () => {
	const { adapter, seed, useCanvas, server } = await harness();
	seed("garden", [{ title: ".canvas", content: "{}" }, { title: ".canvas:b", content: "{}" }]);
	await useCanvas("garden");
	const named = [...server.blocks.values()].find(b => b.title == ".canvas:b");
	const connection = server.channels.get("garden").connections.get(named.id);

	assert.ok((await adapter.disconnect_block("garden", named.id)).ok);

	assert.ok(server.requests.some(r => r.method == "DELETE" && r.path == `connections/${connection}`));
	await useCanvas("garden", "b");
	assert.equal((await adapter.saveCanvas({ nodes: [] })).created, true);
});
