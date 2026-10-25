import * as arena from "../arena.js";
import { reactive } from "../chowk.js";
import { notificationpopup } from "../notification.js";
import { state } from "../state.js";
import { createArenaAdapter } from "./arena-adapter.js";
import { createStateAdapterRegistry } from "./registry.js";

// The one place the app picks its state adapter. Core and plugins load and
// save through stateAdapter(); only this module talks to arena.js directly.
const stateAdapters = createStateAdapterRegistry();

// Mirrors the active adapter's saveMode so the Save button can react to it.
export const saveMode = reactive("explicit");

export const registerStateAdapter = (adapter) => stateAdapters.register(adapter);

export const activateStateAdapter = (id) => {
	let adapter = stateAdapters.activate(id);
	saveMode.next(adapter.saveMode);
	return adapter;
};

export const stateAdapter = () => stateAdapters.active();

// A registered adapter by id, e.g. the Are.na adapter while a room is open.
export const getStateAdapter = (id) => stateAdapters.get(id);

// The adapter that owns `#<prefix>:<id>` URLs.
export const stateAdapterForPrefix = (prefix) => stateAdapters.byPrefix(prefix);

// The Save button, the "updated" flag and the unsaved-changes prompts only
// mean something for adapters that save explicitly.
export const hasUnsavedChanges = () =>
	stateAdapter()?.saveMode == "explicit" && !state.updated.value();

registerStateAdapter(createArenaAdapter(arena, {
	getSlug: () => state.currentSlug.value(),
	getCanvasName: () => state.canvasName.value(),
}));
activateStateAdapter("arena");

// Identity always comes from Are.na, whichever adapter is open.
export let try_auth = () => {
	getStateAdapter("arena").me()
		.then(res=>{
			if (res.status == 200) {
				res.json().then(m => {
					Object.assign(state.me, m)
					state.authSlug.next(m.slug)
					notificationpopup('Authenticated as: ' + m.slug)
				})
			}
			else {
				console.log("Auth failed: ", res.status, res)
				notificationpopup("Auth failed: " + res.status, true)
			}
		})
}
