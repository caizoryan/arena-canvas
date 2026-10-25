// automerge-repo storage over the Durable Object's async storage API
// (get/put/delete/list by prefix). The async API rather than the sync `kv`
// one, so the same code runs on the older local runtime. Storage keys are
// automerge-repo key paths joined with "/".
//
// Each value must stay under the 2 MB per-value limit; chunking larger
// documents is ticket 17.
export class DurableObjectStorageAdapter {
	constructor(storage) {
		this.storage = storage;
	}

	key(path) {
		return path.join("/");
	}

	async load(path) {
		return this.storage.get(this.key(path));
	}

	async save(path, data) {
		await this.storage.put(this.key(path), data);
	}

	async remove(path) {
		await this.storage.delete(this.key(path));
	}

	async loadRange(prefix) {
		let entries = await this.storage.list({ prefix: this.key(prefix) });
		return [...entries].map(([key, data]) => ({ key: key.split("/"), data }));
	}

	async removeRange(prefix) {
		let entries = await this.storage.list({ prefix: this.key(prefix) });
		for (let key of entries.keys()) await this.storage.delete(key);
	}
}
