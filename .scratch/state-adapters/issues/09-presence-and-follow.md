# 09: Presence and Follow

**What to build:** In a Room, people see each other's cursors (name + colour), see who is present in the sidebar, and can **follow** someone so their view mirrors that person's viewport. Presence travels as its own message type through the room server's fan-out (ADR 0006), never stored.

**Blocked by:** 05

**Status:** resolved

- [x] Payload `{ me: {name, color}, cursor: {x,y} canvas coords, viewport: {x,y,scale} }`, sent only on change, capped at ~10 Hz, final position always delivered
- [x] Identity: Are.na `me` name when logged in; otherwise a generated name + colour persisted in localStorage; user can rename
- [x] Sidebar shows people present with a follow button; following mirrors their viewport on every update; any local pan/zoom stops following
- [x] Peers disappear when they leave

## Resolution note

Presence logic lives in `plugins/room/presence.js` (throttled sender, peers, follower, identity, wire) and is unit-tested in `tests/room-presence.test.mjs`. `presence-ui.js` wires it to the page (cursor layer in `.container`, viewport subscriptions), `index.js` starts it per room and registers the sidebar "People" list (`registerUI("people")`, rendered by `sidebar.js`). The server side already existed (ticket 04). New joiners learn of existing peers because a peer that sees a new peer id resends its own presence. The cursor/sidebar rendering was not exercised in a browser here (needs a deployed or local Room server), only syntax-checked.
