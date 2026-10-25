# Remount is a reviewed three-way merge, Room wins by default

After eject, the original canvas in the origin channel stays fully editable, so the room and the channel can diverge. The room therefore keeps the eject snapshot forever, and remount three-way merges room, channel, and snapshot. One-sided changes apply automatically; conflicts are shown on a review screen, pre-resolved to the room's version and individually flippable, and nothing is written to Are.na until the user confirms.

## Considered Options

- **Freeze the original canvas at eject**: would make remount a simple overwrite, but was rejected so the channel stays usable for people not in the room.
- **Automatic Room-wins remount with no review**: rejected because it silently overwrites edits made on Are.na.
