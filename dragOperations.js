import { reactive, memo } from "./chowk.js"
import { BlockElement, constructBlockData, constructGroupData, GroupElement } from "./block.js"
import { state, store, updateNodeHash } from "./state.js"
import { add_block } from "./arena.js"


let anchor = undefined

let startX = reactive(0)
let startY = reactive(0)
let endX = reactive(0)
let endY = reactive(0)

export let dragTransforms = {
	startX, startY, endX, endY
}

let makingBlock = false
let makingGroup = false

export let dragOperations = {
	onpointerdown: e => {
		let target = e.target
		if (e.target != document.querySelector('.container')) return
		// state.selected.next([])

		state.canceled.next(false)
		startX.next(e.offsetX)
		startY.next(e.offsetY)
		endX.next(e.offsetX)
		endY.next(e.offsetY)

		target.setPointerCapture(e.pointerId);

		if (e.metaKey) { makingBlock = true }
		else if (e.shiftKey) { makingGroup = true }
		else {
			anchor = {
				x: state.canvasX.value(),
				y: state.canvasY.value(),
				scale: state.canvasScale.value(),
			}

			state.holdingCanvas.next(true)
		}
	},
	onpointermove: e => {
		let target = e.target

		if (!target.hasPointerCapture(e.pointerId)) return;

		const deltaX = e.movementX / state.canvasScale.value();
		const deltaY = e.movementY / state.canvasScale.value();
		endX.next(v => v + deltaX)
		endY.next(v => v + deltaY)

		if (anchor) {
			state.canvasX.next(anchor.x + startX.value() - endX.value())
			state.canvasY.next(anchor.y + startY.value() - endY.value())
		}
	},

	onpointerup: e => {
		let target = e.target
		state.holdingCanvas.next(false)
		let pointsToAt = (x1, y1, x2, y2) => ({
			x: Math.min(x1, x2), y: Math.min(y1, y2),
			width: Math.abs(x2 - x1),
			height: Math.abs(y2 - y1),
		})
		let { x, y, width, height } = pointsToAt(
			startX.value(),
			startY.value(),
			endX.value(),
			endY.value(),
		)

		target.releasePointerCapture(e.pointerId);

		startX.next(0)
		startY.next(0)
		endX.next(0)
		endY.next(0)

		if (anchor) {
			anchor = undefined
			return
		}

		if (state.canceled.value()) {
			state.canceled.next(false)
			return
		}
		if (makingBlock) {
			makingBlock = false
			if (width < 150 || height < 150) return
			add_block(state.currentSlug.value(), '', "# New Block")
				.then((res) => {
					let newBlock = constructBlockData(res, { x, y, width, height })
					store.tr(['data', 'nodes'], 'push', newBlock, false)
					updateNodeHash()
					document.querySelector('.container').appendChild(BlockElement(res))
				})

		}
		else if (makingGroup) {
			if (width < 250 || height < 250) return
			let d = constructGroupData(x, y, width, height)
			store.tr(['data', 'nodes'], 'push', d, false)
			updateNodeHash()
			document.querySelector('.container').appendChild(GroupElement(d))
		}
	}
}
