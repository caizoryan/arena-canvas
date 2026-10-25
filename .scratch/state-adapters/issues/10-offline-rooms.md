# 10: Offline Rooms

**What to build:** Rooms are cached in the browser (IndexedDB) so a visited Room reopens and stays editable offline; changes merge when the connection returns, with an indicator showing the state.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] A Room visited before reloads with no network
- [ ] Edits made offline sync after reconnect, including after a reload while offline
- [ ] Indicator shows "offline — changes will sync" vs online
- [ ] Settings offer clearing the local Room cache
