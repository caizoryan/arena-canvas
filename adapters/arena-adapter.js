import { canvasNameOf, canvasTitle } from "../canvases.js";

// The core state adapter: the Are.na API module as-is, plus saving the open
// canvas (default `.canvas` or named `.canvas:<name>`) in the open channel.
// Takes the API module and getters for the open channel and canvas name so
// it has no app imports.
export const createArenaAdapter = (api, { getSlug, getCanvasName = () => "" }) => {
	// Per channel, from its last loaded contents: canvas blocks by title, and
	// the connection id of each block (needed to disconnect it). Previews of
	// other channels load contents too, so lookups go through the open slug.
	let channels = new Map();
	// Canvas blocks this adapter created or renamed, by id. Channel contents
	// can lag behind writes, so these titles win over what contents report.
	let knownTitles = new Map();

	let channel = (slug) => {
		if (!channels.has(slug)) {
			channels.set(slug, { canvases: new Map(), connections: new Map() });
		}
		return channels.get(slug);
	};

	let get_channel_contents = async (slug, ...rest) => {
		let res = await api.get_channel_contents(slug, ...rest);
		if (!Array.isArray(res?.data)) return res;

		let indexed = { canvases: new Map(), connections: new Map() };
		res.data.forEach((block) => {
			if (block.connection?.id) {
				indexed.connections.set(String(block.id), block.connection.id);
			}
			let title = knownTitles.get(block.id) ?? block.title;
			if (canvasNameOf(title) !== undefined && !indexed.canvases.has(title)) {
				indexed.canvases.set(title, block);
			}
		});
		// Keep canvases we just wrote that the contents don't list yet.
		let previous = channels.get(slug);
		previous?.canvases.forEach((block, title) => {
			if (knownTitles.get(block.id) == title && !indexed.canvases.has(title)) {
				indexed.canvases.set(title, block);
			}
		});
		channels.set(slug, indexed);
		return res;
	};

	let update_block = async (block_id, body) => {
		let res = await api.update_block(block_id, body);
		if (res.ok && canvasNameOf(body?.title) !== undefined) {
			knownTitles.set(block_id, body.title);
			channels.forEach(({ canvases }) => {
				canvases.forEach((block, title) => {
					if (block.id != block_id || title == body.title) return;
					canvases.delete(title);
					canvases.set(body.title, block);
				});
			});
		}
		return res;
	};

	let disconnect_block = async (slug, block_id) => {
		let connection = channel(slug).connections.get(String(block_id));
		if (!connection) {
			await get_channel_contents(slug);
			connection = channel(slug).connections.get(String(block_id));
		}
		if (!connection) return { ok: false, status: 404 };

		let res = await api.disconnect_connection(connection);
		if (!res.ok) return { ok: false, status: res.status };

		let { canvases, connections } = channel(slug);
		connections.delete(String(block_id));
		canvases.forEach((block, title) => {
			if (block.id == block_id) canvases.delete(title);
		});
		knownTitles.delete(block_id);
		return { ok: true };
	};

	let saveCanvas = async (data) => {
		let slug = getSlug();
		let name = getCanvasName();
		let title = canvasTitle(name);
		let content = JSON.stringify(data);
		let { canvases } = channel(slug);
		let canvas = canvases.get(title);

		if (canvas?.id) {
			let route = slug + (name ? "/" + encodeURIComponent(name) : "");
			let description =
				`This block was made using [Are.na Canvas](http://canvas.a-p.space). You can view this channel as a canvas [here](http://canvas.a-p.space/#${route})`;
			let res = await api.update_block(canvas.id, {
				content,
				title,
				description,
			});
			if (res.ok) return { ok: true, created: false, block: canvas };
			if (res.status == 404) {
				canvases.delete(title);
				knownTitles.delete(canvas.id);
				return saveCanvas(data);
			}
			return { ok: false, status: res.status };
		}

		let block = await api.add_block(slug, title, content);
		if (!block?.id) return { ok: false };
		canvases.set(title, block);
		knownTitles.set(block.id, title);
		return { ok: true, created: true, block };
	};

	// Look operations up on call: the adapter is created while arena.js may
	// still be initialising in the app's circular import graph.
	let passThrough = (name) => (...args) => api[name](...args);

	return {
		id: "arena",
		saveMode: "explicit",
		get_channel: passThrough("get_channel"),
		get_channel_contents,
		get_block: passThrough("get_block"),
		add_block: passThrough("add_block"),
		add_link: passThrough("add_link"),
		add_file: passThrough("add_file"),
		add_image: passThrough("add_image"),
		update_block,
		connect_block: passThrough("connect_block"),
		disconnect_block,
		disconnect_connection: passThrough("disconnect_connection"),
		upload_file: passThrough("upload_file"),
		upload_image: passThrough("upload_image"),
		me: passThrough("me"),
		saveCanvas,
		// Are.na has no push channel; changes made elsewhere arrive on reload.
		subscribe: () => () => {},
	};
};
