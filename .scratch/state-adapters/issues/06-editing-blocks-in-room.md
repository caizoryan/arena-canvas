# 06: Editing blocks in a Room

**What to build:** Inside a Room, users create **native blocks** and edit any block's text, with concurrent edits merging. Add/update block operations go through the Room adapter and write to the Room document.

**Blocked by:** 05

**Status:** resolved

- [x] New blocks get `DURABLE-` + ~10 random characters (no lookalikes), never a counter
- [x] Text block content is edited with character-level splices; concurrent typing in the same block from two clients keeps both edits
- [x] Titles and other fields are last-writer-wins
- [x] Existing renderers display native blocks like Are.na blocks
- [x] Contract/mirror tests cover native block creation and concurrent text merge

## Note

Room adapter `add_block`/`add_link` now create native blocks (`DURABLE-` + 10 unlookalike random chars, Are.na-shaped so existing renderers work); `update_block` edits `content.plain`/`markdown` with Automerge `updateText` splices, other fields stay last-writer-wins. Tests in `tests/room-adapter.test.mjs`. Not done: remote text edits are not yet pushed into an already-rendered text block (only canvas/nodes are mirrored).
