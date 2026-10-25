# One Durable Object instance per Room

Rooms are hosted on Cloudflare Durable Objects. A single Worker routes each request to the instance for that room (`idFromName(roomId)`), so every Room has its own instance, storage, WebSocket fan-out and in-memory Automerge document. We chose this over one instance holding many Rooms because a shared instance serialises all rooms' traffic through one single-threaded object, while instances are unlimited even on the Workers Free plan.

## Consequences

- There is no central index of Rooms on the server; anything that needs to list Rooms (e.g. the sidebar) must find them elsewhere, such as pointers in a channel.
- On the Free plan the binding limit is 100k SQLite row writes per day across all Rooms, so a Room must persist its document in batched/compacted writes, not once per sync message. WebSockets should use the Hibernation API to avoid duration charges for idle rooms.
