import { reactive, memo } from "./chowk.js"
import { dom } from "./dom.js"
import { canvasScale, canvasX, canvasY } from "./state.js"

// first order of business
// Get canvas showing and moving like before
let mountContainer = () => {
	let pointStart = reactive([0, 0])
	let pointEnd = reactive([0, 0])
	let anchor
	let onpointerdown = e => {
		let target = e.target
		if (e.target != document.querySelector('.container')) return
		pointStart.next([e.offsetX, e.offsetY])
		pointEnd.next([e.offsetX, e.offsetY])

		target.setPointerCapture(e.pointerId);

		anchor = {
			x: canvasX.value(),
			y: canvasY.value(),
			scale: canvasScale.value(),
		}
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
			anchor = undefined
			return
		}
	}

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

	let root = [".container", {
			// holding,
			style: stylemmeo,
			onpointerdown, onpointermove, onpointerup
		}]

	document.body.appendChild(dom(root))
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
