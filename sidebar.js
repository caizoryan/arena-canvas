import { reactive, memo } from "./hok.js"
import { dom } from "./dom.js"
import {authslug} from "./data.js"
import {try_set_channel} from "./script.js"
import {setAuth, auth, try_auth} from "./arena.js"

let query = ""
export let sidebarOpen = reactive(false)
let searchBar = dom(["input", {
	placeholder: 'Enter Slug or URL',
	oninput: (e) => query = e.target.value,
	onkeydown : e => e.key == "Enter" ? try_set_channel(query.trim()) : null }])
export let focusSearchBar = () => searchBar.focus()
let search = [".section.search", ["h4", "Channel"], searchBar,
							["button", {onclick: (e) => try_set_channel(query.trim())}, "set"]]

let logout = ['p', ['button', {onclick: () => {
	localStorage.setItem("auth", "")
	authslug.next("")
}}, 'logout']]

let authbar = memo(() => 
	authslug.value() == "" ?
		["div", ["input", { oninput: (e) => setAuth(e.target.value.trim()) }],
		["button", {

		onclick: () => {
			localStorage.setItem("auth", auth.trim())
			try_auth()
		}

		}, "try"]]:
	["p", "Authenticated as: ", ["span.auth", authslug], logout]
, [authslug])

let authenticate = [".section.auth", ["h4", "Authenticate"], authbar]

export let sidebar = [".sidebar", { open: sidebarOpen }, ["h2",  "Canvas"], search, authenticate]
