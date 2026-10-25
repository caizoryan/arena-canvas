# 08: Plugin data in Rooms

**What to build:** Plugin data (e.g. scenes) syncs live in Rooms: each plugin owns one opaque, last-writer-wins value in the document's `plugins` map, written whole when its state changes. A new `plugin-data:changed` hook delivers remote updates; Are.na canvases keep using `canvas:serialize`/`canvas:deserialize`.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Eject copies plugin data from the canvas into `plugins`
- [ ] A plugin's change in one client appears in the other via `plugin-data:changed`
- [ ] The scenes plugin works in a Room (save a scene in one tab, load it in another)
- [ ] Existing serialize/deserialize behaviour for Are.na canvases unchanged
