// Run: node --test tests/state-adapters.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { createStateAdapterRegistry } from "../adapters/registry.js";

const adapter = (id, saveMode = "explicit") => ({
	id, saveMode,
	get_channel: async () => {}, get_channel_contents: async () => {}, get_block: async () => {},
	add_block: async () => {}, update_block: async () => {}, connect_block: async () => {}, disconnect_block: async () => {},
	upload_file: async () => {}, me: async () => {},
	saveCanvas: async () => ({ ok: true }), subscribe: () => () => {},
});

test("a registered adapter can be activated and is then the active one", () => {
	const registry = createStateAdapterRegistry();
	const arena = adapter("arena");
	registry.register(arena);

	assert.equal(registry.active(), undefined);
	assert.equal(registry.activate("arena"), arena);
	assert.equal(registry.active(), arena);
});

test("only one adapter is active at a time", () => {
	const registry = createStateAdapterRegistry();
	const arena = adapter("arena");
	const room = adapter("room", "live");
	registry.register(arena);
	registry.register(room);

	registry.activate("arena");
	registry.activate("room");

	assert.equal(registry.active(), room);
});

test("activating an unknown adapter throws and keeps the current one", () => {
	const registry = createStateAdapterRegistry();
	const arena = adapter("arena");
	registry.register(arena);
	registry.activate("arena");

	assert.throws(() => registry.activate("missing"), /missing/);
	assert.equal(registry.active(), arena);
});

test("unregistering removes the adapter, and deactivates it if it was active", () => {
	const registry = createStateAdapterRegistry();
	const unregister = registry.register(adapter("room", "live"));
	registry.activate("room");

	unregister();

	assert.equal(registry.active(), undefined);
	assert.throws(() => registry.activate("room"));
});

test("an adapter missing an operation, or with an unknown saveMode, is rejected", () => {
	const registry = createStateAdapterRegistry();
	const { subscribe, ...noSubscribe } = adapter("a");
	assert.throws(() => registry.register(noSubscribe), /subscribe/);
	assert.throws(() => registry.register(adapter("b", "sometimes")), /saveMode/);
	assert.throws(() => registry.register({ ...adapter(""), id: "" }), /id/);
});

test("two adapters cannot share an id", () => {
	const registry = createStateAdapterRegistry();
	registry.register(adapter("arena"));
	assert.throws(() => registry.register(adapter("arena")), /arena/);
});

test("adapters can be found by id and by their URL prefix", () => {
	const registry = createStateAdapterRegistry();
	const arena = adapter("arena");
	const room = { ...adapter("room", "live"), prefix: "room" };
	registry.register(arena);
	registry.register(room);

	assert.equal(registry.get("arena"), arena);
	assert.equal(registry.byPrefix("room"), room);
	assert.equal(registry.byPrefix("arena"), undefined);
	assert.equal(registry.get("missing"), undefined);
});

test("switching adapters tears down the one being left", async () => {
	const registry = createStateAdapterRegistry();
	const torndown = [];
	registry.register({ ...adapter("arena"), teardown: () => torndown.push("arena") });
	registry.register({ ...adapter("room", "live"), teardown: () => torndown.push("room") });

	registry.activate("arena");
	registry.activate("arena");
	registry.activate("room");
	registry.activate("arena");

	assert.deepEqual(torndown, ["arena", "room"]);
});
