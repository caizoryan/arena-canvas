import {state} from './state.js'
import { notificationpopup } from './notification.js';

let host = "https://api.are.na/v2/"
let host3="https://api.are.na/v3/" 

let headers = () => ({
	"Content-Type": "application/json",
	Authorization: "Bearer " + state.authKey,
})

export const update_block = async (block_id, body) => {
	return fetch(host3 + `blocks/${block_id}`, {
		headers: headers(),
		method: "PUT",
		body: JSON.stringify(body),
	}).then((res) => {
		return res
	});
};

export const add_block = async (slug, title, content) => {
	console.log("adding", title, "to", slug, content)
	return fetch(host3 + "blocks", {
		headers: headers(),
		method: "POST",
		body: JSON.stringify({
			value: content,
			channel_ids : [slug],
			title,
			// insert_at: 4
		}),
	})
		.then((response) =>{
			console.log(response)
			console.log(response.status)
			let msg = response.status == '401' ? "Unauthorized" : response.status
			if (!response.ok) notificationpopup("Couldn't Make Block: " + msg, true)
			return response.json()
	})
};
export const add_link = async (slug, url) => add_block(slug, '', url)

const contentTypeForFile = (file) => {
	if (file.type) return file.type;

	let extension = file.name.split(".").pop().toLowerCase();
	return {
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		png: "image/png",
		gif: "image/gif",
		mp4: "video/mp4",
		mp3: "audio/mpeg",
		pdf: "application/pdf",
	}[extension] || "application/octet-stream";
};

export const upload_file = async (file) => {
	let contentType = contentTypeForFile(file);
	let presignResponse = await fetch(host3 + "uploads/presign", {
		method: "POST",
		headers: headers(),
		body: JSON.stringify({
			files: [{
				filename: file.name,
				content_type: contentType,
			}],
		}),
	});

	if (!presignResponse.ok) {
		let error = await presignResponse.json();
		throw new Error(
			`Failed to get presigned URL: ${error.error || "Unknown error"}`,
		);
	}

	let presignData = await presignResponse.json();
	let presignedFile = presignData.files[0];
	let uploadResponse = await fetch(presignedFile.upload_url, {
		method: "PUT",
		headers: { "Content-Type": presignedFile.content_type },
		body: await file.arrayBuffer(),
	});

	if (!uploadResponse.ok) {
		throw new Error(`Failed to upload file: ${uploadResponse.statusText}`);
	}

	return presignedFile.upload_url.split("?")[0];
};

export const add_file = async (slug, file) => {
	let fileUrl = await upload_file(file);
	return add_block(slug, file.name, fileUrl);
};

// Keep the old names available for callers that still upload images.
export const upload_image = upload_file;
export const add_image = add_file;

export const get_block = async (block_id) => {
	return fetch(host3 + `blocks/${block_id}`, { headers: headers() })
		.then(async (res) => {
			if (!res.ok) {
				console.log("Failed to get block:", block_id, res.status);
				return undefined;
			}
			let block = await res.json();
			return block.data || block;
		})
		.catch((error) => {
			console.log("Failed to get block:", block_id, error);
			return undefined;
		});
};

export const connect_block = async (slug, id, connectable_type = 'Block') => {
	let connectableId = Number(id);
	if (!Number.isInteger(connectableId)) {
		throw new Error(`Invalid ${connectable_type.toLowerCase()} id: ${id}`);
	}

	let response = await fetch(host3 + "connections", {
		headers: headers(),
		method: "POST",
		body: JSON.stringify({
			connectable_id: connectableId,
			connectable_type,
			channels: [{ id: slug }],
		}),
	});
	let body = await response.json();

	if (!response.ok) {
		let message = body?.details?.message || body?.error || response.status;
		throw new Error(`Couldn't connect block: ${message}`);
	}

	return body;
}

export const me = async () => {
	return fetch(host3 + `me`, {headers: headers()}).then((res) => res);
};
export const get_channel = async (slug) => {
	return fetch(host3 + "channels/" + encodeURIComponent(slug), { headers: headers() })
		.then(async (res) => {
			if (!res.ok) return undefined;
			let json = await res.json();
			return json.data || json;
		})
		.catch(() => undefined);
};

export const get_channel_contents = async (slug, page = 1, per = 100) => {
	return fetch(host3 + "channels/" + encodeURIComponent(slug) + `/contents?per=${per}&page=${page}&sort=position_desc`, { headers:headers() })
		.then(async (res) => {
			if (res.status != 200) {
				console.log(res.status)
				console.log(res)
				// notificationpopup("Failed to Get Channel: " + slug + " Status: "+res.status, true)
				return {error: "STATUS: " + res.status}
			}
			notificationpopup('Recieved Page ' + page + ' of ' + slug)
			let json = await res.json()
			if (json.meta?.has_more_pages && per >= 100) {
				let nextPage = json.meta.next_page
				if (nextPage <= 5) {
					await get_channel_contents(slug, nextPage, per).then((res) => {
						if (Array.isArray(res?.data)) json.data = json.data.concat(res.data);
					});
				}
			}

			notificationpopup('Loaded '+json.data.length+ ' blocks' )

			return json
		})
}
export let try_auth = () => {
	me()
		.then(res=>{
			if (res.status == 200) {
				res.json().then(m => {
					Object.assign(state.me, m)
					state.authSlug.next(m.slug)
					notificationpopup('Authenticated as: ' + m.slug)
				})
			}
			else {
				console.log("Auth failed: ", res.status, res)
				notificationpopup("Auth failed: " + res.status, true)
			}
		})
}


