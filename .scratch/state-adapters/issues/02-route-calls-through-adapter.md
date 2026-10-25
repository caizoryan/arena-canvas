# 02: Route all Are.na calls through the active adapter (migrate + contract)

**What to build:** Every place that talks to Are.na directly (core: state loading, saving, block creation/editing, drag-to-add, plugin controller, sidebar auth; plugins: move-blocks, channel-renderer, builtin block renderers) goes through the active state adapter instead. Save button, "updated" flag, unsaved-changes modal and `beforeunload` prompt only apply when the active adapter's `saveMode` is `explicit`. Then remove the old direct path.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] No module other than the Are.na adapter imports the Are.na API module; a test enforces this
- [ ] Save/unsaved-changes UI is driven by `saveMode` (still shown for Are.na)
- [ ] Loading, saving, adding, editing, moving-between-channels and channel-block rendering behave exactly as before (existing move-blocks test still passes; manual smoke test of a real channel)
