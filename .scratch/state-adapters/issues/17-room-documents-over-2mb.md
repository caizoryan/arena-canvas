# 17: Room documents over 2 MB

**What to build:** Busy Rooms keep growing (full history is kept), so the room server's storage adapter splits any stored value across multiple entries below the Durable Object 2 MB per-value limit and reassembles it on load, transparently to automerge-repo.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Values larger than the limit are written as chunks and loaded back byte-identical
- [ ] Range load and range remove handle chunked values
- [ ] DO test with a document well over 2 MB round-trips through save/load and a simulated restart
