import { reactive, memo } from "./chowk.js"
import { dom } from "./dom.js"
import { store, state, try_set_channel } from "./state.js"
import { Keymanager } from "./keymanager.js"
import { sidebar } from "./sidebar.js"

// first order of business
// 1. Get canvas showing and moving like before
// 2. Load blocks from Are.na
// 3. Implement store
// 4. Add nodes to store
// 5. Render block

// -------------
// Utitlies
// ~~~~~~~~~~~~~
let checkSlugUrl = (url) => {
	if (!url.includes("#")) return
	else return url.split('#').filter(e => e != '').pop()
}

// -------------
// Mounters
// -------------
export let mount = () => {
	let url = location.href
	let slug = checkSlugUrl(url)
	slug
		? try_set_channel(slug)
		: try_set_channel(state.currentSlug.value())

	document.body.appendChild(dom(sidebar))
}

let unmountContainer = () => {
	let exists = document.querySelector('.container')
	if (exists) exists.remove()
}

export let mountContainer = (blocks) => {
	unmountContainer()

	// Anchoring components
	// ~~~~~~~~~~~~~~~~~~~~
	let pointStart = reactive([0, 0])
	let pointEnd = reactive([0, 0])
	let anchor
	let startAnchor = () => anchor = {
		x: state.canvasX.value(),
		y: state.canvasY.value(),
		scale: state.canvasScale.value(),
	}
	let endAnchor = () => anchor = undefined

	// Draggin on .container
	// ~~~~~~~~~~~~~~~~~~~~
	let onpointerdown = e => {
		let target = e.target
		if (e.target != document.querySelector('.container')) return

		startAnchor()
		target.setPointerCapture(e.pointerId);

		pointStart.next([e.offsetX, e.offsetY])
		pointEnd.next([e.offsetX, e.offsetY])
	}
	let onpointermove = e => {
		let target = e.target

		if (!target.hasPointerCapture(e.pointerId)) return;

		const deltaX = e.movementX / state.canvasScale.value();
		const deltaY = e.movementY / state.canvasScale.value();
		pointEnd.next(v => [v[0] + deltaX, v[1] + deltaY])
		if (anchor) {
			state.canvasX.next(anchor.x + (pointStart.value()[0] - pointEnd.value()[0]))
			state.canvasY.next(anchor.y + (pointStart.value()[1] - pointEnd.value()[1]))
		}
	}
	let onpointerup = e => {
		let target = e.target
		target.releasePointerCapture(e.pointerId);

		if (anchor) {
			endAnchor()
			return
		}
	}

	// CSS transforms
	// ~~~~~~~~~~~~~~~~~~~~
	let stylemmeo = memo(() => `
		transform-origin:
			${state.canvasX.value() + window.innerWidth / 2}px
			${state.canvasY.value() + window.innerHeight / 2}px;

		transform:
				translate(
						${state.canvasX.value() * -1}px,
						${state.canvasY.value() * -1}px)
				scale(${state.canvasScale.value()});`,
		[state.canvasX, state.canvasY, state.canvasScale])

	// DOM
	// ~~~~
	let root = [".container", {
		// holding,
		style: stylemmeo,
		onpointerdown, onpointermove, onpointerup
	}, ...blocks]

	// ---------
	// MOUNT
	// ~~~~~~~~~
	document.body.appendChild(dom(root))
	// ---------
}
// ---------------
// Data Logic
// ---------------
// Processing blocks
// Updating data
// Constructing data
// setting slug
// pulling from are.na


// ---------------
// Nodes
// ---------------
// x
// y
// scale
// minimap

// ---------------
// Buttons
// ---------------
// help
// save
// sidebar

// ---------------
// event listeners
// ---------------
// keydown
// wheel
// drag and drop

// -------------------
// Wheel Event (!)
// ~~~~~~~~~~~~~~~~~~~
document.addEventListener("wheel", e => {
	if (e.ctrlKey) {
		// trackpad...
		e.preventDefault()
		state.canvasScale.next(f => f - (e.deltaY / 800))
	}

	else if (e.metaKey) {
		e.preventDefault()
		state.canvasScale.next(f => f - (e.deltaY / 2500))
	}

	else if (state.trackpad_movement) {
		e.preventDefault()
		state.canvasY.next(f => f + e.deltaY)
		state.canvasX.next(f => f + e.deltaX)
	}
}, { passive: false })


// --------------------
// ACTIONS
// --------------------
let undo = () => store.canUndo() ? store.doUndo() : null
let redo = () => store.canRedo() ? store.doRedo() : null

let inc = (e = false) => e ? 250 : 50
let zoomIn = (e) => state.canvasScale.next(f => f + (inc() / 500))
let zoomOut = (e) => state.canvasScale.next(f => f - (inc() / 500))
let moveLeft = () => state.canvasX.next(f => f - inc())
let moveRight = () => state.canvasX.next(f => f + inc())
let toggleSidebar = () => state.sidebarOpen.next(e => !e)

let keys = new Keymanager()
let preventDefault = { preventDefault: true }
keys.on('cmd + z', undo, preventDefault)
keys.on('cmd + shift + z', redo, preventDefault)
keys.on('cmd + =', zoomIn, preventDefault)
keys.on('cmd + -', zoomOut, preventDefault)
keys.on('ArrowRight', moveRight)
keys.on('ArrowLeft', moveLeft)
keys.on('cmd + e', toggleSidebar, preventDefault)

document.onkeydown = e => keys.event(e)

// --------------------
// Hash watcher
// --------------------
window.onhashchange = (event) => {
	let slug = checkSlugUrl(event.newURL)
	if (slug) try_set_channel(slug)
}
// -------------------
// Initialization FN
// -------------------
mount()

