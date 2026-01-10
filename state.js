import { reactive, memo } from "./chowk.js"
import { get_channel } from './arena.js'
import { notificationpopup } from './notification.js'
import { BlockElement, mountContainer } from "./script.js"
import { Keymanager } from "./keymanager.js"

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
	let canRedo = () =>redo.length > 0
	let doUndo = () => {
		tracking = 'redo'
		let action = undo.pop()
		if (action) apply(...action)
		tracking = 'undo'
	}
	let doRedo = () => {
		tracking = 'undo'
		let action = redo.pop()
		if (action) apply(...action)
		tracking = 'redo'
	}

	let recordInverse = (action) => {
		if (tracking == 'undo') undo.push(action)
		else if (tracking == 'redo')redo.push(action)
	}

	let tracking = 'undo'

	let pauseTracking = () => tracking = 'paused'
	let resumeTracking = () => tracking = 'undo'

	let subscriptions = new Map()
	let apply = (location, action, value) => {
		let ref = getref(location, internal)
		if (action == 'push') {
			ref.push(value)
			recordInverse([[...location], 'pop'])
		}
		else if (action == 'pop') {
			let removed = ref.pop()
			recordInverse([[...location], 'push', removed])
		}
		else if (action == 'insert') {
			ref.splice(value[0], 0, value[1])
			recordInverse([[...location], 'remove', [value[0], 1]])
		}
		else if (action == 'set') {
			let old = ref[value[0]]
			ref[value[0]] = value[1]

			let loc = location.concat([value[0]])
			let subscribers = subscriptions.get(stringify(loc))
			if (subscribers) {subscribers.forEach(fn => fn(ref))}

			recordInverse([[...location], 'set', [value[0], old]])
		}
		else if (action == 'log') {
			console.log(ref)
		}
		else if (action == 'remove') {
			// TODO: Make also work for objects (delete property)
			let [removed] = ref.splice(value[0], value[1])
			recordInverse([[...location], 'insert', [value[0], removed]])
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
	return {apply, tr: apply, get, subscribe,
					doUndo, canUndo, doRedo, canRedo, pauseTracking, resumeTracking}
}

export let store = createStore({data: {nodes:[], edges: []}, nodeHash: {}})

// ~~~~~~~~~~~
// STORE UTILS
// ~~~~~~~~~~~
let NODES = ['data', 'nodes']
let NODEHASH = ['data', 'nodeHash']
let NODEAT = i => NODES.concat([i])
let updateNodeHash = () => {
	let oldHash = store.get(NODEHASH)
	let hash = store.get(NODES)
			.reduce((acc, n, i) => (acc[n.id] = NODEAT(i), acc), {})

	// Object.entries(oldHash).forEach(([key, value]) => {
	// 	if (!idSubscriptions[key]) return

	// 	if (!hash[key]) {
	// 		console.log("REMOVE THIS SUB FN")
	// 		let {remove, fn} = idSubscriptions[key]
	// 		// TODO: FIgure this out
	// 		// remove()
	// 		// subscribeToId()
			
	// 	}
	// 	if (stringify(value) != stringify(hash[key])) {
	// 		console.log("RELOCATE SUBSCRIPTION")
	// 	}
	// })

	store.tr(['data'], 'set', ['nodeHash', hash])
	console.log(store.get(NODEHASH))
}
let idSubscriptions = {}
export let subscribeToId = (id, location, fn) => {
	let l = getNodeLocation(id)
	console.log("SUBS?", l.concat(location))
	let remove = store.subscribe(l.concat(location), fn)
	// will figure this out later
	idSubscriptions[id] = {remove, fn, location}
	// will manage subscriptions for id
	// whenever hash changes, resubscribe to new location
	// basically proxy a subscription and whenver hash changes internally update
}
export let setNodes = (nodes) =>{
	store.tr(['data'], 'set', ['nodes', nodes])
	updateNodeHash()
} 

export let addNode = (node) => store.tr(NODES, 'push', node)

// TODO: when block is reorganzied this addressh becomes invalid...
// Block will need to remove subs and resub
// or need to add a way to change sub location? relocate
export let getNodeLocation = id => store.get(NODEHASH)[id]

store.subscribe(NODES, updateNodeHash)

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

				let nodes =res.data.map(constructBlockData)
				setNodes(nodes)
				mountContainer(nodes.map(BlockElement))
				// addToRecents(slug)
				// setSlug(slug)
				// localStorage.setItem('slug', slug)
				// renderBlocks(res.data)
			}
		})
}
let constructBlockData = (e, i) => {
	let d = {
		id: e.id,
		width: 300,
		height: 300,
		color: '1'
	}
	if (typeof i == 'number') {
		d.x = (i % 8) * 400 
		d.y = (Math.floor(i / 8)) * 450 
	}
	else {
		d.x = i.x
		d.y = i.y
		d.width = i.width
		d.height = i.height
	}

	if (e.type == "Text") {
		d.type = 'text'
		d.text = e.content.markdown
	}

	else if (e.type == "Image") {
		d.type = 'link'
		d.url = e.image.large.src
	}

	else if (e.type == "Link") {
		d.type = 'link'
		d.url = e.source.url
	}

	else if (e.type == "Attachment") {
		d.type = 'link'
		d.url = e.attachment.url
	}

	else if (e.type == "Embed") {
		d.type = 'link'
		d.url = e.source.url
	}

	else {
		d.type = 'text'
		d.text = ''
	}

	return d
}

let keys = new Keymanager()

let UndoRedo = (e) => {
	if (e.shiftKey && store.canRedo()) store.doRedo()
	else if (store.canUndo()) store.doUndo()
}

keys.on('cmd+z', UndoRedo, {preventDefault: true})

document.onkeydown = e => keys.event(e)
