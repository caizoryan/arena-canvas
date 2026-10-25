# 03: Named canvases

**What to build:** A channel can hold the **default canvas** (`.canvas`) plus any number of named canvases (`.canvas:<name>`). Users open them via `#<slug>/<canvas name>`, and manage them from a new *Canvases* section in the sidebar. Every channel block still appears on every canvas (auto-placed if new). See spec: "Domain and storage in channels", "Routing", "Sidebar".

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `#<slug>` opens the default canvas exactly as today; `#<slug>/<name>` opens the named canvas
- [ ] Loading selects the requested canvas block explicitly (no "first `.canvas` wins")
- [ ] `.canvas`, `.canvas:<name>` and `.room:<name>` blocks never render as blocks
- [ ] Sidebar lists the channel's canvases; **+ New canvas** creates `.canvas:<name>` with blocks auto-placed; **rename** changes the title; **delete** disconnects it from the channel; the default canvas cannot be deleted
- [ ] Switching canvases with unsaved changes shows the existing Save/Discard prompt
- [ ] Hash parsing treats `<prefix>:<id>` as an adapter route and anything else as `slug[/name]` (a channel named `room` still opens at `#room`)
