# 01: State adapter registry + Are.na adapter (expand)

**What to build:** Introduce the **state adapter** plugin surface (ADR 0003) beside the existing code, without changing any caller. Plugins can register an adapter through the plugin controller; core exposes the active adapter. Core ships an Are.na adapter that wraps today's Are.na API functions (get channel, get channel contents, get block, add block, update block, connect block, upload, me) and adds `saveCanvas(data)`, `subscribe(onRemoteChange)` and `saveMode: "explicit"`. See spec: "State adapter interface".

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Adapters can be registered via the plugin controller and one is active at a time
- [x] The Are.na adapter exposes every operation of the current Are.na module, returning the same Are.na-shaped data, plus `saveCanvas`, `subscribe`, `saveMode: "explicit"`
- [x] `saveCanvas` reproduces today's save behaviour for the default canvas (update the `.canvas` block, or create it when missing)
- [x] A reusable adapter **contract test suite** (`node --test`, fetch faked, in the style of the existing move-blocks test) passes against the Are.na adapter, ready to be run against other adapters
- [x] No existing call site changes; the app behaves exactly as before

## Comments

- Implemented in `adapters/arena-adapter.js` (adapter) and `adapters/registry.js` (registry); `plugin.js` registers and activates the Are.na adapter and exposes `controller.registerStateAdapter` / `controller.getStateAdapter`.
- Contract suite: `tests/state-adapter-contract.mjs`, run for Are.na by `tests/arena-adapter.test.mjs` against the real `arena.js` with a faked v3 API. Run everything with `node --test tests/*.test.mjs`.
- Note for 02: the adapter's `saveCanvas` finds the `.canvas` block from the channel contents it has loaded, so loading must go through `adapter.get_channel_contents` before `saveCanvas` replaces `saveCanvasToArena`. Toasts and the `updated` flag stay with the caller; `saveCanvas` returns `{ ok, block }` or `{ ok: false, status }`.
