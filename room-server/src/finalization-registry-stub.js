// Local development only (see wrangler.local.toml). Automerge's WASM bindings
// construct FinalizationRegistry at import time, which the 2024-09-09 workerd
// that runs on older macOS can't do. wasm-bindgen only falls back when the
// global is missing, so replace it outright with a no-op. WASM memory is then
// never reclaimed: fine for a dev session, never for production.
globalThis.FinalizationRegistry = class {
	register() {}
	unregister() {}
};
