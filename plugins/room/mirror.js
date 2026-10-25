// Mirrors the app's store to and from a room (ADR 0005). The store stays what
// everything renders from:
// - local store changes to nodes and edges are saved to the room, batched to
//   at most one write per `delay` ms;
// - remote changes are applied to the store untracked (so undo only ever
//   reverses your own changes) and flagged so they aren't sent back.
//
// - plugin data (everything in the canvas data besides nodes, edges and the
//   viewport) is saved the same way when the app says it changed, and remote
//   updates to it are announced through pluginDataChanged(slug, changes).
//
// The app supplies how to show and hide a node: mount(node, block) and
// unmount(node), edgesChanged() to redraw edges, and optionally
// watchDirty(callback), which calls back when plugins mark the canvas changed.
const NODES = ["data", "nodes"];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const touchesCanvas = (location, value) =>
	location[0] == "data" && (
		location[1] == "nodes" || location[1] == "edges" ||
		(location.length == 1 && (value?.[0] == "nodes" || value?.[0] == "edges"))
	);

export const applyRemoteCanvas = (store, canvas, { block, mount, unmount, edgesChanged }) => {
	let remoteIds = new Set(canvas.nodes.map((node) => String(node.id)));
	store.get(NODES)
		.filter((node) => !remoteIds.has(String(node.id)))
		.forEach((node) => unmount(node));

	canvas.nodes.forEach((remote) => {
		let index = store.get(NODES).findIndex((node) => String(node.id) == String(remote.id));
		if (index == -1) {
			mount(remote, block?.(remote.id));
			return;
		}
		let local = store.get([...NODES, index]);
		Object.entries(remote).forEach(([key, value]) => {
			if (!same(local[key], value)) store.apply([...NODES, index], "set", [key, value], false);
		});
	});

	if (!same(store.get(["data", "edges"]), canvas.edges)) {
		store.apply(["data"], "set", ["edges", canvas.edges], false);
		edgesChanged();
	}
};

const NOT_PLUGIN_DATA = new Set(["nodes", "edges", "nodeHash", "transform"]);

export const pluginData = (canvas = {}) =>
	Object.fromEntries(Object.entries(canvas)
		.filter(([key, value]) => !NOT_PLUGIN_DATA.has(key) && value !== undefined));

// The plugin data keys whose value differs, with their new value (undefined
// when removed).
export const diffPluginData = (before, after) => {
	let changes = {};
	new Set([...Object.keys(before), ...Object.keys(after)]).forEach((key) => {
		if (!same(before[key], after[key])) changes[key] = after[key];
	});
	return changes;
};

export const startMirror = ({
	store, adapter, slug, getData, mount, unmount, edgesChanged, delay = 50,
	watchDirty, pluginDataChanged,
}) => {
	let applyingRemote = false;
	let timer;
	// Plugin data as last seen in the room or written to it.
	let knownPlugins = pluginData(getData());

	let flush = () => {
		clearTimeout(timer);
		timer = undefined;
		let data = getData();
		knownPlugins = pluginData(data);
		adapter.saveCanvas(data);
	};

	let schedule = () => {
		if (!applyingRemote && !timer) timer = setTimeout(flush, delay);
	};
	let stopWatchingDirty = watchDirty?.(schedule);

	let stopObserving = store.observe((location, action, value) => {
		if (!touchesCanvas(location, value)) return;
		schedule();
	});

	let stopListening = adapter.subscribe(({ slug: changed, canvas, block }) => {
		if (changed != slug) return;
		applyingRemote = true;
		try {
			applyRemoteCanvas(store, canvas, { block, mount, unmount, edgesChanged });
		} finally {
			applyingRemote = false;
		}
		let remotePlugins = pluginData(canvas);
		let changes = diffPluginData(knownPlugins, remotePlugins);
		knownPlugins = remotePlugins;
		if (Object.keys(changes).length) pluginDataChanged?.(slug, changes);
	});

	return () => {
		if (timer) flush();
		stopObserving();
		stopListening();
		stopWatchingDirty?.();
	};
};
