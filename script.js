import { reactive, memo } from "./chowk.js"
import { dom } from "./dom.js"
import { canvasScale, canvasX, canvasY, state } from "./state.js"
import { get_channel } from './arena.js'

// first order of business
// Get canvas showing and moving like before
// Load blocks from Are.na

// --------------------------
// Utility #dom #notification 
// --------------------------
export let notificationpopup = (msg, error = false) => {
	msg = error ? '🚫 ' +msg : msg
	let tag = '.notification' + (error ? '.error' : '')

	let d = dom(tag, msg)

	document.querySelectorAll('.notification')
		.forEach((e) => {
			let b = parseFloat(e.style.bottom)
			e.style.bottom = (b + 5) + 'em'
		})

	document.body.appendChild(d)

	setTimeout(() => { d.style.right = '1em'; d.style.opacity = 1 }, 5)
	setTimeout(() => { d.style.opacity = 0 }, error ? 6000 : 4500)
	setTimeout(() => { d.remove() }, error ? 9500 : 8000)
}


let mountContainer = () => {

	// Anchoring components
	// ~~~~~~~~~~~~~~~~~~~~
	let pointStart = reactive([0, 0])
	let pointEnd = reactive([0, 0])
	let anchor
	let startAnchor = () => anchor = {
		x: canvasX.value(),
		y: canvasY.value(),
		scale: canvasScale.value(),
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

		const deltaX = e.movementX / canvasScale.value();
		const deltaY = e.movementY / canvasScale.value();
		pointEnd.next(v => [v[0] + deltaX, v[1] + deltaY])
		if (anchor) {
			canvasX.next(anchor.x + (pointStart.value()[0] - pointEnd.value()[0]))
			canvasY.next(anchor.y + (pointStart.value()[1] - pointEnd.value()[1]))
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
			${canvasX.value() + window.innerWidth / 2}px
			${canvasY.value() + window.innerHeight / 2}px;

		transform:
				translate(
						${canvasX.value() * -1}px,
						${canvasY.value() * -1}px)
				scale(${canvasScale.value()});`,
		[canvasX, canvasY, canvasScale])

	// DOM
	// ~~~~
	let root = [".container", {
			// holding,
			style: stylemmeo,
			onpointerdown, onpointermove, onpointerup
		}]

	// ---------
	// MOUNT
	// ~~~~~~~~~
	document.body.appendChild(dom(root))
	// ---------
}

// and the pass in the children?
mountContainer()

// ------------------
// Block and Group El
// ------------------

// ---------------
// Data Logic
// ---------------
// Processing blocks
// Updating data
// Constructing data
// setting slug
// pulling from are.na

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
export let set_channel = slug => {
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
// Initialization FN
// -------------------
try_set_channel(state.current_slug)
