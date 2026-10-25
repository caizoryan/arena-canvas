// The browser half of Rooms, bundled once into ../vendor/automerge/ by
// `npm run vendor` and committed, the way markdown-it/ and pdfjs/ are
// vendored. The static app imports it lazily when a Room opens. The WASM
// ships beside it as automerge.wasm (about 1.1 MB gzipped, against 1.7 MB if
// inlined as base64) and is loaded with initializeWasm(url).
export * from "@automerge/automerge-repo/slim";
export { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
export { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";
