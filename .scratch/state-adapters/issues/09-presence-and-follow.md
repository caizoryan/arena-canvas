# 09: Presence and Follow

**What to build:** In a Room, people see each other's cursors (name + colour), see who is present in the sidebar, and can **follow** someone so their view mirrors that person's viewport. Presence travels as its own message type through the room server's fan-out (ADR 0006), never stored.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Payload `{ me: {name, color}, cursor: {x,y} canvas coords, viewport: {x,y,scale} }`, sent only on change, capped at ~10 Hz, final position always delivered
- [ ] Identity: Are.na `me` name when logged in; otherwise a generated name + colour persisted in localStorage; user can rename
- [ ] Sidebar shows people present with a follow button; following mirrors their viewport on every update; any local pan/zoom stops following
- [ ] Peers disappear when they leave
