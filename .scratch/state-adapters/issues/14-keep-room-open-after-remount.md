# 14: Keep a Room open after remount

**What to build:** Choosing to keep the Room open (the default) after a remount makes it an ongoing workspace: native blocks that were created on Are.na switch live to their new numeric ids for everyone in the Room, plugins are told via `block-ids:rewritten`, and the Room's base advances so the next remount shows only newer changes.

**Blocked by:** 12, 08

**Status:** ready-for-agent

- [ ] Room document ids rewritten in blocks, nodes and edges; rewritten blocks become copied blocks
- [ ] `block-ids:rewritten` fires with the old→new map; plugin data stored ids can be fixed (scenes as reference)
- [ ] Collaborators see the id switch live without breaking selection/rendering
- [ ] Eject snapshot replaced with the remounted state; a second remount with no new changes shows an empty plan
