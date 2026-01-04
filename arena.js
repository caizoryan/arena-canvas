import {authslug} from './data.js'
import { notificationpopup } from './script.js';

let host = "https://api.are.na/v2/"
let host3="https://api.are.na/v3/channels/" 

let headers = () => ({
	"Content-Type": "application/json",
	Authorization: "Bearer " + auth,
})

export const update_block = async (block_id, body, slug, fuck = false) => {
	return fetch(host + `blocks/${block_id}`, {
		headers: headers(),
		method: "PUT",
		body: JSON.stringify(body),
	}).then((res) => {
		// if (fuck) { fuck_refresh(slug) }
		return res
	});
};
export const add_block = async (slug, title, content) => {
	console.log("adding", title, "to", slug, content)
	return fetch(host + "channels/" + slug + "/blocks", {
		headers: headers(),
		method: "POST",
		body: JSON.stringify({content: content}),
	})
		.then((response) =>{
			console.log(response)
			console.log(response.status)
			if (!response.ok) notificationpopup("Couldn't Make Block")
			return response.json()
	})
		.then((data) => {
			let block_id = data.id;
			// TODO: better way to do this
			if (title !== "") return update_block(block_id, { title }, slug);
			else return data
		});
};
export const me = async () => {
	return fetch(host + `me`, {headers: headers()}).then((res) => res);
};
export const get_channel = async (slug) => {
	return fetch(host3+ slug + "/contents?per=100&sort=position_desc", { headers:headers() })
		.then(res => {
			if (res.status != 200) {
				console.log(res.status)
				return {}
			}
			return res.json()
		})
}
export let try_auth = () => {
	me()
		.then(res=>{
			if (res.status == 200) {
				res.json().then(me => authslug.next(me.slug))
			}
			else {
				console.log("Auth failed: ", res.status, res)
			}
		})
}


let a = localStorage.getItem("auth")
export let auth = ''
export let setAuth = au => auth = au

if (a) {
	auth = a
	try_auth()
}
