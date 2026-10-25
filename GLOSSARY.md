# Are.na Canvas

A spatial canvas for arranging and connecting the blocks of an Are.na channel.

## Language

**Channel**:
An Are.na channel: a collection of blocks owned by Are.na.
_Avoid_: board, collection

**Block**:
A single piece of content (text, image, link, attachment, or nested channel) placed on a canvas.
_Avoid_: card, item, node (in user-facing language)

**Canvas**:
One spatial arrangement of blocks and the edges between them.
_Avoid_: layout, board, `.canvas` file

**Edge**:
A drawn line between two blocks on a canvas.
_Avoid_: connection, link, arrow

**Connection**:
Are.na's relationship of a block being in a channel; connecting adds a block to a channel, disconnecting removes it.
_Avoid_: using it for edges

**Default canvas**:
The unnamed canvas of a channel; a channel may also hold any number of named canvases.

**Room pointer**:
A marker stored in a channel that names a room and tells the app where to find it; it holds no canvas itself.
_Avoid_: room file, room link

**Room**:
A self-contained canvas document, identified by a room id, that holds its own blocks plus exactly one canvas, live-synced between collaborators.
_Avoid_: durable, session, space

**State adapter**:
The pluggable backend that loads and saves a canvas and its blocks, such as Are.na or a room. Exactly one is active at a time.
_Avoid_: backend, provider, store

**Presence**:
The live, unsaved state each person in a room shares with the others: who they are, their cursor, and their viewport.
_Avoid_: awareness, status

**Follow**:
Mirroring another person's viewport in a room so your view tracks theirs.
_Avoid_: spectate, watch

**Eject**:
Turning a canvas into a new room by snapshotting the canvas and all its blocks; afterwards the room, not Are.na, owns that content.
_Avoid_: export, migrate, move to durable

**Frozen canvas**:
A canvas that has been ejected; it stays read-only in the channel as the baseline until its room is remounted.
_Avoid_: archived canvas, old canvas

**Origin channel**:
The channel a room was ejected from.
_Avoid_: source, parent channel

**Eject snapshot**:
The frozen copy of a canvas and its blocks taken at eject, kept by the room as the common base for remounting.
_Avoid_: backup, baseline copy

**Remount**:
Writing a room's changes back into its origin channel by three-way merging the room, the channel's current canvas, and the eject snapshot, after the user reviews the diff.
_Avoid_: sync back, import, merge (alone)

**Conflict**:
During remount, a block or connection changed differently in both the room and the origin channel since the eject snapshot.

**Copied block**:
A block in a room that was snapshotted from the origin channel at eject; it keeps its Are.na identity.
_Avoid_: arena block (when inside a room)

**Native block**:
A block created inside a room that has never existed on Are.na.
_Avoid_: durable block, local block, new block
