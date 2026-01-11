import { reactive, memo } from "./chowk.js"
import { dom } from "./dom.js"
import { store, state, try_set_channel } from "./state.js"
import { Keymanager } from "./keymanager.js"
import { sidebar } from "./sidebar.js"
import { dragOperations  } from "./dragOperations.js"

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

// --------------------
// Move this somewhere
// xxxxxxxxxxxxxxxxxxxxx
export function moveToBlock(id) {
	let found = document.querySelector("*[block-id='" + id + "']")
	if (found) {
		if (movingTimeout) clearTimeout(movingTimeout)
		let { x, y, width, height } = found.getBoundingClientRect()
		let xDist = x - 150
		let yDist = y - 150

		if (width < window.innerWidth) {
			let left = (window.innerWidth - width) / 2
			xDist = x - left
		}

		// if visible don't move
		if (!(x > 0 && x + width < window.innerWidth)
			|| !(y > 0 && y + 150 < window.innerHeight)
		) {
			let last = {}
			last.x = state.canvasX.value()
			last.y = state.canvasY.value()

			lastHistory.push(last)

			let destX = (xDist / state.canvasScale.value()) + last.x
			let destY = (yDist / state.canvasScale.value()) + last.y

			animateMove(destX, destY)
		}


		let c = found.style.backgroundColor
		let z = found.style.zindex
		found.style.backgroundColor = 'yellow'
		found.style.zIndex = 99
		setTimeout(() => {
			found.style.backgroundColor = c
			found.style.zIndex = z
		}, 800)
	}

	else {
		notificationpopup(
			['span', "Block not found, ",
				['a', {
					href: 'https://are.na/block/' + id,
					target: '_blank'
				},
					'jump to link'], "?"])
	}
}

// --------------
// Animation
// --------------
const lerp = (start, stop, amt) => amt * (stop - start) + start
const InOutQuad = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t)
let animateMove = (destX, destY) => {
	let last = {}
	last.x = state.canvasX.value()
	last.y = state.canvasY.value()

	let t = 0
	let v = 0
	let progress = () => {
		t += .03
		v = InOutQuad(t)
		state.canvasX.next(lerp(last.x, destX, v))
		state.canvasY.next(lerp(last.y, destY, v))
		if (t > .99) return
		state.moving_timeout = setTimeout(progress, 1000 / 60)
	}
	progress()
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
export let mountContainer = (children) => {
	unmountContainer()

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
		holding: state.holdingCanvas,
		style: stylemmeo,
		onpointerdown, onpointermove, onpointerup,
		...dragOperations,
	}, ...children]

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
keys.on("Escape", () => state.canceled.next(true))
keys.on("cmd + escape", () => state.canceled.next(true))
keys.on("shift + escape", () => state.canceled.next(true))

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

