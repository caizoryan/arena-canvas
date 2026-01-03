import { reactive, memo } from "./hok.js"
import {authslug} from "./data.js"
import {set_channel} from "./script.js"

let query = ""
export let sidebarOpen = reactive("false")
let search = [".section.search", ["h4", "search"],
							["input", { oninput: (e) => query = e.target.value,
													onkeydown : e => e.key == "Enter" ? set_channel(query) : null }],
							["button", {onclick: (e) => set_channel(query)}, "set"]]

let logout = ['button', {onclick: () => {
	localStorage.setItem("auth", "")
	authslug.next("")
}}]

let authbar = memo(() => 
	authslug.value() == "" ?
		["div", ["input", { oninput: (e) => auth = e.target.value.trim() }],
	["button", {
		onclick: (e) => {
			localStorage.setItem("auth", auth)
			try_auth()
		}
	}, "try"]]:
	["p", "Authenticated as: ", ["span.auth", authslug], logout]
, [authslug])

let authenticate = [".section.auth", ["h4", "Authenticate"], authbar]

export let sidebar = [".sidebar", { open: sidebarOpen }, ["h2",  "Canvas"], search, authenticate]
