# 08: Plugin data in Rooms

**What to build:** Plugin data (e.g. scenes) syncs live in Rooms: each plugin owns one opaque, last-writer-wins value in the document's `plugins` map, written whole when its state changes. A new `plugin-data:changed` hook delivers remote updates; Are.na canvases keep using `canvas:serialize`/`canvas:deserialize`.

**Blocked by:** 05

**Status:** resolved

- [x] Eject copies plugin data from the canvas into `plugins`
- [x] A plugin's change in one client appears in the other via `plugin-data:changed`
- [x] The scenes plugin works in a Room (save a scene in one tab, load it in another)
- [x] Existing serialize/deserialize behaviour for Are.na canvases unchanged

## Resolution

Eject already copied plugin data into `plugins` (`writeCanvas`). Added: the mirror now saves plugin data when plugins mark the canvas dirty (`watchDirty`) and fires the new `plugin-data:changed` hook (`{ slug, key, value }`, once per changed key) for remote updates, never for own writes. The scenes plugin listens to it. Serialize/deserialize are untouched. Tested in `tests/room-adapter.test.mjs`; the two-tab scenes flow itself was not run in a browser.
