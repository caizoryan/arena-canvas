// State adapters registered by core and plugins. Exactly one is active at a
// time; core loads and saves through it.
const OPERATIONS = [
	"get_channel", "get_channel_contents", "get_block", "add_block",
	"update_block", "connect_block", "disconnect_block", "upload_file", "me",
	"saveCanvas", "subscribe",
];
const SAVE_MODES = ["explicit", "live"];

export const createStateAdapterRegistry = () => {
	let adapters = new Map();
	let activeAdapter;

	return {
		register: (adapter) => {
			if (!adapter || typeof adapter.id != "string" || !adapter.id) {
				throw new TypeError("A state adapter must have an id");
			}
			if (adapters.has(adapter.id)) {
				throw new Error(`A state adapter "${adapter.id}" is already registered`);
			}
			let missing = OPERATIONS.filter((name) => typeof adapter[name] != "function");
			if (missing.length) {
				throw new TypeError(
					`State adapter "${adapter.id}" is missing: ${missing.join(", ")}`,
				);
			}
			if (!SAVE_MODES.includes(adapter.saveMode)) {
				throw new TypeError(
					`State adapter "${adapter.id}" saveMode must be "explicit" or "live"`,
				);
			}

			adapters.set(adapter.id, adapter);
			return () => {
				if (adapters.get(adapter.id) != adapter) return;
				adapters.delete(adapter.id);
				if (activeAdapter == adapter) activeAdapter = undefined;
			};
		},

		activate: (id) => {
			let adapter = adapters.get(id);
			if (!adapter) throw new Error(`No state adapter "${id}" is registered`);
			activeAdapter = adapter;
			return adapter;
		},

		active: () => activeAdapter,
	};
};
