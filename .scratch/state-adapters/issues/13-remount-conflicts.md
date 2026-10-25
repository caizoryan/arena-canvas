# 13: Remount: conflicts

**What to build:** When the same block, node or edge changed differently in the Room and the origin channel since the eject snapshot, the review screen shows a **conflict**, pre-resolved to the Room's version and flippable to Are.na's per item. Partial permissions and double additions are handled without blocking the remount.

**Blocked by:** 12

**Status:** ready-for-agent

- [ ] Conflicts detected for both-sides edits (block text/fields, node position/size, edges) and edit-vs-delete
- [ ] Each conflict defaults to the Room and can be flipped; the applier honours choices
- [ ] Updating a copied block the user doesn't own (401/403) marks it "can't update: not yours", skips it, and the rest proceeds
- [ ] A block present on both sides but not in the snapshot (e.g. uploaded to Are.na from the Room) merges silently
- [ ] Table-driven planner tests for every case above
