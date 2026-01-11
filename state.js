import { dom } from "./dom.js"
import { reactive, memo } from "./chowk.js"
import { get_channel, try_auth } from './arena.js'
import { notificationpopup } from './notification.js'
import {  mountContainer } from "./script.js"
import { BlockElement, constructBlockData, GroupElement} from "./block.js"
import { createStore } from "./store.js"
import { svgrect } from "./svg.js"
import { dragTransforms } from "./dragOperations.js"
import { mountBoundingBox } from "./bigBoundingBox.js"

let stringify = JSON.stringify
export let mouse = reactive({ x: 0, y: 0 })

export let state = {
	authSlug: reactive(''),
	authKey: undefined,
	me: {},

	recentSlugs: reactive([]),
	sidebarOpen: reactive(false),
	currentSlug: reactive("are-na-canvas"),
	selected: reactive([]),

	canvasX : reactive(0),
	canvasY : reactive(0),
	canvasScale : reactive(1),

	dimensions: reactive(10000),
	holdingCanvas: reactive(false),
	canceled: reactive(false),

	trackpad_movement: true,
	last_history: [],
	dot_canvas: undefined,
	moving_timeout: undefined,
}

export let store = createStore({
	data: {nodes:[], edges: []},
	nodeHash: {}
})

// ~~~~~~~~~~~
// STORE UTILS
// ~~~~~~~~~~~
let NODES = ['data', 'nodes']
let NODEHASH = ['data', 'nodeHash']
let NODEAT = i => NODES.concat([i])
export let updateNodeHash = () => {
	let oldHash = store.get(NODEHASH)
	let hash = store.get(NODES)
			.reduce((acc, n, i) => (acc[n.id] = NODEAT(i), acc), {})

	if (oldHash){
		Object.entries(oldHash).forEach(([key, value]) => {
			if (!idSubscriptions[key]) return
			let {remove, fns, location} = idSubscriptions[key]

			if (!hash[key]) {
				remove()
				delete idSubscriptions[key]
			}

			else if (stringify(value) != stringify(hash[key])) {
				fns.forEach(fn => {
					idSubscriptions[key].remove = store.relocate(location, hash[key], fn)		
				})
				idSubscriptions[key].location = hash[key] 
			}
		})
	}

	store.tr(['data'], 'set', ['nodeHash', hash], false)
}
let idSubscriptions = {}

export let subscribeToId = (id, location, fn) => {
	let l = getNodeLocation(id)
	// TODO: Make removes...
	let remove = store.subscribe(l.concat(location), fn)
	if (idSubscriptions[id]) idSubscriptions[id].fns.push([fn])
	idSubscriptions[id] = {fns: [fn], location, remove}
}

export let setNodes = (nodes) => {
	store.tr(['data'], 'set', ['nodes', nodes], false)
	updateNodeHash()
} 

export let addNode = (node) =>{
	store.tr(NODES, 'push', node, false)
	updateNodeHash()
}

// TODO: when block is reorganzied this addressh becomes invalid...
// Block will need to remove subs and resub
// or need to add a way to change sub location? relocate
export let getNodeLocation = id => store.get(NODEHASH)[id]

// ~~~~~~~~~~~---------
// Initialize local storage
// ~~~~~~~~~~~---------
function load_local_storage() {
	// let local_currentslug = localStorage.getItem("slug")
	// if (local_currentslug) state.current_slug = local_currentslug

	let a = localStorage.getItem("auth")
	if (a) {
		state.authKey = a
		try_auth()
	}

	let s = localStorage.getItem('recent-slugs')
	if (s) { state.recentSlugs.next(JSON.parse(s)) }

	let t = localStorage.getItem('transform')
	if (t) {
		t = JSON.parse(t)
		state.canvasX.next(t.x)
		state.canvasY.next(t.y)
		state.canvasScale.next(t.scale)
	}

	else t = {x: 0, y: 0, scale: 1}
}
load_local_storage()

// ~~~~~~~~~~~---------
// Are.na Functions
// ~~~~~~~~~~~---------
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
				notificationpopup(['span', 'Failed to get channel ' + slug, ' try refreshing or opening another channel'], true)
			}

			else {
				notificationpopup('Loaded Channel: ' + slug)
				notificationpopup('Total Blocks: ' + res.data.length)

				state.currentSlug.next(slug)
				updateData(res.data)

				let blocks = processBlockForRendering(res.data)
				let groups = store.get(NODES).filter(e => e.type == 'group')
				let svg = svgBackground()

				mountContainer([
					svg,
					...groups.map(GroupElement),
					mountBoundingBox(),
					...blocks.map(BlockElement),
				])

				// addToRecents(slug)
				// setSlug(slug)
				// localStorage.setItem('slug', slug)
			}
		})
}

let dragMarker = dom(svgrect(
	dragTransforms.startX,
	dragTransforms.startY,
	dragTransforms.endX,
	dragTransforms.endY,

	memo(() =>
		(state.holdingCanvas.value() || state.canceled.value())
			? '#fff1'
			: '#0008',
		[state.holdingCanvas, state.canceled])
))

let svgBackground = () => {
	return ['svg', { width: state.dimensions, height: state.dimensions }, dragMarker]
}

let updateData = (blocks) => {
	state.dot_canvas = blocks.find(e => e.title == '.canvas')
	if (state.dot_canvas) {
		let parsed = JSON.parse(state.dot_canvas.content.plain)
		setNodes(parsed.nodes)
		store.tr(['data'], 'set', ['edges', parsed.edges])
		store.get(NODES).forEach(node => {
			if (node.type == 'text') {
				let f = blocks.find(e => e.id == node.id)
				if (f && f.type == 'Text') node.text = f.content.markdown
			}
		})

		// if data has blocks that aren't in blocks... remove them
		let updateHash = false
		store.get(NODES).forEach(node => {
			if (node.type == 'group') return
			let f
			if (node.id.toString().charAt(0) == 'c')
				f = blocks.find(e => 'c'+e.id == node.id)
			else f = blocks.find(e => e.id == node.id)
			if (!f) {
				console.log('removing')
				let i = store.get(NODES).findIndex(n => n == node)
				store.tr(NODES, 'remove', [i, 1])
				updateHash = true
			}
		})

		// will relocate
		if (updateHash) updateNodeHash()
	}
	else {
		console.log("DIDNT FIND DOT CANVAS")
		let nodes = blocks.filter(e => e.title != ".canvas")
				.map(constructBlockData)

		setNodes(nodes)
	}
}
let processBlockForRendering = (blocks) => {
	blocks = blocks.filter(e => e.title != ".canvas")
	return blocks
}

memo(() => {
	state.canvasScale.value() < 0.1 ? state.canvasScale.next(.1):null
	state.canvasScale.value() > 2.3 ? state.canvasScale.next(2.3):null

	localStorage.setItem("transform", JSON.stringify({
		x: state.canvasX.value(),
		y: state.canvasY.value(),
		scale: state.canvasScale.value()
	}))

}, [state.canvasX, state.canvasY, state.canvasScale])
