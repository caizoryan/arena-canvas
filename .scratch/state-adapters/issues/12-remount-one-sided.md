# 12: Remount: one-sided changes

**What to build:** A user can **remount** a Room into its origin channel through a review screen (ADR 0002). The room server keeps the **eject snapshot** (outside the Automerge document) as the merge base. A pure planner diffs snapshot vs Room vs current channel; an applier writes the plan to Are.na. This ticket handles changes made on only one side, and the "close the Room" outcome; conflicts come in 13 and keep-open in 14.

**Blocked by:** 06, 11

**Status:** ready-for-agent

- [ ] Eject stores the snapshot in the room's DO storage; remount reads it
- [ ] `planRemount(snapshot, room, channel)` returns items: add native block, update copied block, disconnect from channel, add/remove edge, canvas node changes, plugin data changes; one-sided changes default to apply
- [ ] Review screen lists all items before anything is written; disconnects warn that the block also leaves the channel's other canvases
- [ ] `applyRemount(plan, choices, arenaAdapter)` creates native blocks, collects the old→new id map, updates copied blocks, disconnects removed ones, and writes the merged canvas (ids rewritten) over the original canvas block; returns per-item outcomes + id map
- [ ] Confirm offers keep-open/close; choosing **close** sets `meta.closed`
- [ ] Table-driven pure tests for the planner; applier tested against a faked Are.na adapter (call order, id map)
