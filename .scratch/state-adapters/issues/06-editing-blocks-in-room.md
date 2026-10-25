# 06: Editing blocks in a Room

**What to build:** Inside a Room, users create **native blocks** and edit any block's text, with concurrent edits merging. Add/update block operations go through the Room adapter and write to the Room document.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] New blocks get `DURABLE-` + ~10 random characters (no lookalikes), never a counter
- [ ] Text block content is edited with character-level splices; concurrent typing in the same block from two clients keeps both edits
- [ ] Titles and other fields are last-writer-wins
- [ ] Existing renderers display native blocks like Are.na blocks
- [ ] Contract/mirror tests cover native block creation and concurrent text merge
