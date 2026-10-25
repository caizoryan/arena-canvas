# 07: Per-user undo in Rooms

**What to build:** In a Room, ⌘Z / redo only reverse the current user's own changes; collaborators' changes are never undone (ADR 0005: remote-origin transactions skip undo history).

**Blocked by:** 05

**Status:** resolved

- [x] Remote changes applied to the store are not recorded in undo history
- [x] Undo of a local move after a collaborator's move of a different block leaves the collaborator's move intact
- [x] Undo is applied as a new change and syncs to others
- [x] Covered by a mirror test with two clients

## Comments

- Remote patches were already applied untracked (05); now covered by tests.
- New: undo/redo actions address nodes by array index, so a collaborator deleting an earlier node would have made undo hit the wrong block. `store.rewriteHistory` plus `forgetRemovedNode` in `plugins/room/mirror.js` repoint history entries after a remote removal and drop those for the removed node.
- Undo/redo go through the store, so the mirror writes them to the room as ordinary new changes.
- Tests: two new mirror tests in `tests/room-adapter.test.mjs` (undo beside a collaborator's move, syncing; undo after a remote delete).
