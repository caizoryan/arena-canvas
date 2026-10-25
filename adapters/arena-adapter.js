// The core state adapter: the Are.na API module as-is, plus saving the
// default canvas as a `.canvas` block in the open channel. Takes the API
// module and a getter for the open channel's slug so it has no app imports.
export const createArenaAdapter = (api, { getSlug }) => {
	// The `.canvas` block last seen in each channel's contents. Previews of
	// other channels load contents too, so saving looks up the open slug.
	let canvasBlocks = new Map();

	let get_channel_contents = async (slug, ...rest) => {
		let res = await api.get_channel_contents(slug, ...rest);
		if (Array.isArray(res?.data)) {
			canvasBlocks.set(slug, res.data.find((block) => block.title == ".canvas"));
		}
		return res;
	};

	let saveCanvas = async (data) => {
		let slug = getSlug();
		let content = JSON.stringify(data);
		let canvas = canvasBlocks.get(slug);

		if (canvas?.id) {
			let description =
				`This block was made using [Are.na Canvas](http://canvas.a-p.space). You can view this channel as a canvas [here](http://canvas.a-p.space/#${slug})`;
			let res = await api.update_block(canvas.id, {
				content,
				title: ".canvas",
				description,
			});
			if (res.ok) return { ok: true, created: false, block: canvas };
			if (res.status == 404) {
				canvasBlocks.delete(slug);
				return saveCanvas(data);
			}
			return { ok: false, status: res.status };
		}

		let block = await api.add_block(slug, ".canvas", content);
		if (!block?.id) return { ok: false };
		canvasBlocks.set(slug, block);
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
		update_block: passThrough("update_block"),
		connect_block: passThrough("connect_block"),
		upload_file: passThrough("upload_file"),
		upload_image: passThrough("upload_image"),
		me: passThrough("me"),
		saveCanvas,
		// Are.na has no push channel; changes made elsewhere arrive on reload.
		subscribe: () => () => {},
	};
};
