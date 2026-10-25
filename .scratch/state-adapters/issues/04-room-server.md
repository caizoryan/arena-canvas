# 04: Room server

**What to build:** The Cloudflare Worker and `Room` Durable Object (one instance per room, ADR 0001) that host Rooms, living in its own directory of this repo with its own dependencies. The Worker routes `/room/<roomId>` (room id = Automerge document id, ADR 0004) to `idFromName(roomId)`. The DO runs a server-side automerge-repo `Repo` with a hibernatable-WebSocket network adapter and an async-storage adapter, and fans presence messages out itself (ADR 0006). See spec: "Room server", "Local development"; prior art: `prototype/room-sync` branch.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Network adapter speaks automerge-repo's websocket protocol (CBOR `join` → `peer`), stores `{peerId, peerMetadata}` in socket attachments, and uses the WebSocket Hibernation API
- [x] After the DO is rebuilt (hibernation), existing sockets are re-adopted from attachments and keep syncing without reconnecting
- [x] Messages whose `senderId` isn't the peer that joined on that socket are dropped
- [x] Storage adapter uses the async DO storage API (get/put/delete/list by prefix); `saveDebounceRate` ≈ 2000 ms
- [x] Presence messages (separate message type) are fanned out to every *other* socket, never echoed to the sender, never stored
- [x] DO test suite in Node with a fake `ctx` covers handshake, sender check, re-adoption, debounced persistence, presence fan-out
- [ ] Local dev works on macOS < 13.5 via the pinned wrangler 3.78.8 setup (compat date 2024-09-09, local-only `FinalizationRegistry` stub); a dev Worker can be deployed with current wrangler

## Comments

- Lives in `room-server/` (own `package.json`, `wrangler.toml`, `wrangler.local.toml`). `npm test` runs the DO tests: a real `ws` server and the real automerge-repo browser client adapter talking to the Room over a fake `ctx`.
- Presence protocol (for ticket 09): text frames. Send `{"type":"presence","presence":…}`; others get `{"type":"presence","peerId","presence"}` and `{"type":"presence-left","peerId"}` when a socket closes.
- The `Room` is a plain class, not `extends DurableObject`, so Node can construct it.
- **Local dev is unchecked:** the pinned wrangler 3.78.8 setup is written and all three configs bundle with `wrangler deploy --dry-run`, but `npm run dev:local` hasn't been run. The disk was too full to download workerd. The `FinalizationRegistry` stub replaces the global outright: wasm-bindgen already guards against it being undefined, and another dependency constructs one without a guard.
- Not deployed: `npm run deploy:dev` needs the maintainer's Cloudflare login.
- No `package-lock.json` yet; `npm install` in `room-server/` will create one.
