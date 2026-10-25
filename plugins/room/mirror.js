// Mirrors the app's store to and from a room (ADR 0005). The store stays what
// everything renders from:
// - local store changes to nodes and edges are saved to the room, batched to
//   at most one write per `delay` ms;
// - remote changes are applied to the store untracked (so undo only ever
//   reverses your own changes) and flagged so they aren't sent back.
//
// The app supplies how to show and hide a node: mount(node, block) and
// unmount(node), and edgesChanged() to redraw edges.
const NODES = ["data", "nodes"];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const touchesCanvas = (location, value) =>
	location[0] == "data" && (
		location[1] == "nodes" || location[1] == "edges" ||
		(location.length == 1 && (value?.[0] == "nodes" || value?.[0] == "edges"))
	);

// A remote removal of nodes[index] shifts later nodes down. Undo/redo actions
// address nodes by array index, so repoint them, and drop the ones that
// belonged to the removed node (its changes can't be undone any more).
const forgetRemovedNode = (store, index) => store.rewriteHistory((action) => {
	let [location, op, value] = action;
	if (location[0] != "data" || location[1] != "nodes") return action;
	if (location.length == 2) {
		if (op == "insert" && value[0] > index) return [location, op, [value[0] - 1, value[1]]];
		return action;
	}
	if (location[2] == index) return null;
	if (location[2] > index) return [[location[0], location[1], location[2] - 1, ...location.slice(3)], op, value];
	return action;
});

export const applyRemoteCanvas = (store, canvas, { block, mount, unmount, edgesChanged }) => {
	let remoteIds = new Set(canvas.nodes.map((node) => String(node.id)));
	store.get(NODES)
		.filter((node) => !remoteIds.has(String(node.id)))
		.forEach((node) => {
			let index = store.get(NODES).indexOf(node);
			unmount(node);
			if (index != -1 && store.get(NODES).indexOf(node) == -1) forgetRemovedNode(store, index);
		});

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

export const startMirror = ({
	store, adapter, slug, getData, mount, unmount, edgesChanged, delay = 50,
}) => {
	let applyingRemote = false;
	let timer;

	let flush = () => {
		clearTimeout(timer);
		timer = undefined;
		adapter.saveCanvas(getData());
	};

	let stopObserving = store.observe((location, action, value) => {
		if (applyingRemote || !touchesCanvas(location, value)) return;
		if (!timer) timer = setTimeout(flush, delay);
	});

	let stopListening = adapter.subscribe(({ slug: changed, canvas, block }) => {
		if (changed != slug) return;
		applyingRemote = true;
		try {
			applyRemoteCanvas(store, canvas, { block, mount, unmount, edgesChanged });
		} finally {
			applyingRemote = false;
		}
	});

	return () => {
		if (timer) flush();
		stopObserving();
		stopListening();
	};
};
