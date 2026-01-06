import { reactive, memo } from "./chowk.js"
import { dom } from "./dom.js"
import { authslug, meData } from "./data.js"
import { try_set_channel } from "./script.js"
import { setAuth, auth, try_auth } from "./arena.js"

let query = ""
export let recentSlugs = reactive([])
export let sidebarOpen = reactive(false)

let s = localStorage.getItem('recent-slugs')
if (s) { recentSlugs.next(JSON.parse(s)) }

export let addToRecents = (slug) => {
	console.log("CALLED")
	let recents = localStorage.getItem('recent-slugs')
	console.log("recents", recents)
	if (!recents) {
		recents = [slug]
		localStorage.setItem('recent-slugs', JSON.stringify(recents))
		recentSlugs.next(recents)
	}

	else {
		recents = JSON.parse(recents)
		recents.unshift(slug)
		recents = Array.from(new Set(recents))
		if (recents.length > 10) { recents = recents.slice(0, 10) }
		localStorage.setItem('recent-slugs', JSON.stringify(recents))
		recentSlugs.next(recents)
	}

}

let searchBar = dom(["input", {
	placeholder: 'Enter Slug or URL',
	oninput: (e) => query = e.target.value,
	onkeydown: e => e.key == "Enter" ? try_set_channel(query.trim()) : null
}])

export let focusSearchBar = () => searchBar.focus()
// slice from middle and put ... in there
let slicer = (str, size) => {
	let length = str.length
	if (length <= size) return str
	else {
		let toRemove = length - size

	}

}
let search = [".section.search", ["h4", "Channel"], searchBar,
	["button", { onclick: (e) => try_set_channel(query.trim()) }, "set"],
	['h5', 'Recently Visited'],
	memo(() => recentSlugs.value()
		.map(e => ['button.mr',
			{ onclick: () => try_set_channel(e) },
			e.slice(0, 18), e.length > 18 ? "..." : '']), [recentSlugs])
]

let logout = ['p', ['button', {
	onclick: () => {
		localStorage.setItem("auth", "")
		authslug.next("")
	}
}, 'logout']]

let authbar = memo(() =>
	authslug.value() == "" ?
		["div", ["input", {
			placeholder: 'Enter Token',
			oninput: (e) => setAuth(e.target.value.trim()),
			onkeydown: e => {
				if (e.key == "Enter") {
					localStorage.setItem("auth", auth.trim())
					try_auth()
				}
			}
		}],
			["button", {

				onclick: () => {
					localStorage.setItem("auth", auth.trim())
					try_auth()
				}

			}, "try"],
			['a', {href: 'https://arena-token-gen.vercel.app/'}, ['p', 'Get your token here']],
		] :
	['p', 
	 ['img.icon', {src: meData.avatar_image.thumb}],
	 ["p", authslug], logout]

	,[authslug])

let authenticate = [".section.auth", ["h4", "Authenticate"], authbar]

export let sidebar = [".sidebar", { open: sidebarOpen }, ["h2", "Canvas"], search, authenticate]
