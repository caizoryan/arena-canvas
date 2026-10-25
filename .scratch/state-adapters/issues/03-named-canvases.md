# 03: Named canvases

**What to build:** A channel can hold the **default canvas** (`.canvas`) plus any number of named canvases (`.canvas:<name>`). Users open them via `#<slug>/<canvas name>`, and manage them from a new *Canvases* section in the sidebar. Every channel block still appears on every canvas (auto-placed if new). See spec: "Domain and storage in channels", "Routing", "Sidebar".

**Blocked by:** 02

**Status:** resolved

- [x] `#<slug>` opens the default canvas exactly as today; `#<slug>/<name>` opens the named canvas
- [x] Loading selects the requested canvas block explicitly (no "first `.canvas` wins")
- [x] `.canvas`, `.canvas:<name>` and `.room:<name>` blocks never render as blocks
- [x] Sidebar lists the channel's canvases; **+ New canvas** creates `.canvas:<name>` with blocks auto-placed; **rename** changes the title; **delete** disconnects it from the channel; the default canvas cannot be deleted
- [x] Switching canvases with unsaved changes shows the existing Save/Discard prompt
- [x] Hash parsing treats `<prefix>:<id>` as an adapter route and anything else as `slug[/name]` (a channel named `room` still opens at `#room`)

## Comments

- `canvases.js` holds the storage conventions (`canvasTitle`, `canvasNameOf`, `isHiddenBlock`, `channelCanvases`) and routing (`parseRoute`, `routeHash`). Names are URL-encoded in the hash: `#garden/spring%20plan`.
- The Are.na adapter saves to the open canvas (`getCanvasName`), remembers canvases it created or renamed so a lagging contents endpoint can't make it create duplicates, and gained `disconnect_block(slug, blockId)`, which deletes the block's connection (`DELETE /v3/connections/{id}`, id from `connection.id` in channel contents). `disconnect_block` is now part of the contract and required by the registry.
- `#<prefix>:<id>` routes are recognised but refused with a notice until the Room adapter exists (ticket 05).
- Opening `#slug/<name>` for a canvas that doesn't exist shows the blocks auto-placed and says saving creates it; **+ New canvas** does that and saves immediately.
- Verified in the browser against an in-page fake Are.na API (load, switch, new, rename, delete, unsaved prompt, room link) and against a real public channel (load only). Rename/delete/create against real Are.na with a token are untested.
