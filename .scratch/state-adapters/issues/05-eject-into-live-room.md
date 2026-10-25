# 05: Eject a canvas into a live Room

**What to build:** The first end-to-end Room. From any canvas the user can **eject**: a new Room is created containing a full snapshot of the canvas, its blocks, edges and plugin data (Room document shape below, validated by the prototype), and the user lands on `#room:<roomId>`. The Room adapter (a plugin, `saveMode: "live"`) lazily loads the vendored automerge-repo bundle and WASM, connects to the room server, and **mirrors** the document to and from the existing store (ADR 0005). Two tabs on the same Room see each other's moves, resizes and edges live. No Save button in Rooms.

```
{ meta:    { originSlug, canvasName, ejectedAt, closed },
  blocks:  { [blockId]: <Are.na-shaped block> },
  canvas:  { nodes: { [nodeId]: { ...node, z } }, edges: { [edgeId]: edge } },
  plugins: { [pluginId]: <opaque value> } }
```

**Blocked by:** 02, 04

**Status:** ready-for-agent

- [ ] Eject creates the Room from the current canvas; copied blocks keep their Are.na ids; `meta.originSlug`/`canvasName`/`ejectedAt` set
- [ ] `#room:<roomId>` activates the Room adapter; leaving tears it down (sockets closed)
- [ ] Automerge bundle + separately shipped `.wasm` are vendored and only downloaded when a Room is opened
- [ ] Store ↔ document mirror: local node/edge changes reach other clients; remote patches update the store flagged remote-origin and are not echoed back; array order follows `z`
- [ ] Viewport is not synced; it stays per-user
- [ ] Room adapter passes the shared adapter contract suite, using two in-memory repos over a `MessageChannel`
- [ ] Manual: two tabs on a deployed dev Worker see each other's changes live
