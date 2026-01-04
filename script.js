import { dom } from "./dom.js"
import { reactive, memo } from "./hok.js"
import { drag } from "./drag.js"
import { MD } from "./md.js"
import { try_auth, update_block, add_block, get_channel } from "./arena.js"
import { svgcurveline, svgline, svgrect, svgx } from "./svg.js"
import { addToRecents, focusSearchBar, sidebar, sidebarOpen } from "./sidebar.js"
import {
	authslug,
	store, state,
	save_data,
	canvasScale, canvasX, canvasY, mouse,
	dimensions,
	dataSubscriptions
} from "./data.js"
import { sliderAxis, slidercursor, reactiveEl, keyPresser } from "./node.js"

let notificationpopup = (msg) => {
	let d = dom('.notification', {
		style: `
		position: fixed;
		right: -50vw;
		opactiy: 0;
		bottom: 1em;
		transition: 200ms;
	`}, msg)

	document.querySelectorAll('.notification')
		.forEach((e) => {
			let b = parseFloat(e.style.bottom)
			e.style.bottom = (b + 5) + 'em'
		})

	document.body.appendChild(d)

	setTimeout(() => { d.style.right = '1em'; d.style.opacity = 1 }, 5)
	setTimeout(() => { d.style.opacity = 0 }, 4500)
	setTimeout(() => { d.remove() }, 8000)
}
const uuid = () => Math.random().toString(36).slice(-6);
const button = (t, fn, attr = {}) => ["button", { onclick: fn, ...attr }, t]
let nodesActive = reactive(true)

export let colors = [
	'#F5DCE9',
	'#E4D4A0',
	'#F5F5DC',
	'#DCF5DF',
	"#CFF0F5", // 5 - pastel cyan
	"#E3CFF5",  // 6 - pastel purple
	"#F5D1B8", // 2 - pastel orange
	"#F5E8B8", // 3 - pastel yellow
	"#CFF5D1", // 4 - pastel green
];

// [
// ]
// -------------------
// DATA
// -------------------
// USE keymanager instead
let keys = []
let mountDone = false
let w = 300

let currentslug = "list-are-na-api-possibilities"
let local_currentslug = localStorage.getItem("slug")
if (local_currentslug) currentslug = local_currentslug

// -------------------
// Initialization FN
// -------------------
export let try_set_channel = slugOrURL => {
	// check if it is url
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
				console.log("Failed to get channel", slug)
				notificationpopup('Failed to get channel ' + slug)
			}
			else {
				notificationpopup('Loaded Channel: ' + slug)
				notificationpopup('Total Blocks: ' + res.data.length)

				currentslug = slug
				addToRecents(slug)
				setSlug(slug)
				localStorage.setItem('slug', slug)
				renderBlocks(res.data)

			}
		})
}

let setSlug = (slug) => {
	history.pushState('', '', '#' + slug)
}

let constructBlockData = (e, i) => {
	let r1 = Math.random() * 850
	let r2 = Math.random() * 850
	let d = {
		id: e.id,
		x: (i % 8) * 400 + r1,
		y: (Math.floor(i / 8)) * 450 + r2,
		width: 300,
		height: 300,
		color: '1'
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
let groupData = (x, y, width, height) => {
	let d = {
		type: 'group',
		label: "Group",
		id: 'group-' + uuid(),
		x, y, width, height,
	}

	return d
}

let groupEl = group => {
	const isRectContained = (rect1, rect2) => {
		return (
			rect2.x >= rect1.x &&
			rect2.y >= rect1.y &&
			rect2.x + rect2.width <= rect1.x + rect1.width &&
			rect2.y + rect2.height <= rect1.y + rect1.height
		);
	}
	let anchored = []
	let position = store.data.nodes.find(e => e.id == group.id)
	if (!position) console.error("BRUH HOW")
	position = store.data.nodes.find(e => e.id == group.id)
	if (!position.color) position.color = '5'
	if (!position.label) position.label = 'Group'

	let left = reactive(position.x)
	let top = reactive(position.y)
	let width = reactive(position.width)
	let height = reactive(position.height)
	let color = reactive(position.color)

	color.subscribe(v => position.color = v)
	left.subscribe(v => position.x = v)
	left.subscribe(save_data)
	top.subscribe(v => position.y = v)
	top.subscribe(save_data)

	width.subscribe(v => position.width = v)
	height.subscribe(v => position.height = v)
	height.subscribe(save_data)
	width.subscribe(save_data)

	memo(() => {
		position.x = left.value()
		position.y = top.value()
		position.width = width.value()
		position.height = height.value()
		save_data()
	}, [left, top, width, height])

	let setcolorfn = i => () => color.next(i + "")
	let removeButton = () => {
		let click = reactive(0)
		let words = ['delete', 'DELETE', "DELETE!", "DELETEEEEE", "DELEETEEEE!!!!"]
		let onclick = () => {
			click.next(e => e + 1)
			if (click.value() == 5) remove()
		}
		return button(memo(() => words[click.value()], [click]), onclick)
	}
	let colorbuttons =
		['.color-bar', ...[1, 2, 3, 4, 5, 6].map((i) => button('x', setcolorfn(i), { style: 'background-color: ' + colors[i - 1] + ";" })), removeButton()]
	let remove = () => {
		let i = store.data.nodes.findIndex(e => e == position)
		console.log('found', position, "at", i)
		store.data.nodes.splice(i, 1)
		draggable.remove()
	}

	let style = memo(() => `
		position: absolute;
		left: ${left.value()}px;
		top: ${top.value()}px;
		background-color: ${colors[parseInt(color.value()) - 1]};
		width: ${width.value()}px;
		height: ${height.value()}px
	`, [left, top, width, height, color])

	let resize = memo(() => `
		left:${width.value() - 15}px;
		top:${height.value() - 15}px;
`, [width, height])

	let resizewidthmiddle = memo(() => `
		left:${width.value() - 15}px;
		top:${height.value() / 4}px;
		height: ${height.value() / 2}px;
`, [width, height])

	let resizeheightmiddle = memo(() => `
		top:${height.value() - 15}px;
		left:${width.value() / 4}px;
		width: ${width.value() / 2}px;
`, [height, width])



	let resizer = dom(".absolute.flex-center.box.cur-se", { style: resize }, svgx(30))
	let resizerwidthmiddle = dom(".absolute.flex-center.box.cur-e", { style: resizewidthmiddle }, svgx(30))
	let resizerheightmiddle = dom(".absolute.flex-center.box.cur-s", { style: resizeheightmiddle }, svgx(30))

	let draggable = dom('.draggable.group', { style: style }, colorbuttons, resizer, resizerheightmiddle, resizerwidthmiddle)
	let el

	let editingLabel = reactive(false)
	let textLabel = () => ['h4', { onclick: () => { editingLabel.next(true) } }, position.label]
	let editLabel = () => ['div', ['input',
		{
			onclick: (e) => { e.stopImmediatePropagation(); e.stopPropagation(); console.log("TYUF") },
			oninput: (e) => { position.label = e.target.value },
			onkeydown: (e) => { if (e.key == 'Enter') editingLabel.next(false) },
			value: position.label
		}],

		button("set", () => editingLabel.next(false))]

	let title = dom(['.label', memo(() => editingLabel.value() ? editLabel() : textLabel(), [editingLabel])])

	el = [".block.group", title]
	el = dom(el)
	draggable.appendChild(el)

	let onstart = (e) => {
		console.log('e', e)
		if (e.metaKey) return
		store.data.nodes.forEach((e) => {
			if (e.type != 'group' && isRectContained(
				{ x: left.value(), y: top.value(), width: width.value(), height: height.value() },
				{ x: e.x, y: e.y, width: e.width, height: e.height },
			)) {
				let item = {
					block: e,
					offset: {
						x: e.x - left.value(),
						y: e.y - top.value(),
					}
				}
				anchored.push(item)
			}
		})
	}

	let onend = () => {
		anchored = []
	}
	setTimeout(() => {
		let set_left = (v) => {
			left.next(v)
			anchored.forEach(e => {
				e.block.x = v + e.offset.x
				save_data()
			})
		}
		let set_top = (v) => {
			top.next(v)
			anchored.forEach(e => {
				e.block.y = v + e.offset.y
				save_data()
			})
		}

		drag(draggable, { set_left, set_top, onstart, onend })
		drag(resizer, { set_left: (v) => width.next(v), set_top: (v) => height.next(v) })
		// drag(resizerwidth, { set_left: (v) => width.next(v), set_top: () => null })
		// drag(resizerheight, { set_left: () => null, set_top: (v) => height.next(v) })
		drag(resizerwidthmiddle, { set_left: (v) => width.next(v), set_top: () => null })
		drag(resizerheightmiddle, { set_left: () => null, set_top: (v) => height.next(v) })
	}, 100)
	return draggable

}
let blockEl = block => {
	let position = store.data.nodes.find(e => e.id == block.id)
	if (!position) store.data.nodes.push(constructBlockData(block, 0))
	position = store.data.nodes.find(e => e.id == block.id)
	if (!position.color) position.color = '1'

	let updateFn = (data) => {
		let p = (data.nodes.find(e => e.id == block.id))
		if (!p) {
			console.log("GONNNNE")
			// should probably delete self
			let i = dataSubscriptions.findIndex(e => e == updateFn)
			if (i != -1) dataSubscriptions.splice(i, 1)
		}
		if (!p) return

		if (p.x != left.value()) left.next(p.x)
		if (p.y != top.value()) top.next(p.y)
		if (p.width != width.value()) width.next(p.width)
		if (p.height != height.value()) height.next(p.height)
	}

	dataSubscriptions.push(updateFn)

	let left = reactive(position.x)
	let top = reactive(position.y)
	let width = reactive(position.width)
	let height = reactive(position.height)
	let color = reactive(position.color)

	color.subscribe(v => position.color = v)
	left.subscribe(v => position.x = v)
	left.subscribe(save_data)
	top.subscribe(v => position.y = v)
	top.subscribe(save_data)

	width.subscribe(v => position.width = v)
	height.subscribe(v => position.height = v)
	height.subscribe(save_data)
	width.subscribe(save_data)

	memo(() => {
		position.x = left.value()
		position.y = top.value()
		position.width = width.value()
		position.height = height.value()
		save_data()
	}, [left, top, width, height])


	let style = memo(() => `
		position: absolute;
		background-color: ${colors[parseInt(color.value()) - 1]};
		left: ${left.value()}px;
		top: ${top.value()}px;
		width: ${width.value()}px;
		height: ${height.value()}px
	`, [left, top, width, height, color])

	let resize = memo(() => `
		left:${width.value() - 15}px;
		top:${height.value() - 15}px;
`, [width, height])

	let resizewidthmiddle = memo(() => `
		left:${width.value() - 15}px;
		top:${height.value() / 4}px;
		height: ${height.value() / 2}px;
`, [width, height])

	let resizeheightmiddle = memo(() => `
		top:${height.value() - 15}px;
		left:${width.value() / 4}px;
		width: ${width.value() / 2}px;
`, [height, width])



	let resizer = dom(".absolute.flex-center.box.cur-se",
		{ style: resize },
		svgx(30))
	let resizerwidthmiddle = dom(".absolute.flex-center.box.cur-e", { style: resizewidthmiddle }, svgx(30))
	let resizerheightmiddle = dom(".absolute.flex-center.box.cur-s", { style: resizeheightmiddle }, svgx(30))

	let setcolorfn = i => () => color.next(i + "")
	let colorbuttons = ['.color-bar', ...[1, 2, 3, 4, 5, 6].map((i) => button('x', setcolorfn(i), { style: 'background-color: ' + colors[i - 1] + ";" }))]
	let blockUserTag = ["p.tag", block.user.slug]
	let blockTitleTag = ["p.tag", block.title]
	let editBlock = () => {
		edit = true
		mountResizers()
		draggable.appendChild(textarea(value))
	}
	let editButton = button('edit', editBlock)
	let editOrTag = memo(() =>
		block.user.slug == authslug.value() && block.type == 'Text'
			? editButton
			// : block.title ?
			// 	blockTitleTag
				: blockUserTag, [authslug])
	let topBar = [['.top-bar'], editOrTag, colorbuttons]
	let draggable = dom('.draggable.node', { style: style }, topBar, resizer, resizerheightmiddle, resizerwidthmiddle)
	let el
	let image = block => ['img', { src: block.image?.large?.src }]
	let edit = false
	let textarea = md => {
		// on creation keep old value to reset
		old = value
		return dom([".block.text", ["textarea", {
			onclick: (e) => {
				e.stopPropagation();
				e.stopImmediatePropagation()
			},
			oninput: e => value = e.target.value
		}, md]])
	}

	let value = block.content?.markdown
	let old = ''
	let saveBlock = () => {
		edit = false
		update_block(block.id, { content: value })
			.then(res => {
				if (res.status == 204) notificationpopup("Updated 👍")
				else notificationpopup("Failed? status: " + res.status)
			})
		mountResizers()
		draggable.appendChild(dom([".block.text", ...MD(value)]))

	}
	let cancelEdit = () => {
		value = old
		edit = false
		mountResizers()
		draggable.appendChild(dom([".block.text", ...MD(value)]))
	}

	let saveButton = dom(button("save", saveBlock))
	let cancelButton = dom(button('cancel', cancelEdit))
	let mountResizers = () => {
		draggable.innerHTML = ``;
		draggable.appendChild(resizer)
		draggable.appendChild(resizerwidthmiddle)
		draggable.appendChild(resizerheightmiddle)

		topBar = edit
			? ['.top-bar', saveButton, cancelButton, colorbuttons]
			: ['.top-bar', editOrTag, colorbuttons]

		let el = dom(topBar)
		console.log(el)

		draggable.appendChild(el)
	}

	if (block.type == "Text") {
		el = [".block.text", ...MD(value)]
	}
	else if (block.type == "Image") el = [".block.image", image(block)]
	else if (block.type == "Attachment") el = [".block.image", image(block)]
	else if (block.type == "Link") el = [".block.image", image(block)]
	else if (block.type == "Embed") el = [".block.image", image(block)]
	else el = [".block", block.id + ""]
	el = dom(el)
	draggable.appendChild(el)

	setTimeout(() => {
		let set_left = (v) => left.next(v)
		let set_top = (v) => top.next(v)
		drag(draggable, { set_left, set_top, pan_switch: () => !edit, bound: 'inner' })
		drag(resizer,
			{
				set_left: (v) => width.next(v),
				set_top: (v) => height.next(v)
			})
		drag(resizerwidthmiddle, { set_left: (v) => width.next(v), set_top: () => null })
		drag(resizerheightmiddle, { set_left: () => null, set_top: (v) => height.next(v) })
	}, 100)
	return draggable
}
let processBlockForRendering = (blocks) => {
	blocks = blocks.filter(e => e.title != ".canvas")
	blocks = blocks.filter(e => e.type != "Channel")

	return blocks
}
let updateData = (blocks) => {
	state.dotcanvas = (blocks.find(e => e.title == '.canvas'))
	if (state.dotcanvas) {
		// put in a try block
		store.data = JSON.parse(state.dotcanvas.content.plain)

		store.data.nodes.forEach(node => {
			if (node.type == 'text') {
				// find the block
				let f = blocks.find(e => e.id == node.id)
				if (f && f.type == 'Text') node.text = f.content.markdown
			}
		})
	}

	if (!store.data) {
		let nodes = blocks.filter(e => e.title != ".canvas").map(constructBlockData)
		store.data = { nodes, edges: [] }
	}

}

function intersectRect(r1, r2) {
	return !(r2.left > r1.right ||
		r2.right < r1.left ||
		r2.top > r1.bottom ||
		r2.bottom < r1.top);
}

let pointStart = reactive([0, 0])
let pointEnd = reactive([0, 0])

let renderBlocks = (blocks) => {
	// reset stuff
	// I think itll be a good idea to just do a page refresh
	// connections = []
	store.data = undefined
	let c = document.querySelector(".container")
	c ? c.remove() : null

	// try find a .canvas block
	updateData(blocks)
	blocks = processBlockForRendering(blocks)

	if (!mountDone) mount()

	let timer = reactive(0)
	setInterval(() => timer.next(e => e + 1), 500)

	// ALternate Zoom
	let funkystylememo = memo(() => `
	transform-origin:
		${canvasX.value() + (mouse.value().x / canvasScale.value()) / 2}px
		${canvasY.value() + (mouse.value().y / canvasScale.value()) / 2}px;

		transform: translate(${canvasX.value() * -1}px, ${canvasY.value() * -1}px) scale(${canvasScale.value()}) ;`,
		[canvasX, canvasY, canvasScale, mouse])
	let stylemmeo = memo(() => `
		transform-origin:
			${canvasX.value() + window.innerWidth / 2}px
			${canvasY.value() + window.innerHeight / 2}px;

		transform: translate(${canvasX.value() * -1}px, ${canvasY.value() * -1}px) scale(${canvasScale.value()}) ;
`, [canvasX, canvasY, canvasScale])


	try_auth()
	let blocksmapped = blocks.filter(e => e.type != 'group').map(blockEl)
	let groupRender = reactive(0)
	let groupmapped = memo(() => store.data.nodes.filter(e => e.type == 'group').map(groupEl), [groupRender])

	let onpointerdown = e => {
		let target = e.target
		if (e.target != document.querySelector('.container')) return
		console.log("Will start drag at: ", e.offsetX, e.offsetY,
			"For element: ", e.target,
			"ID: ", e.pointerId,
		)
		pointStart.next([e.offsetX, e.offsetY])
		pointEnd.next([e.offsetX, e.offsetY])
		target.setPointerCapture(e.pointerId);
	}
	let onpointermove = e => {
		let target = e.target

		if (!target.hasPointerCapture(e.pointerId)) return;

		const deltaX = e.movementX / canvasScale.value();
		const deltaY = e.movementY / canvasScale.value();
		pointEnd.next(v => [v[0] + deltaX, v[1] + deltaY])
	}
	let onpointerup = e => {
		let target = e.target

		let pointsToAt = (x1, y1, x2, y2) => ({
			x: Math.min(x1, x2), y: Math.min(y1, y2),
			width: Math.abs(x2 - x1),
			height: Math.abs(y2 - y1),
		})

		let { x, y, width, height } = pointsToAt(...pointStart.value(), ...pointEnd.value())
		target.releasePointerCapture(e.pointerId);

		pointStart.next([0, 0])
		pointEnd.next([0, 0])

		if (width < 250 || height < 250) return
		let d = groupData(x, y, width, height)
		store.data.nodes.push(d)
		groupRender.next(e => e + 1)

	}

	let bigline = memo(() => svgrect(...pointStart.value(),
		...pointEnd.value(),
		"black", 3),
		[pointStart, pointEnd])

	let edgesRender = reactive(0)

	let edges = memo(() => {
		if (!store.data.edges) return []
		return store.data.edges.map(e => {
			let boundingToSide = (b, side) => {
				if (side == 'top') {

					return ({
						x: b.x + b.width / 2,
						y: b.y
					})
				}

				if (side == 'bottom') {
					return ({
						x: b.x + b.width / 2,
						y: b.y + b.height
					})
				}

				if (side == 'right') {
					return ({
						x: b.x + b.width,
						y: b.y + b.height / 2
					})
				}

				if (side == 'left') {
					return ({
						x: b.x,
						y: b.y + b.height / 2
					})
				}
			}


			let from = store.data.nodes.find(b => b.id == e.fromNode)
			let to = store.data.nodes.find(b => b.id == e.toNode)

			let fromT = boundingToSide(from, e.fromSide)
			let toT = boundingToSide(to, e.toSide)

			return svgline(fromT.x, fromT.y, toT.x, toT.y)
		})
	}, [edgesRender])

	dataSubscriptions.push(f => edgesRender.next(e => e + 1))

	let stupidSVG = ['svg', { width: dimensions, height: dimensions }, bigline, edges]

	let root = [".container",
		{
			style: stylemmeo,
			onpointerdown, onpointermove, onpointerup
		}, stupidSVG, groupmapped, ...blocksmapped]

	document.body.appendChild(dom(root))
}
let mount = () => {
	mountDone = true;
	// Nodes
	let slcurse = slidercursor({
		left: 40,
		top: window.innerHeight - (w + 45),
		min: 1,
		max: dimensions,
		height: w,
		width: w,
		value: 1,
	})
	let sls = sliderAxis({
		left: window.innerWidth - 70,
		top: window.innerHeight / 2 - w,
		min: .1,
		max: 2.5,
		height: w,
		width: 15,
		value: canvasScale.value(),
		axis: 'vertical',
		input: canvasScale,
		output: canvasScale,
		label: "+",
	})
	let slx = sliderAxis({
		min: 0,
		left: 40,
		top: window.innerHeight - (w + 125),
		width: w,
		height: 15,
		axis: 'horizontal',
		max: dimensions,
		value: 1,
		input: canvasX,
		output: canvasX,
		label: "X",
	})
	let sly = sliderAxis({
		min: 0,
		height: w,
		left: w + 105,
		top: window.innerHeight - (w + 45),
		width: 15,
		axis: 'vertical',
		max: dimensions,
		value: 1,
		input: canvasY,
		output: canvasY,
		label: "Y",
	})

	// SVG STUFF
	// Fix the leaks here...
	let lines = memo(() => {
		let l = []
		if (state.connectionBuffer)
			l.push([
				state.connectionBuffer.line()[0],
				state.connectionBuffer.line()[1],
				mouse.value().x,
				mouse.value().y])
		state.connections.forEach(e => l.push(e.line()))
		return l
	}, [mouse])
	let lineEls = memo(() => lines.value().map(f => svgline(...f, '#00f8', 2, 4)), [lines])
	// Fix the leaks here...
	let svg = ['svg.line-canvas', { width: window.innerWidth, height: window.innerHeight }, lineEls]

	let nodes = [svg, slcurse, sls, sly, slx]
	let pos = (x, y) => `position: fixed; left: ${x}em; top: ${y}em; z-index: 9999;`

	let openbtn = button(">", () => { sidebarOpen.next(e => e == true ? false : true) }, { style: pos(1, 1) })
	let savebtn = button("save", () => {
		let content = JSON.stringify(store.data)
		if (state.dotcanvas?.id)
			update_block(state.dotcanvas.id, { content, title: ".canvas" }).then(res => {
				if (res.status == 204) notificationpopup("Updated 👍")
				else notificationpopup("Failed? status: " + res.status)

			})
		else add_block(currentslug, '.canvas', content)
	}, { style: pos(3, 1), })

	document.body.appendChild(dom(['.nodes',{active: nodesActive} ,...nodes]))
	document.body.appendChild(dom(sidebar))
	document.body.appendChild(dom(openbtn))
	document.body.appendChild(dom(savebtn))
}

let addnode = node =>
	document.querySelector(".nodes").appendChild(node)

document.onkeydown = (e) => {
	keys.forEach((key) => {
		if (e.key == key.key) { key.fn() }
	})

	// if (e.key == 'W') {
	// 	addnode(keyPresser({ left: 150, top: 250, key: 'w' }))
	// }

	// if (e.key == 'A') {
	// 	addnode(keyPresser({ left: 150, top: 250, key: 'a' }))
	// }

	// if (e.key == 'N') {
	// 	let value = reactive(Math.random() * 55)
	// 	addnode(reactiveEl({
	// 		left: 150, top: 250, value
	// 	}))
	// }

	let inc = e => e.shiftKey ? 250 : 50
	if (e.key == 'H') {
		nodesActive.next(e => !e)
	}
	if (e.key == '=' && e.metaKey) {
		e.preventDefault()
		canvasScale.next(e => e+(inc(e)/500))
	}

	if (e.key == '-' && e.metaKey) {
		e.preventDefault()
		canvasScale.next(e => e-(inc(e)/500))
	}

	let inEdit = (e) => {
		if (e.target instanceof HTMLInputElement) return true
		else if (e.target instanceof HTMLTextAreaElement) return true
		else if (e.target instanceof HTMLButtonElement) return true
		return false
	}

	if (e.key == 'ArrowUp' || e.key.toLowerCase() == 'w') {
		if (inEdit(e)) return
		e.preventDefault()
		canvasY.next(v => v - inc(e))
	}


	if (e.key == 'ArrowDown' || e.key.toLowerCase() == 's') {
		if (inEdit(e)) return
		e.preventDefault()
		canvasY.next(v => v + inc(e))
	}

	if (e.key == 'ArrowRight'|| e.key.toLowerCase() == 'd') {
		if (inEdit(e)) return
		e.preventDefault()
		canvasX.next(v => v + inc(e))
	}

	if (e.key == 'ArrowLeft'|| e.key.toLowerCase() == 'a') {
		if (inEdit(e)) return
		e.preventDefault()
		canvasX.next(v => v - inc(e))
	}

	if (e.key == 'e' && e.metaKey) {
		e.preventDefault()
		sidebarOpen.next(e => !e)
	}

	if (e.key == '/' && sidebarOpen.value()) {
		focusSearchBar()
	}

	if (e.key == 'd' && e.metaKey) {
		e.preventDefault()
		let download_json = (json, file = 'data') => {
			let a = document.createElement("a");

			json = JSON.stringify(json)
			console.log(json)
			let blob = new Blob([json], { type: "octet/stream" })
			let url = window.URL.createObjectURL(blob);

			a.href = url;
			a.download = file + ".canvas";
			a.click();
			window.URL.revokeObjectURL(url);
		};
		// let obsidianable = {
		// 	nodes: data,
		// 	edged: []
		// }
		download_json(store.data, currentslug)
	}
}
document.onmousemove = (e) => {
	mouse.next({ x: parseFloat(e.clientX), y: parseFloat(e.clientY) })
}
document.ondragover = (e) => { e.preventDefault(); }

document.ondrop = e => {
	e.preventDefault();
	const fileItems = [...e.dataTransfer.files]
	fileItems.forEach((file) => {
		let reader = new FileReader();
		reader.onload = function (event) {
			processNewCanvas(event.target.result)
		};
		reader.readAsText(file);
	})
}

let processNewCanvas = str => {
	let d
	try {
		d = JSON.parse(str)
	} catch (e) {
		console.log('failes', e)
	}

	let updateList = []
	if (d) {
		d.nodes.forEach(b => {
			let f = store.data.nodes.find(e => e.id == b.id)
			if (b.type == 'text') {
				if (f && f.text != b.text) {
					updateList.push({ id: b.id, from: f.text, to: b.text })
				}
			}
		})

		if (updateList.length > 0 || d) {
			updateListPopup(d, updateList)
		}
	}
}

let updateListPopup = (updateData, updateBlockList) => {
	let change = ({ id, from, to }) => {
		let showing = reactive(false)
		let elem = dom(['.change-item',
			button('show', () => showing.next(e => !e), { class: 'mr' }),
			button('Update Block', () => {
				update_block(id, { content: to })
					.then(res => {
						if (res.status == 204) {
							notificationpopup("Updated 👍")
							elem.remove()
							elem = null
						}
						else notificationpopup("Failed? status: " + res.status)
					})
			}),
			['p', id + ": changed"],
			['.change-map', { showing },
				['.change-block.from', from],
				['.change-block.to', to],
			]])

		return elem
	}
	let layoutUpdated = false
	let root = dom(['.popup',
		button('close', () => root.remove()),
		['h4', 'Layout'],
		button("Update Layout", () => {
			if (layoutUpdated) return
			updateData.nodes.forEach(node => {
				let f = store.data.nodes.find(block => node.id == block.id)
				if (f) {
					f.x = node.x
					f.y = node.y
					f.width = node.width
					f.height = node.height
				}
			})

			store.data.edges = updateData.edges
			save_data()
			layoutUpdated = true
		},),
		['h4', "Block Changes"], ...updateBlockList.map((e) => change(e)),
	])

	document.body.appendChild(root)
	drag(root)

}

// function isVerticallyScrollable(element) {
//   if (!element) return false;
// 	console.log("scroll", element.scrollHeight, element, element.clientHeight)
//   return element.scrollHeight > element.clientHeight;
// }

document.addEventListener("wheel", e => {
	// if (isVerticallyScrollable(e.target)) return
	if (e.ctrlKey) return

	e.preventDefault()
	e.stopImmediatePropagation();

	if (e.metaKey) {
		canvasScale.next(f => f - (e.deltaY / 2500))
	}
	else {
		canvasY.next(f => f + e.deltaY)
		canvasX.next(f => f + e.deltaX)
	}
})

document.addEventListener("gesturestart", function (e) {
  e.preventDefault();
});

document.addEventListener("gesturechange", function (e) {
  e.preventDefault();
	console.log(e.scale)
})

document.addEventListener("gestureend", function (e) {
  e.preventDefault();
});



let checkSlugUrl = (url) => {
	if (!url.includes("#")) return
	else return url.split('#').filter(e => e != '').pop()
}

window.onhashchange = (event) => {
	let slug = checkSlugUrl(event.newURL)
	if (slug) try_set_channel(slug)
}

let url = location.href
let slug = checkSlugUrl(url)
if (slug) try_set_channel(slug)
else set_channel(currentslug)
