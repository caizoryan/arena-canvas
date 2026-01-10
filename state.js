import { reactive, memo } from "./chowk.js"
import { get_channel } from './arena.js'
import { notificationpopup } from './notification.js'

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

let stringify = JSON.stringify
let createStore = (internal) => {
	let undo = []
	let redo = []

	let canUndo = () => undo.length > 0
	let doUndo = () => {
		tracking = false
		let action = undo.pop()
		if (action) apply(...action)
		tracking = true
	}

	let tracking = true
	let subscriptions = new Map()
	let apply = (location, action, value) => {
		let ref = getref(location, internal)
		if (action == 'push') {
			ref.push(value)
			if (tracking) undo.push([[...location], 'pop'])
			redo.push([[...location], 'pop'])
		}
		else if (action == 'pop') {
			let removed = ref.pop()
			if (tracking) undo.push([[...location], 'push', removed])
			redo.push([[...location], 'push', removed])
		}
		else if (action == 'insert') {
			ref.splice(value[0], 0, value[1])
			if (tracking) undo.push([[...location], 'remove', [value[0], 1]])
			redo.push([[...location], 'remove', [value[0], 1]])
		}
		else if (action == 'set') {
			let old = ref[value[0]]
			ref[value[0]] = value[1]
			if (tracking) undo.push([[...location], 'set', [value[0], old]])
			else redo.push([[...location], 'set', [value[0], old]])
		}
		else if (action == 'log') {
			console.log(ref)
		}
		else if (action == 'remove') {
			// TODO: Make also work for objects (delete property)
			let [removed] = ref.splice(value[0], value[1])
			if (tracking) undo.push([[...location], 'insert', [value[0], removed]])
			else redo.push([[...location], 'insert', [value[0], removed]])
		}

		// somehow make this nestable?
		// ['key', 'another'] subscription
		// should also notify ['key'] subscription
		// should notify parent basically
		let subscribers = subscriptions.get(stringify(location))
		if (subscribers) {subscribers.forEach(fn => fn(ref))}
	}

	let get = location => getref(location, internal)
	let subscribe = (location, fn) => {
		// somehow make this nestable?
		// ['key', 'another'] subscription
		// should also notify ['key'] subscription
		// should notify parent basically
		let key = stringify(location)
		let is = subscriptions.get(key)
		if (is) is.push(fn)
		else subscriptions.set(key, [fn])
		return () => {
			let fns = subscriptions.get(key)
			let index = fns.find(e => e == fn)
			if (index!=-1) fns.splice(index, 1)
		}
	}

	let getref = (address, arr) => {
		let copy = [...address]
		let index = copy.shift()
		if (copy.length == 0) return arr[index]
		return getref(copy, arr[index])
	}
	return {apply, tr: apply, get, subscribe, doUndo, canUndo}
}

let store = createStore({data: {nodes:[], edges: []}, nodeHash: {}})

let NODES = ['data', 'nodes']
let NODEHASH = ['data', 'nodeHash']
let NODEAT = i => NODES.concat([i])
let updateNodeHash = () => {
	let hash = store.get(NODES)
			.reduce((acc, n, i) => (acc[n.id] = NODEAT(i), acc), {})

	console.log('updating hash', hash)
	store.tr(['data'], 'set', ['nodeHash', hash])
}
let setNodes = (nodes) => store.tr(NODES, 'set', nodes)
let addNode = (node) => store.tr(NODES, 'push', node)

store.subscribe(NODES, updateNodeHash)

addNode({id : 'dawg'})
addNode({id : 'fawg'})
store.tr(NODES, 'insert', [0, {id: "BIRD?"}])


// TODO: when block is reorganzied this addressh becomes invalid...
// Block will need to remove subs and resub
// or need to add a way to change sub location? relocate
let getNodeLocation = id => store.get(NODEHASH)[id]

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


export let try_set_channel = slugOrURL => {
	// TODO: Add more safety here?
	let isUrl = slugOrURL.includes("are.na/");
	if (isUrl) {
		let slug = slugOrURL.split('/').filter(e => e != '').pop()
		set_channel(slug)
	}
	else {
		set_channel(slugOrURL.trim())
	}
}

let set_channel = slug => {
	notificationpopup("Loading " + slug + "...")
	get_channel(slug)
		.then((res) => {
			if (!res.data) {
				console.log("Failed to get channel", res.error)
				notificationpopup(['span', 'Failed to get channel ' + slug, ' try refreshing or opening another channel'], true)
			}

			else {
				notificationpopup('Loaded Channel: ' + slug)
				notificationpopup('Total Blocks: ' + res.data.length)

				state.current_slug = slug
				console.log(res.data)
				// addToRecents(slug)
				// setSlug(slug)
				// localStorage.setItem('slug', slug)
				// renderBlocks(res.data)
			}
		})
}

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
