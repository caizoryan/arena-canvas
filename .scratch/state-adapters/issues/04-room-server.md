# 04: Room server

**What to build:** The Cloudflare Worker and `Room` Durable Object (one instance per room, ADR 0001) that host Rooms, living in its own directory of this repo with its own dependencies. The Worker routes `/room/<roomId>` (room id = Automerge document id, ADR 0004) to `idFromName(roomId)`. The DO runs a server-side automerge-repo `Repo` with a hibernatable-WebSocket network adapter and an async-storage adapter, and fans presence messages out itself (ADR 0006). See spec: "Room server", "Local development"; prior art: `prototype/room-sync` branch.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Network adapter speaks automerge-repo's websocket protocol (CBOR `join` → `peer`), stores `{peerId, peerMetadata}` in socket attachments, and uses the WebSocket Hibernation API
- [ ] After the DO is rebuilt (hibernation), existing sockets are re-adopted from attachments and keep syncing without reconnecting
- [ ] Messages whose `senderId` isn't the peer that joined on that socket are dropped
- [ ] Storage adapter uses the async DO storage API (get/put/delete/list by prefix); `saveDebounceRate` ≈ 2000 ms
- [ ] Presence messages (separate message type) are fanned out to every *other* socket, never echoed to the sender, never stored
- [ ] DO test suite in Node with a fake `ctx` covers handshake, sender check, re-adoption, debounced persistence, presence fan-out
- [ ] Local dev works on macOS < 13.5 via the pinned wrangler 3.78.8 setup (compat date 2024-09-09, local-only `FinalizationRegistry` stub); a dev Worker can be deployed with current wrangler
