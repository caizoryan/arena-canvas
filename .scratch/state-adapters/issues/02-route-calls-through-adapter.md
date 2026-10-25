# 02: Route all Are.na calls through the active adapter (migrate + contract)

**What to build:** Every place that talks to Are.na directly (core: state loading, saving, block creation/editing, drag-to-add, plugin controller, sidebar auth; plugins: move-blocks, channel-renderer, builtin block renderers) goes through the active state adapter instead. Save button, "updated" flag, unsaved-changes modal and `beforeunload` prompt only apply when the active adapter's `saveMode` is `explicit`. Then remove the old direct path.

**Blocked by:** 01

**Status:** resolved

- [x] No module other than the Are.na adapter imports the Are.na API module; a test enforces this
- [x] Save/unsaved-changes UI is driven by `saveMode` (still shown for Are.na)
- [x] Loading, saving, adding, editing, moving-between-channels and channel-block rendering behave exactly as before (existing move-blocks test still passes; manual smoke test of a real channel)

## Comments

- `adapters/index.js` is now the only importer of `arena.js` (enforced by `tests/arena-imports.test.mjs`). Core uses `stateAdapter()`; third-party plugins use `controller.getStateAdapter()`. `try_auth` moved there too, calling the adapter's `me`.
- `saveCanvasToArena` is now `saveCanvas` in `script.js`. It is a no-op for live adapters; `hasUnsavedChanges()` gates the Save/Discard modal and `beforeunload`, and the Save button hides when `saveMode` isn't `explicit`.
- `plugins/move-blocks.js` was rerouted in the working tree only: its Are.na calls belong to uncommitted cross-channel move work, so that change lands with it (as does the matching stub in the untracked `tests/move-blocks.test.mjs`).
- Smoke-tested against a real public channel (load only; no signed-in save) plus fake explicit/live adapters for save results, prompts and the Save button.
