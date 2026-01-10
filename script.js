import { reactive, memo } from "./chowk.js"
import { dom } from "./dom.js"
import { drag } from "./drag.js"
import { canvasScale, canvasX, canvasY, getNodeLocation, state, store, subscribeToId, try_set_channel } from "./state.js"


// first order of business
// 1. Get canvas showing and moving like before
// 2. Load blocks from Are.na
// 3. Implement store
// 4. Add nodes to store
export let mountContainer = (blocks) => {

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
	}, ...blocks]

	// ---------
	// MOUNT
	// ~~~~~~~~~
	document.body.appendChild(dom(root))
	// ---------
}

// and the pass in the children?
// mountContainer()


const convertBlockToV3 = block => {
	if (block.class) {
		block.type = block.class
		if (block.type == 'Text') {
			block.content = {markdown: block.content,}
		}
		// if has image the change url to src or whatever
	}

	return block
}
// ------------------
// Block and Group El
// ------------------
export function BlockElement (block){
	// Convert From  v3 to v2 incase
	let block = convertBlockToV3(block)
	let location = getNodeLocation(block.id)

	let r = (key) => ({
		isReactive: true,
		value: () => store.get(location.concat([key])),
		next: (v) => store.tr(location, 'set', [key, v]),
		subscribe: (fn) => subscribeToId(block.id, [key], fn)
	})

	let left = r('x')
	let top = r('y')
	let height = r('height')
	let width = r('width')

	let style = memo(() => `
		position: absolute;
		left: ${left.value()}px;
		top: ${top.value()}px;
		width: ${width.value()}px;
		height: ${height.value()}px
	`, [left, top, width, height])

	let el = dom([".block", block.id + ""])
	el = dom('.draggable.node', {style}, el)

	setTimeout(() => {
		drag(el, {
			onstart: () => {
				// saves this location for undo
				left.next(left.value() + 1)
				top.next(top.value() + 1)
				store.pauseTracking()
			},
			set_position: (x, y) => {
				left.next(x)
				top.next(y)
			},
			onend: () => {
				store.resumeTracking()
			}
		})
	}, 50 )

	return el
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
// Initialization FN
// -------------------
try_set_channel(state.current_slug)
