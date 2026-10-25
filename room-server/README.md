# Room server

The Cloudflare Worker and `Room` Durable Object that host Rooms. One instance
per room (ADR 0001): the Worker routes `/room/<roomId>` WebSocket upgrades to
`idFromName(roomId)`, where the room id is the Automerge document id (ADR 0004).
This directory has its own dependencies; the static app has none.

- `src/index.js`: Worker routing.
- `src/room.js`: the Durable Object. It runs a server-side automerge-repo `Repo`,
  saves at most every ~2 s, and fans out presence.
- `src/network-adapter.js`: automerge-repo's WebSocket protocol (CBOR `join` →
  `peer`) over hibernatable sockets. Each socket's attachment holds
  `{ peerId, peerMetadata }`. A rebuilt instance re-adopts sockets from their
  attachments, and a socket may only speak as the peer that joined on it.
- `src/storage-adapter.js`: automerge-repo storage over the async DO storage API.

## Wire protocol

- **Binary frames:** automerge-repo messages, CBOR encoded.
- **Text frames:** presence (ADR 0006).
  - A client sends `{"type":"presence","presence":{…}}`.
  - Every *other* joined socket receives `{"type":"presence","peerId":"<sender>","presence":{…}}`.
  - When a socket closes, the others receive `{"type":"presence-left","peerId":"<peer>"}`.
  - Presence is never stored, and a socket that hasn't joined can't send it.

## Commands

```bash
npm install
npm test             # Node tests with a fake ctx
npm run deploy:dev   # throwaway dev Worker, current wrangler
npm run deploy       # production
```

### Local development on macOS < 13.5

Current wrangler needs macOS 13.5+. On older systems:

```bash
npm run dev:local    # wrangler 3.78.8 with wrangler.local.toml
```

That setup:
- runs workerd 2024-09-09, the last build for macOS 11.5+, with `compatibility_date = "2024-09-09"`;
- uses key-value DO storage, which works because the Room only uses the async storage API;
- has no `[assets]` (the static app is served separately, as in production);
- enters through `src/local.js`, which installs a no-op `FinalizationRegistry` before Automerge loads. That leaks WASM memory, which is acceptable in dev only.

The local runtime is two years behind production, so do final checks on the
deployed dev Worker.
