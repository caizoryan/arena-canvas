# 11: Room pointers in the sidebar

**What to build:** Rooms become discoverable from their **origin channel**. Eject writes a `.room:<name>` **room pointer** (`{ roomId, server }`) when the user can write to the channel; otherwise the Room still works via its link and Recent. The sidebar gets a *Rooms* section, and while inside a Room it shows the origin channel's canvases and rooms. The Room adapter's default server URL is configurable.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] Eject asks for a Room name (default: canvas name) and writes the pointer when writable
- [ ] Without write access, eject still succeeds; the Room appears in Recent (including "(no channel)" entries)
- [ ] *Rooms* section lists pointers with **copy link**; opening one uses the pointer's `server`
- [ ] **Add pointer to channel** available inside a pointerless Room once the user can write
- [ ] Default server URL configurable in the Room adapter's settings; `#room:<id>` uses it
