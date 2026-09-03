import { focusBlock } from "./script.js";
import { get_block } from "./arena.js";
import { dom } from "./dom.js";
import { memo, reactive } from "./chowk.js";

// Plugin registry and the small controller surface currently exposed to
// plugins. Built-in plugins are loaded by the application entry point.
export const registeredRenderers = [];
export const registeredPlugins = [];
export const registeredHooks = new Map();
export const availablePlugins = [];

const ENABLED_PLUGIN_IDS_KEY = "arena-canvas-enabled-plugin-ids";

const readEnabledPluginIds = () => {
	if (typeof localStorage == "undefined") return null;

	try {
		let value = localStorage.getItem(ENABLED_PLUGIN_IDS_KEY);
		if (value == null) return null;

		let ids = JSON.parse(value);
		if (!Array.isArray(ids)) return null;
		return new Set(ids.filter((id) => typeof id == "string"));
	} catch (error) {
		console.warn("Could not read enabled plugins", error);
		return null;
	}
};

let enabledPluginIds = readEnabledPluginIds();
let pluginPane;

const isPluginEnabled = (plugin) =>
	enabledPluginIds == null || enabledPluginIds.has(plugin.id);

const saveEnabledPluginIds = () => {
	if (typeof localStorage == "undefined") return;

	try {
		localStorage.setItem(
			ENABLED_PLUGIN_IDS_KEY,
			JSON.stringify([...enabledPluginIds]),
		);
	} catch (error) {
		console.warn("Could not save enabled plugins", error);
	}
};

const setPluginEnabled = (plugin, enabled) => {
	if (enabledPluginIds == null) {
		enabledPluginIds = new Set(availablePlugins.map(({ id }) => id));
	}

	if (enabled) enabledPluginIds.add(plugin.id);
	else enabledPluginIds.delete(plugin.id);
	saveEnabledPluginIds();
};

let activeRegistration;
let hookSequence = 0;
let channelBlocks = [];
let keymanager;
let canvasStateAdapter = {};
let registeredUI = new Map();

const remove = (items, item) => {
	let index = items.indexOf(item);
	if (index !== -1) items.splice(index, 1);
};

const runCleanup = (cleanup) => {
	if (typeof cleanup !== "function") return;
	try {
		cleanup();
	} catch (error) {
		console.error("Plugin cleanup failed", error);
	}
};

const removeHook = (hookName, hook) => {
	let hooks = registeredHooks.get(hookName);
	if (!hooks) return;

	remove(hooks, hook);
	if (hooks.length == 0) registeredHooks.delete(hookName);
};

export const controller = {
	registerRenderer: (renderer) => {
		if (!renderer || typeof renderer.match !== "function" ||
			typeof renderer.render !== "function") {
			throw new TypeError(
				"A renderer must have match(block) and render(block) functions",
			);
		}

		registeredRenderers.push(renderer);

		const unregister = () => remove(registeredRenderers, renderer);
		if (activeRegistration) activeRegistration.cleanups.push(unregister);
		return unregister;
	},

	setChannelBlocks: (blocks) => {
		channelBlocks = Array.isArray(blocks) ? blocks : [];
	},

	getChannelBlocks: () => [...channelBlocks],

	setKeymanager: (manager) => {
		keymanager = manager;
	},

	// Register keyboard shortcuts using the same signature as Keymanager.on.
	on: (...args) => {
		if (!keymanager) throw new Error("A keymanager has not been attached");
		let unregister = keymanager.on(...args);
		if (activeRegistration && unregister) {
			activeRegistration.cleanups.push(unregister);
		}
		return unregister;
	},

	setCanvasStateAdapter: (adapter = {}) => {
		canvasStateAdapter = adapter;
	},

	getCanvasTransform: () => canvasStateAdapter.getTransform?.(),
	setCanvasTransform: (transform) => canvasStateAdapter.setTransform?.(transform),
	markDirty: () => canvasStateAdapter.markDirty?.(),

	registerUI: (region, component) => {
		if (typeof region != "string" || !region) {
			throw new TypeError("A UI region must have a name");
		}

		let components = registeredUI.get(region);
		if (!components) {
			components = [];
			registeredUI.set(region, components);
		}
		components.push(component);

		let unregistered = false;
		let unregister = () => {
			if (unregistered) return;
			unregistered = true;
			remove(components, component);
			if (components.length == 0) registeredUI.delete(region);
		};
		if (activeRegistration) activeRegistration.cleanups.push(unregister);
		return unregister;
	},

	getUI: (region) => [...(registeredUI.get(region) || [])],

	mountToCanvas: (element) => {
		let canvas = document.querySelector(".container");
		if (!canvas || !element) return;

		canvas.appendChild(element);
		return element;
	},

	getBlock: async (id) => {
		let block = channelBlocks.find((item) => String(item.id) == String(id));
		if (block) return block;
		return get_block(id);
	},

	registerHook: (hookName, callback, options = {}) => {
		if (typeof hookName != "string" || !hookName) {
			throw new TypeError("A hook must have a name");
		}
		if (typeof callback != "function") {
			throw new TypeError("A hook callback must be a function");
		}

		let hook = {
			callback,
			priority: Number(options.priority) || 0,
			sequence: hookSequence++,
		};
		let hooks = registeredHooks.get(hookName);
		if (!hooks) {
			hooks = [];
			registeredHooks.set(hookName, hooks);
		}
		hooks.push(hook);
		hooks.sort((a, b) =>
			b.priority - a.priority || a.sequence - b.sequence
		);

		let unregister = () => removeHook(hookName, hook);
		if (activeRegistration) activeRegistration.cleanups.push(unregister);
		return unregister;
	},

	dispatchHook: (hookName, context = {}) => {
		let hooks = registeredHooks.get(hookName) || [];
		let result = { attributes: {} };

		for (let hook of [...hooks]) {
			try {
				let response = hook.callback(context, controller);
				if (!response) continue;

				if (response.attributes) {
					result.attributes = {
						...result.attributes,
						...response.attributes,
					};
				}

				if (response.handled) {
					return {
						...result,
						...response,
						attributes: {
							...result.attributes,
							...(response.attributes || {}),
						},
					};
				}
			} catch (error) {
				console.error(`Plugin hook failed: ${hookName}`, error);
			}
		}

		return Object.keys(result.attributes).length ? result : undefined;
	},

	// Data hooks are reducers: each plugin receives the data returned by the
	// previous plugin. This is used for serialization without exposing store
	// internals to plugins.
	dispatchDataHook: (hookName, data, context = {}) => {
		let nextData = data;
		let hooks = registeredHooks.get(hookName) || [];

		for (let hook of [...hooks]) {
			try {
				let response = hook.callback({ ...context, data: nextData }, controller);
				if (response && Object.prototype.hasOwnProperty.call(response, "data")) {
					nextData = response.data;
				}
			} catch (error) {
				console.error(`Plugin data hook failed: ${hookName}`, error);
			}
		}

		return nextData;
	},

	focusBlock: (...args) => focusBlock(...args),
};

// Register a plugin for the lifetime of the returned function. Renderer
// registrations made from setup are also removed when the plugin is removed,
// even if setup does not explicitly return a cleanup function.
export function register(plugin) {
	if (!plugin || typeof plugin !== "object") {
		throw new TypeError("A plugin must be an object");
	}
	if (typeof plugin.id != "string" || !plugin.id) {
		throw new TypeError("A plugin must have an id");
	}
	if (plugin.setup !== undefined && typeof plugin.setup !== "function") {
		throw new TypeError("A plugin setup must be a function");
	}

	if (!availablePlugins.includes(plugin)) availablePlugins.push(plugin);
	if (!isPluginEnabled(plugin)) return () => {};

	const registration = { plugin, cleanups: [] };
	registeredPlugins.push(plugin);

	let cleanup;
	const previousRegistration = activeRegistration;
	activeRegistration = registration;
	try {
		cleanup = plugin.setup ? plugin.setup(controller) : undefined;
	} catch (error) {
		activeRegistration = previousRegistration;
		runCleanup(cleanup);
		registration.cleanups.forEach(runCleanup);
		remove(registeredPlugins, plugin);
		throw error;
	}
	activeRegistration = previousRegistration;

	let unregistered = false;
	return () => {
		if (unregistered) return;
		unregistered = true;
		runCleanup(cleanup);
		registration.cleanups.forEach(runCleanup);
		remove(registeredPlugins, plugin);
	};
}

const pluginCard = (plugin) => {
	let enabled = reactive(isPluginEnabled(plugin));
	let toggle = () => {
		let next = !enabled.value();
		setPluginEnabled(plugin, next);
		enabled.next(next);
	};

	return dom([
		".experimental-plugin-card",
		[".experimental-plugin-card-details",
			["h4", plugin.name || plugin.id],
			["p", plugin.description || "No description provided."],
		],
		["button.experimental-plugin-toggle", {
			type: "button",
			role: "switch",
			"aria-checked": enabled,
			onclick: toggle,
		}, memo(() => enabled.value() ? "enabled" : "disabled", [enabled])],
	]);
};

export const experimentalPlugins = () => {
	if (pluginPane?.isConnected) return pluginPane;

	let changes = reactive(false);
	let close = () => {
		pluginPane?.remove();
		pluginPane = undefined;
	};
	let reload = () => window.location.reload();
	let overlay;

	overlay = dom([
		".modal-overlay",
		{
			onclick: (event) => {
				if (event.target == overlay) close();
			},
		},
		[".popup.experimental-plugins", {
			onclick: (event) => event.stopPropagation(),
		},
			["button.experimental-plugins-close", {
				type: "button",
				onclick: close,
			}, "close"],
			["h2", "Experimental plugins"],
			["p", "Enable or disable plugins. Changes take effect after refreshing."],
			[".experimental-plugin-list", ...availablePlugins.map(pluginCard)],
			[".experimental-plugins-actions",
				["button", { type: "button", onclick: reload }, "refresh to apply"],
				memo(() => changes.value() ? "Changes saved." : "", [changes]),
			],
		],
	]);

	// Mark the pane as changed after its controls have been created. Each card
	// persists immediately; this reactive value only updates the helper text.
	overlay.querySelectorAll(".experimental-plugin-toggle").forEach((button) => {
		let onclick = button.onclick;
		button.onclick = (event) => {
			onclick(event);
			changes.next(true);
		};
	});

	pluginPane = overlay;
	document.body.appendChild(pluginPane);
	return pluginPane;
};
