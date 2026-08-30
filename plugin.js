// Plugin registry and the small controller surface currently exposed to
// plugins. Built-in plugins are loaded by the application entry point.
export const registeredRenderers = [];
export const registeredPlugins = [];

let activeRegistration;

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
