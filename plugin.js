import { focusBlock } from "./script.js";

// Plugin registry and the small controller surface currently exposed to
// plugins. Built-in plugins are loaded by the application entry point.
export const registeredRenderers = [];
export const registeredPlugins = [];
export const registeredHooks = new Map();

let activeRegistration;
let hookSequence = 0;
let channelBlocks = [];

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

	getBlock: async (id) => {
		let block = channelBlocks.find((item) => String(item.id) == String(id));
		if (block) return block;

		let { get_block } = await import("./arena.js");
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

	focusBlock: (...args) => focusBlock(...args),
};

// Register a plugin for the lifetime of the returned function. Renderer
// registrations made from setup are also removed when the plugin is removed,
// even if setup does not explicitly return a cleanup function.
export function register(plugin) {
	if (!plugin || typeof plugin !== "object") {
		throw new TypeError("A plugin must be an object");
	}
	if (plugin.setup !== undefined && typeof plugin.setup !== "function") {
		throw new TypeError("A plugin setup must be a function");
	}

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
