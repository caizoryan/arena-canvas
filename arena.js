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
			title
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

const connect_block = async (slug, id, connectable_type = 'Block') => {
	return fetch(host+"channels/"+slug+"/connections", {
		headers: headers(),
		method: "POST",
		body: JSON.stringify({connectable_type, connectable_id : id})
	})
	.then((res) => res.json())
}

export const me = async () => {
	return fetch(host3 + `me`, {headers: headers()}).then((res) => res);
};
export const get_channel = async (slug, page = 1) => {
	return fetch(host3 + "channels/" + slug + `/contents?per=100&page=${page}&sort=position_desc`, { headers:headers() })
		.then(async (res) => {
			if (res.status != 200) {
				console.log(res.status)
				console.log(res)
				// notificationpopup("Failed to Get Channel: " + slug + " Status: "+res.status, true)
				return {error: "STATUS: " + res.status}
			}
			notificationpopup('Recieved Page ' + page + ' of ' + slug)
			let json = await res.json()
			if (json.meta.has_more_pages) {
				let nextPage = json.meta.next_page
				if (nextPage <= 5) await get_channel(slug, nextPage).then(res => json.data = json.data.concat(res.data))
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


