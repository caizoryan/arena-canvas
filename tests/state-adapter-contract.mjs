// Shared behaviour every state adapter must have. Not run directly: an
// adapter's test file calls stateAdapterContract with a harness factory.
//
// makeHarness() resolves to:
//   adapter            the adapter under test
//   seed(slug, blocks) puts a channel with these blocks in the backend
//   useCanvas(slug)    makes slug the canvas saveCanvas writes to
//   remoteChange?()    makes a collaborator change something (live adapters only)
import assert from "node:assert/strict";
import test from "node:test";

export function stateAdapterContract(name, makeHarness) {
	const it = (title, fn) => test(`${name} adapter: ${title}`, async () => fn(await makeHarness()));

	it("loads a channel, its contents and a single block", async ({ adapter, seed }) => {
		seed("garden", [{ title: "Tulip", content: "red" }, { title: "Fern", content: "green" }]);

		const channel = await adapter.get_channel("garden");
		assert.equal(channel.slug, "garden");

		const contents = await adapter.get_channel_contents("garden");
		assert.deepEqual(contents.data.map(b => b.title).sort(), ["Fern", "Tulip"]);

		const tulip = contents.data.find(b => b.title == "Tulip");
		const block = await adapter.get_block(tulip.id);
		assert.equal(block.title, "Tulip");
		assert.equal(block.content.plain, "red");
	});

	it("adds a block to a channel", async ({ adapter, seed }) => {
		seed("garden", []);

		const block = await adapter.add_block("garden", "Moss", "soft");
		assert.ok(block.id);

		const contents = await adapter.get_channel_contents("garden");
		assert.deepEqual(contents.data.map(b => b.title), ["Moss"]);
		assert.equal(contents.data[0].content.plain, "soft");
	});

	it("updates a block", async ({ adapter, seed }) => {
		seed("garden", [{ title: "Tulip", content: "red" }]);
		const [tulip] = (await adapter.get_channel_contents("garden")).data;

		const res = await adapter.update_block(tulip.id, { title: "Tulip", content: "yellow" });
		assert.ok(res.ok);
		assert.equal((await adapter.get_block(tulip.id)).content.plain, "yellow");
	});

	it("connects a block into another channel", async ({ adapter, seed }) => {
		seed("garden", [{ title: "Tulip", content: "red" }]);
		seed("vase", []);
		const [tulip] = (await adapter.get_channel_contents("garden")).data;

		await adapter.connect_block("vase", tulip.id);

		const vase = await adapter.get_channel_contents("vase");
		assert.deepEqual(vase.data.map(b => b.id), [tulip.id]);
	});

	it("disconnects a block from a channel without deleting it", async ({ adapter, seed }) => {
		seed("garden", [{ title: "Tulip", content: "red" }, { title: "Fern", content: "green" }]);
		const tulip = (await adapter.get_channel_contents("garden")).data.find(b => b.title == "Tulip");

		const res = await adapter.disconnect_block("garden", tulip.id);
		assert.ok(res.ok);

		const contents = await adapter.get_channel_contents("garden");
		assert.deepEqual(contents.data.map(b => b.title), ["Fern"]);
		assert.equal((await adapter.get_block(tulip.id)).title, "Tulip");
	});

	it("declares how it saves", async ({ adapter }) => {
		assert.ok(["explicit", "live"].includes(adapter.saveMode));
	});

	it("saveCanvas stores the canvas so the next load sees it", async ({ adapter, seed, useCanvas }) => {
		seed("garden", [{ title: "Tulip", content: "red" }]);
		await useCanvas("garden");

		const first = { nodes: [{ id: 1, x: 0, y: 0 }], edges: [] };
		assert.ok((await adapter.saveCanvas(first)).ok);
		const second = { nodes: [{ id: 1, x: 50, y: 60 }], edges: [] };
		assert.ok((await adapter.saveCanvas(second)).ok);

		await useCanvas("garden");
		const canvases = (await adapter.get_channel_contents("garden")).data
			.filter(b => b.title == ".canvas");
		assert.equal(canvases.length, 1);
		assert.deepEqual(JSON.parse(canvases[0].content.plain), second);
	});

	it("subscribe returns an unsubscribe function", async ({ adapter }) => {
		const unsubscribe = adapter.subscribe(() => {});
		assert.equal(typeof unsubscribe, "function");
		unsubscribe();
	});

	it("subscribe delivers remote changes until unsubscribed", async (harness) => {
		if (!harness.remoteChange) return; // explicit-save backends have no collaborators
		const { adapter, remoteChange } = harness;
		const seen = [];
		const unsubscribe = adapter.subscribe(change => seen.push(change));

		await remoteChange();
		assert.equal(seen.length, 1);

		unsubscribe();
		await remoteChange();
		assert.equal(seen.length, 1);
	});
}
