import { reactive, memo } from "./chowk.js"

export let mouse = reactive({ x: 0, y: 0 })
export let canvasX = reactive(0)
export let canvasY = reactive(0)
export let canvasScale = reactive(1)

export let recent_slugs = reactive([])
let s = localStorage.getItem('recent-slugs')
if (s) { recent_slugs.next(JSON.parse(s)) }


export let state = {
	dotcanvas: undefined,
	current_slug: "are-na-canvas",
}

function load_local_storage() {
	let local_currentslug = localStorage.getItem("slug")
	if (local_currentslug) state.current_slug = local_currentslug

	let t = localStorage.getItem('transform')
	if (t){
		t = JSON.parse(t)
		canvasX.next(t.x)
		canvasY.next(t.y)
		canvasScale.next(t.scale)
	}
	else t = {x: 0, y: 0, scale: 1}
}

load_local_storage()


// export let addToRecents = (slug) => {
// 	let recents = localStorage.getItem('recent-slugs')
// 	if (!recents) {
// 		recents = [slug]
// 		localStorage.setItem('recent-slugs', JSON.stringify(recents))
// 		recent_slugs.next(recents)
// 	}

// 	else {
// 		recents = JSON.parse(recents)
// 		recents.unshift(slug)
// 		recents = Array.from(new Set(recents))
// 		if (recents.length > 10) { recents = recents.slice(0, 10) }
// 		localStorage.setItem('recent-slugs', JSON.stringify(recents))
// 		recent_slugs.next(recents)
// 	}

// }
