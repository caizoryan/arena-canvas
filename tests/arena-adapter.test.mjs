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
	const failures = new Map(); // "METHOD path" -> status

	const json = (body, status = 200) => new Response(JSON.stringify(body), {
		status, headers: { "Content-Type": "application/json" },
	});
	const makeBlock = (title, value) => ({
		id: nextId++, title, type: "Text", description: "",
		content: { plain: value, markdown: value },
		updated_at: new Date(0).toISOString(),
	});

	const seed = (slug, items) => {
		channels.set(slug, { slug, title: slug, ids: [] });
		items.forEach(({ title, content }) => {
			const block = makeBlock(title, content);
			blocks.set(block.id, block);
			channels.get(slug).ids.push(block.id);
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
			return json({ data: channel.ids.map(id => blocks.get(id)).reverse(), meta: { has_more_pages: false } });
		}
		if ((match = path.match(/^channels\/([^/]+)$/))) {
			const channel = channels.get(decodeURIComponent(match[1]));
			return channel ? json({ id: 1, slug: channel.slug, title: channel.title }) : json({}, 404);
		}
		if (path == "blocks" && method == "POST") {
			const block = makeBlock(body.title, body.value);
			blocks.set(block.id, block);
			body.channel_ids.forEach(slug => channels.get(slug).ids.push(block.id));
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
			body.channels.forEach(({ id }) => channels.get(id).ids.push(body.connectable_id));
			return json({ ok: true });
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
	const adapter = createArenaAdapter(api, { getSlug: () => slug });
	return {
		adapter, server, notices,
		seed: server.seed,
		// Opening a canvas loads its channel, as the app does.
		useCanvas: async (next) => {
			slug = next;
			await adapter.get_channel_contents(next);
		},
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
	assert.deepEqual(Object.keys(block).sort(), ["content", "description", "id", "title", "type", "updated_at"]);
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
