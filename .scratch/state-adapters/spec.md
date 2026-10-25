# Spec: State adapters, multiple canvases, and live Rooms

Status: ready-for-agent

Vocabulary follows `GLOSSARY.md`. Decisions are recorded in `docs/adr/0001`–`0006`. Throwaway spike: branch `prototype/room-sync` (`prototypes/room-sync/README.md` has the findings).

## Problem Statement

Everything in Are.na Canvas is tied to Are.na. A channel can hold only one canvas. Saving is manual. Every load and save goes straight to the Are.na API from about nine places in the code. There's no way to:

- keep several arrangements of the same channel;
- work on a canvas together in real time and see each other's cursors;
- keep working on a canvas outside Are.na (offline, without an Are.na token, or remixing someone else's public channel) and later bring the results back into the channel.

## Solution

1. **State adapters.** All loading and saving goes through a pluggable state adapter. The Are.na adapter ships in core. Plugins can register other adapters.
2. **Multiple canvases per channel.** Besides the default canvas, a channel can hold any number of named canvases. The sidebar lists them and can create, rename and delete them.
3. **Rooms.** Any canvas can be ejected into a Room: a live, collaborative copy of the canvas and its blocks, hosted on Cloudflare (one Durable Object instance per Room) and synced with Automerge.
   - Everyone with the link can edit live.
   - Each person sees the others' cursors and can follow someone's view.
   - Rooms keep working offline and catch up when back online.
4. **Remount.** A Room can be remounted into its origin channel through a reviewed three-way merge, as often as needed. Remounting can optionally close the Room.

## User Stories

### Multiple canvases

1. As a channel owner, I want my existing `.canvas` to keep working unchanged, so that adopting this feature breaks nothing.
2. As a channel owner, I want to create a named canvas in my channel, so that I can keep several arrangements of the same blocks.
3. As a channel owner, I want a new named canvas to start with the channel's blocks auto-placed, so that I don't begin from an empty board.
4. As a channel owner, I want to rename a named canvas, so that its purpose stays clear.
5. As a channel owner, I want to delete a named canvas, so that I can clean up arrangements I no longer need.
6. As a channel owner, I want the default canvas to be undeletable, so that a channel always has a canvas.
7. As a visitor, I want to open a named canvas by URL (`#<slug>/<canvas name>`), so that I can share a specific arrangement.
8. As a user, I want the sidebar to list every canvas and room pointer in the current channel, so that I can switch between them.
9. As a user, I want `.canvas`, `.canvas:<name>` and `.room:<name>` blocks never to render as blocks on the canvas, so that bookkeeping stays invisible.
10. As a user with unsaved changes on an Are.na canvas, I want the existing Save/Discard prompt when I switch canvas or room, so that I don't lose work.

### State adapters (plugin surface)

11. As a plugin author, I want to register a state adapter through the plugin system, so that I can add a new backend without modifying core.
12. As a plugin author, I want adapters to expose the same operations as the Are.na API (channel, contents, block, add, update, connect, upload, me) and return Are.na-shaped blocks, so that existing renderers work unchanged.
13. As a plugin author, I want an adapter to declare whether it saves explicitly or live, so that the UI shows or hides Save and the unsaved-changes prompts accordingly.
14. As a plugin author, I want to subscribe to remote changes through the adapter, so that my plugin reacts to collaborators.
15. As a core maintainer, I want every Are.na API call in core and plugins routed through the active adapter, so that switching backends is a single swap.
16. As a user, I want the adapter chosen from the URL (`#<slug>`, `#<slug>/<name>` → Are.na; `#room:<roomId>` → Room), so that links always open the right backend.
17. As a user, I want a channel literally named "room" to still open at `#room`, so that URLs never become ambiguous.

### Eject

18. As a user, I want to eject any canvas into a new Room, so that I can collaborate on it live.
19. As a user, I want eject to snapshot the canvas, all its blocks (title, content, description, image/link URLs, type), its edges and plugin data, so that the Room is complete and self-contained.
20. As a user, I want to name the Room at eject, defaulting to the canvas name, so that I can tell rooms apart.
21. As a user, I want to be taken into the Room immediately after ejecting, so that I can start working.
22. As a user with write access, I want eject to write a `.room:<name>` pointer into the origin channel, so that others can find the Room from the channel.
23. As a user without write access to the channel, I want to still be able to eject, getting a link and a recents entry, so that I can remix public channels.
24. As a user who later gains write access, I want an "Add pointer to channel" action, so that a pointerless Room becomes discoverable.
25. As a channel collaborator, I want the original canvas to stay fully editable after an eject, so that the channel isn't frozen by someone else's Room.

### Working in a Room

26. As a Room collaborator, I want every edit to sync live with no Save button, so that collaboration is effortless.
27. As a Room collaborator, I want two people moving or resizing different blocks, or the same block in different ways, to have both changes land, so that edits don't clobber each other.
28. As a Room collaborator, I want concurrent typing in the same text block to merge character by character, so that no one's words are lost.
29. As a Room collaborator, I want to create new blocks, so that the Room can grow beyond the original channel.
30. As a Room collaborator, I want new blocks created offline by several people never to collide, so that merges are always safe.
31. As a Room collaborator, I want to draw and remove edges, so that I can structure the canvas.
32. As a Room collaborator, I want plugin data (scenes, etc.) to sync live, so that plugin features work in Rooms.
33. As a Room collaborator, I want ⌘Z to undo only my own changes, so that I never undo a collaborator's work.
34. As a Room collaborator, I want my pan/zoom to stay my own, so that nobody drags my view around.
35. As a Room collaborator, I want to see everyone's cursors with names and colours, so that I know where people are working.
36. As a Room collaborator, I want to follow a person so my view mirrors theirs, and to stop following as soon as I pan or zoom, so that presentations and walkthroughs are easy.
37. As a Room collaborator, I want to see who is currently present in the sidebar, so that I know who I'm working with.
38. As a logged-in Are.na user, I want my Are.na name shown on my cursor, so that people recognise me.
39. As an anonymous user, I want a generated name and colour that persist across reloads and that I can rename, so that I have a stable identity without an account.
40. As a Room collaborator, I want to keep working when offline and to reopen Rooms I've visited without a network, with an indicator saying changes will sync, so that a flaky connection never loses work.
41. As anyone with a room link, I want to open the Room directly without the channel, so that sharing is just sending a link.
42. As a Room collaborator dropping a file, I want to be told uploads aren't supported in rooms yet, with an "Upload to Are.na instead" button, so that I still have a path to add images.
43. As a Room collaborator choosing "Upload to Are.na instead", I want the file uploaded into the origin channel and added to the Room where I dropped it, so that it appears for everyone immediately.
44. As a Room collaborator without an Are.na token or write access, I want that button disabled with a reason, so that I understand why.

### Remount

45. As a user, I want to remount a Room into its origin channel, so that the channel reflects the Room's work.
46. As a user, I want a review screen listing additions, edits, removals from channel, edge changes and conflicts before anything is written, so that I stay in control.
47. As a user, I want changes made on only one side since the eject snapshot to apply automatically, so that I only decide real conflicts.
48. As a user, I want every conflict pre-resolved to the Room's version and flippable individually to Are.na's, so that the common case is one click.
49. As a user, I want native blocks created on Are.na during remount, so that new work lands in the channel.
50. As a user, I want blocks deleted in the Room to be disconnected from the origin channel, not deleted from Are.na, so that nothing in other channels is destroyed.
51. As a user, I want the review screen to warn that a disconnected block also disappears from the channel's other canvases, so that there are no surprises.
52. As a user, I want edits to copied blocks I don't own marked "can't update: not yours" and skipped, without blocking the rest of the remount, so that partial permissions don't stop me.
53. As a user, I want a block uploaded to Are.na from inside the Room to merge silently on remount (added on both sides), so that it isn't duplicated.
54. As a user, I want to choose at confirm time whether to keep the Room open (the default) or close it, so that a Room can be a one-off or an ongoing workspace.
55. As a user keeping the Room open, I want its base advanced to the remounted state, so that the next remount shows only newer changes.
56. As a collaborator in a Room being remounted, I want native block ids to switch live to their new Are.na ids, so that the Room stays consistent with the channel.
57. As a plugin author, I want a `block-ids:rewritten` hook with an old → new id map, so that ids stored in my plugin's data stay valid.
58. As a user, I want a closed Room to open read-only and show as closed in the sidebar, so that history isn't lost.
59. As a user, I want remount to write the merged result over the original canvas block in the channel, so that the channel's canvas matches what I approved.

### Operations

60. As the maintainer, I want the Room server to live in this repo with its own dependencies, so that the static app stays dependency-free.
61. As the maintainer, I want the client Automerge code vendored and lazy-loaded only when a Room opens, so that Are.na-only users pay nothing.
62. As the maintainer, I want the Room adapter's default server URL configurable, and each room pointer to record its server, so that self-hosting and future moves work.
63. As the maintainer, I want rooms to stay within the Workers Free plan (batched persistence, hibernation, a presence throttle, no wasted relays), so that this costs nothing to run.
64. As the maintainer on macOS < 13.5, I want a working local dev loop for the Worker, so that I'm not forced to deploy to iterate.

## Implementation Decisions

### Domain and storage in channels
- A channel holds a **default canvas** (`.canvas`), any number of **named canvases** (`.canvas:<name>`) and **room pointers** (`.room:<name>`, content `{ roomId, server }`), one block each. All are hidden from canvas rendering. Every channel block appears on every canvas of that channel (existing behaviour); named canvases inherit it.
- Today's "first `.canvas` wins" loading is replaced by explicit canvas selection.

### State adapter interface (ADR 0003)
- Operations mirror the current Are.na module: get channel, get channel contents, get block, add block, update block, connect block, upload, me. Plus `saveCanvas(data)`, `subscribe(onRemoteChange)` and `saveMode: "explicit" | "live"`.
- Adapters are registered through the plugin controller. Core ships the Are.na adapter. The Room adapter is a plugin.
- Every direct Are.na API import in core and plugins moves to the active adapter (~9 call sites: state, script, block, drag operations, plugin controller, sidebar, move-blocks, channel-renderer, builtin block renderers).
- Unsaved-changes prompting, the Save button and the "updated" flag only apply when `saveMode` is `explicit`.

### Routing
- Hash forms: `#<slug>`, `#<slug>/<canvas name>`, `#room:<roomId>`. A `:` in the hash means `<adapter prefix>:<id>`. Are.na slugs are `[a-z0-9-]`, so they never collide. The adapter is derived from the URL, never from a global setting.
- Switching: run the explicit-save prompt if needed → tear down the current adapter (close sockets) → activate the new one → load.

### Room server (ADR 0001, 0004, 0006)
- A Worker plus a SQLite-class Durable Object `Room`. The Worker routes `/room/<roomId>` to `idFromName(roomId)`. **The room id is the Automerge document id** (~128 random bits): whoever holds it can read and write. There is no auth in v1.
- The DO runs a server-side automerge-repo `Repo` (Automerge's workerd build) with:
  - **A custom network adapter over hibernatable WebSockets.** It speaks automerge-repo's websocket wire protocol (CBOR `join` → `peer`). It stores `{ peerId, peerMetadata }` in each socket's attachment, re-adopts sockets from attachments when the DO is rebuilt after hibernation, and **drops any message whose `senderId` isn't the peer that joined on that socket** (a bug found in the spike).
  - **A storage adapter over the async DO storage API** (get/put/delete/list by prefix), not the sync `kv` API, so the same code runs on the older local runtime. Keys are joined storage-key paths.
  - `saveDebounceRate` ≈ 2000 ms. Persisted values must be chunked below the 2 MB per-value limit.
- **Presence bypasses automerge-repo** (ADR 0006). It's a separate message type on the same socket that the DO fans out to every *other* socket. It's never stored and never relayed by clients.
- The eject snapshot is stored once in DO storage, outside the Automerge document. Remount reads it, and advancing the base replaces it.
- The Worker code lives in its own directory in this repo with its own package manifest and wrangler config. The static app gets no npm dependencies.

### Room document (shape validated in the prototype)
```
{
  meta:    { originSlug, canvasName, ejectedAt, closed },
  blocks:  { [blockId]: <Are.na-shaped block> },
  canvas:  { nodes: { [nodeId]: { ...node, z } }, edges: { [edgeId]: edge } },
  plugins: { [pluginId]: <opaque value> }
}
```
- Nodes and edges are maps keyed by id, so each item merges independently. Render order comes from `z`.
- Block text (`content.markdown`) is edited with character-level splices (`updateText`). Other fields are last-writer-wins.
- The viewport is not in the document. It stays per-user in localStorage.
- Copied blocks keep their numeric Are.na ids. Native blocks use `DURABLE-` followed by about 10 random characters from an alphabet without lookalikes, never a counter.
- Plugin data is one opaque value per plugin, last-writer-wins, written whole. New hooks: `plugin-data:changed` (remote update) and `block-ids:rewritten` (old → new map). The existing `canvas:serialize` / `canvas:deserialize` hooks keep working for Are.na canvases.

### Room adapter (client) (ADR 0005)
- Lazily `import()`s a vendored automerge-repo bundle (~222 KB JS) and initialises the WASM from a separately shipped `automerge.wasm` (3.6 MB, about 1.1 MB gzipped). Inlining it as base64 was 1.7 MB gzipped.
- Uses an IndexedDB storage adapter (offline cache) and a WebSocket client adapter to the room's server URL. Shows online/offline status.
- **Mirrors the document to and from the existing store.** The store remains the render source.
  - Local store transactions on nodes, edges, blocks and plugin data become Automerge changes.
  - Remote patches become store transactions flagged as remote-origin.
  - That flag suppresses echo and skips undo history, which makes undo per-user.
  - The map ↔ array conversion (array order by `z`) happens only at this boundary.
- Presence payload: `{ me: { name, color }, cursor: {x, y} in canvas coordinates, viewport: {x, y, scale} }`.
  - Sent only on change, at most ~10 Hz.
  - Identity comes from the Are.na `me` name when logged in. Otherwise a generated name and colour persisted in localStorage, which the user can rename.
- Follow copies the followed person's viewport on each update. Any local pan or zoom ends it.
- Uploads: refuse by default. "Upload to Are.na instead" uploads into the origin channel with the user's token and inserts the result as a copied block at the drop point.

### Remount (ADR 0002)
- **Planner (pure):** `planRemount(snapshot, room, channel)` → a list of items:
  - add native block
  - update copied block
  - disconnect from channel
  - add or remove edge
  - canvas node changes
  - plugin data changes
  - conflicts

  Each item has a default resolution: one-sided changes apply, and conflicts default to the Room's version. Added-on-both-sides with the same block id is a silent no-op.
- **Applier:** `applyRemount(plan, choices, arenaAdapter)`:
  1. creates native blocks;
  2. collects the old → new id map;
  3. updates copied blocks, marking items that fail with 401/403 as "not yours" and skipping them;
  4. disconnects removed blocks;
  5. writes the merged canvas (with ids rewritten) over the original canvas block.

  It returns a per-item outcome plus the id map.
- After applying:
  - **Keep open (the default):** rewrite ids in the Room document (blocks, nodes, edges) and fire `block-ids:rewritten`, then replace the eject snapshot with the remounted state.
  - **Close:** set `meta.closed`. The Room opens read-only, and the pointer shows "closed".

### Sidebar
- For the current channel:
  - **Canvases:** default plus named. Actions: eject, rename, delete (not on the default), and "+ New canvas".
  - **Rooms:** remount, copy link, "open read-only" when closed.
  - **Recent:** includes room entries, also pointerless ones.
- In a Room, the sidebar shows the origin channel's list plus the people present, each with a follow button.

### Local development
- Production uses current wrangler and workerd.
- On macOS < 13.5 the Worker can be run locally with **wrangler 3.78.8** (workerd 2024-09-09, the last build for macOS 11.5+) and `compatibility_date = "2024-09-09"`. This needs:
  - a local-only `FinalizationRegistry` no-op stub, imported before Automerge (it leaks WASM memory, acceptable in dev);
  - no `[assets]` block. The static app is served separately, as in production.
- Verified with the spike's two-client sync test. Final checks happen on a deployed dev Worker, because the local runtime is two years behind production.

## Testing Decisions

- Tests check **external behaviour at the seams**, not internals. Use `node --test` with no framework, loading modules directly or in a `vm` sandbox with a faked `controller`/`state`/`fetch`, like the existing move-blocks plugin test.
- **Seam 1: the state adapter contract.** One shared suite runs against the Are.na adapter (fetch faked) and the Room adapter (two in-memory automerge-repos joined by a `MessageChannel`, no Worker). It covers:
  - load, add, update and connect, plus `saveCanvas` and `saveMode`;
  - `subscribe` delivers remote changes.

  Room-only cases:
  - a local store transaction reaches the other client;
  - a remote change lands in the store without being echoed back;
  - undo reverses only local changes;
  - plugin data syncs;
  - `block-ids:rewritten` fires.
- **Seam 2: the remount planner and applier.** Table-driven pure tests covering:
  - one-sided changes on each side;
  - both-sides edits (block text, node position, edges);
  - edited on one side, deleted on the other;
  - added on both sides;
  - native blocks;
  - "not yours" failures;
  - id rewriting in the merged canvas and the advanced base.

  The applier is tested against a faked Are.na adapter, asserting the call order and the returned id map.
- **Seam 3: the Room Durable Object.** Run in Node with a fake `ctx` (socket list with attachments, in-memory async storage). It covers:
  - the join → peer handshake;
  - a socket may only speak as its joined peer;
  - re-adopting sockets on a rebuild (simulated hibernation);
  - debounced persistence, with chunking past 2 MB;
  - presence fan-out to other sockets only, never back to the sender.
- **Not automated:** sidebar UI, routing glue, the review screen, presence rendering and real-runtime behaviour. These are checked manually, locally with the pinned wrangler and on a deployed dev Worker.

## Out of Scope

- Uploads stored by the Room itself (an R2 bucket). The adapter's upload operation leaves room for it.
- Authentication, revocable links, and separate read-only room links (ADR 0004 leaves room for a view id).
- A version-history or time-travel UI. Full history is kept, so it can be built later.
- Deleting rooms (only closing).
- Ejecting nested channels' contents (channel blocks are copied as blocks).
- Live pulling of Are.na-side changes into a Room between remounts.
- Rooms on non-default servers via URL (`#room:<id>@<host>`); pointers carry the server instead.
- Renaming `edges`/"connection" throughout the code. Only the user-facing strings move to **Edge**; code renames happen opportunistically.

## Further Notes

- **Free-plan budget:** 100k requests per day, with incoming WebSocket messages counted 20:1 (about 2M messages per day), and **100k SQLite row writes per day**. Batched saves, hibernation, the ~10 Hz presence cap and server-side presence fan-out keep a room well inside this.
- **The spike found and fixed** a socket-routing bug: relayed messages carrying another peer's `senderId` must be dropped, not used to re-map that peer.
- **Not yet proven anywhere:** offline reload from IndexedDB, chunking past 2 MB, and the store mirror. They're covered by the tests above.
- **Prototype deploy:** `prototype-room-sync.pashineaaryan.workers.dev` can be removed with `npx wrangler delete prototype-room-sync` from the prototype directory.
