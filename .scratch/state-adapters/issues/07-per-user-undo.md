# 07: Per-user undo in Rooms

**What to build:** In a Room, ⌘Z / redo only reverse the current user's own changes; collaborators' changes are never undone (ADR 0005: remote-origin transactions skip undo history).

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Remote changes applied to the store are not recorded in undo history
- [ ] Undo of a local move after a collaborator's move of a different block leaves the collaborator's move intact
- [ ] Undo is applied as a new change and syncs to others
- [ ] Covered by a mirror test with two clients
