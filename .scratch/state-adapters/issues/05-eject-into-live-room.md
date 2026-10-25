# 05: Eject a canvas into a live Room

**What to build:** The first end-to-end Room. From any canvas the user can **eject**: a new Room is created containing a full snapshot of the canvas, its blocks, edges and plugin data (Room document shape below, validated by the prototype), and the user lands on `#room:<roomId>`. The Room adapter (a plugin, `saveMode: "live"`) lazily loads the vendored automerge-repo bundle and WASM, connects to the room server, and **mirrors** the document to and from the existing store (ADR 0005). Two tabs on the same Room see each other's moves, resizes and edges live. No Save button in Rooms.

```
{ meta:    { originSlug, canvasName, ejectedAt, closed },
  blocks:  { [blockId]: <Are.na-shaped block> },
  canvas:  { nodes: { [nodeId]: { ...node, z } }, edges: { [edgeId]: edge } },
  plugins: { [pluginId]: <opaque value> } }
```

**Blocked by:** 02, 04

**Status:** resolved

- [x] Eject creates the Room from the current canvas; copied blocks keep their Are.na ids; `meta.originSlug`/`canvasName`/`ejectedAt` set
- [x] `#room:<roomId>` activates the Room adapter; leaving tears it down (sockets closed)
- [x] Automerge bundle + separately shipped `.wasm` are vendored and only downloaded when a Room is opened
- [x] Store ↔ document mirror: local node/edge changes reach other clients; remote patches update the store flagged remote-origin and are not echoed back; array order follows `z`
- [x] Viewport is not synced; it stays per-user
- [x] Room adapter passes the shared adapter contract suite, using two in-memory repos over a `MessageChannel`
- [x] Manual: two tabs on a deployed dev Worker see each other's changes live

## Comments

- **Where things live.**
  - `plugins/room/`: `adapter.js` (Room adapter), `document.js` (document shape, eject snapshot, array ↔ map/z conversion), `mirror.js` (store ↔ room) and `index.js` (plugin wiring, eject button, viewport).
  - Vendored client in `vendor/automerge/`, built with `npm run vendor` in `room-server/` from `room-server/vendor-entry.js`.
- **Loading.** A room loads through the unchanged app path: the adapter returns the room's blocks plus a synthetic `.canvas` block (`room-canvas:<id>`) built from the document.
- **Store mirror.**
  - Local edits are written through `saveCanvas` as minimal field diffs, at most every 50 ms.
  - Remote edits arrive through `subscribe` and are applied untracked.
  - Echo suppression is a flag set while the adapter changes a document: automerge-repo 2.5.6 emits change events synchronously and doesn't say where a change came from.
- **New core pieces:**
  - `store.observe`;
  - the `canvas:loaded` hook;
  - `registerUI("canvases", …)` in the sidebar;
  - registry `prefix`/`get`/`byPrefix` and `teardown` on switch;
  - `controller.getStateAdapter(id)`;
  - `canvasData` exported from `script.js`;
  - `try_auth` always using the Are.na adapter.
- **Isolation.** Each room gets its own socket, and `shareConfig` only offers a document to its own room's server (tested).
- **Default server** is the dev Worker (`wss://arena-canvas-rooms-dev…`); set localStorage `room-server` to override. Switch the default when production is deployed.
- **Fixed while testing in the browser:**
  - a cold server answering after the client's 1 s "ready" timeout made the first open fail; the adapter now waits up to 10 s for its server;
  - concurrent first calls built two Repos; start-up is now shared;
  - the synthetic canvas id was sent to Are.na (400); the adapter now answers it;
  - a failed load left the URL on the failed route; it's now restored.
- **Verified on the dev Worker with two tabs:**
  - eject from a real channel (positions kept, Automerge loaded only then);
  - a link-only tab loads the room;
  - a move and an edge A→B in ~105 ms, a resize B→A in ~130 ms;
  - remote edits stay out of undo, and viewports stay per user;
  - leaving closes the sockets and brings Save back;
  - a bad room link fails cleanly.
- **Known gaps:**
  - Remote z changes don't reorder the store array; order applies on next load.
  - Remote plugin data isn't applied yet (08).
  - Block text is last-writer-wins until 06.
  - Eject doesn't name the room or write a `.room:` pointer (11).
  - automerge-repo's client opens a second socket if the first takes over 5 s to connect (seen once).
