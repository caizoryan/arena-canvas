import { dom } from "./dom.js"
import { reactive, memo } from "./hok.js"
import { drag } from "./drag.js"
import { MD } from "./md.js"
import { try_auth, update_block, add_block, get_channel } from "./arena.js"
import { svgline, svgrect, svgx } from "./svg.js"
import { sidebar, sidebarOpen } from "./sidebar.js"
import {
	authslug,
	data, state,
	save_data,
	canvasScale, canvasX, canvasY, mouse,
	dimensions,
	dataSubscriptions
} from "./data.js"
import { sliderAxis, slidercursor, reactiveEl, keyPresser } from "./node.js"

const uuid = () => Math.random().toString(36).slice(-6);
const button = (t, fn, attr = {}) => ["button", { onclick: fn, ...attr }, t]

let colors = [
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

let currentslug = 'isp-writing'
let local_currentslug = localStorage.getItem("slug")
if (local_currentslug) currentslug = local_currentslug

// -------------------
// Initialization FN
// -------------------
export let set_channel = slug => get_channel(slug)
	.then((res) => {
		currentslug = slug
		localStorage.setItem('slug', slug)
		renderBlocks(res.data)
	})

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
		console.log("Text Block")
		d.type = 'text'
		d.text = e.content.markdown
	}

	else if (e.type == "Image") {
		console.log("Image block")
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
		console.log(e)
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
	console.log("GOT", group)
	let position = data.data.nodes.find(e => e.id == group.id)
	if (!position) console.error("BRUH HOW")
	position = data.data.nodes.find(e => e.id == group.id)
	if (!position.color) position.color = '2'
	if (!position.label) position.label = 'Group'
	console.log("Position = group", position == group)

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
			click.next(e => e+1)
			if (click.value() == 5) remove()
		}
		return button(memo(() => words[click.value()], [click]), onclick)
	}
	let colorbuttons = ['.color-bar', ...[1, 2, 3, 4, 5, 6].map((i) => button('x', setcolorfn(i), { style: 'background-color: ' + colors[i-1] + ";" })), removeButton()] 
	let remove = () => {
		let i = data.data.nodes.findIndex(e => e == position)
		console.log('found', position, "at", i)
		data.data.nodes.splice(i, 1)
		draggable.remove()
	}


	let style = memo(() => `
		position: absolute;
		left: ${left.value()}px;
		top: ${top.value()}px;
		background-color: ${colors[parseInt(color.value())-1]};
		width: ${width.value()}px;
		height: ${height.value()}px
	`, [left, top, width, height, color])

	let resize = memo(() => `
		left:${width.value() + 10}px;
		top:${height.value() + 10}px;
`, [width, height])

	let resizewidth = memo(() => `
		left:${width.value() + 10}px;
		top:-10px;
`, [width])

	let resizewidthmiddle = memo(() => `
		left:${width.value() + 10}px;
		top:${height.value() / 4}px;
		height: ${height.value() / 2}px;
`, [width, height])

	let resizeheightmiddle = memo(() => `
		top:${height.value() + 10}px;
		left:${width.value() / 4}px;
		width: ${width.value() / 2}px;
`, [height, width])

	let resizeheight = memo(() => `
		top:${height.value() + 10}px;
		left:-10px;
`, [height])


	let resizer = dom(".absolute.flex-center.box.cur-se", { style: resize }, svgx(30))
	let resizerwidth = dom(".absolute.flex-center.box.cur-e", { style: resizewidth }, svgx(30))
	let resizerheight = dom(".absolute.flex-center.box.cur-s", { style: resizeheight }, svgx(30))
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
			value: position.label
		}],

		button("set", () => editingLabel.next(false))]

	let title = dom(['.label', memo(() => editingLabel.value() ? editLabel() : textLabel(), [editingLabel])])

	el = [".block.group", title]
	el = dom(el)
	draggable.appendChild(el)

	let onstart = () => {
		data.data.nodes.forEach((e) => {
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
	let position = data.data.nodes.find(e => e.id == block.id)
	if (!position) data.data.nodes.push(constructBlockData(block, 0))
	position = data.data.nodes.find(e => e.id == block.id)
	if (!position.color) position.color = '2'

	let updateFn = (data) => {
		let p = (data.nodes.find(e => e.id == block.id))
		if (!p) console.log("GONNNNE")
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
		background-color: ${colors[parseInt(color.value())-1]};
		left: ${left.value()}px;
		top: ${top.value()}px;
		width: ${width.value()}px;
		height: ${height.value()}px
	`, [left, top, width, height, color])

	let resize = memo(() => `
		left:${width.value() + 10}px;
		top:${height.value() + 10}px;
`, [width, height])

	let resizewidth = memo(() => `
		left:${width.value() + 10}px;
		top:-10px;
`, [width])

	let resizewidthmiddle = memo(() => `
		left:${width.value() + 10}px;
		top:${height.value() / 4}px;
		height: ${height.value() / 2}px;
`, [width, height])

	let resizeheightmiddle = memo(() => `
		top:${height.value() + 10}px;
		left:${width.value() / 4}px;
		width: ${width.value() / 2}px;
`, [height, width])

	let resizeheight = memo(() => `
		top:${height.value() + 10}px;
		left:-10px;
`, [height])


	let resizer = dom(".absolute.flex-center.box.cur-se", { style: resize }, svgx(30))
	let resizerwidth = dom(".absolute.flex-center.box.cur-e", { style: resizewidth }, svgx(30))
	let resizerheight = dom(".absolute.flex-center.box.cur-s", { style: resizeheight }, svgx(30))
	let resizerwidthmiddle = dom(".absolute.flex-center.box.cur-e", { style: resizewidthmiddle }, svgx(30))
	let resizerheightmiddle = dom(".absolute.flex-center.box.cur-s", { style: resizeheightmiddle }, svgx(30))

	let setcolorfn = i => () => color.next(i + "")
	let colorbuttons = ['.color-bar', ...[1, 2, 3, 4, 5, 6].map((i) => button('x', setcolorfn(i), { style: 'background-color: ' + colors[i-1] + ";" }))]
	let draggable = dom('.draggable', { style: style }, colorbuttons, resizer, resizerheight, resizerheightmiddle, resizerwidthmiddle)
	let el
	let image = block => ['img', { src: block.image?.large?.src }]
	let edit = false
	if (block.type == "Text") {
		let value = block.content.markdown
		let old = ''
		let textarea = md => {
			// on creation keep old value to reset
			old = value
			return dom([".block.text", saveButton, cancelButton, ["textarea", {
				onclick: (e) => {
					e.stopPropagation();
					e.stopImmediatePropagation()
				},
				oninput: e => value = e.target.value
			}, md]])
		}
		let mountResizers = () => {
			draggable.appendChild(resizer)
			draggable.appendChild(resizerwidth)
			draggable.appendChild(resizerheight)
			draggable.appendChild(resizerwidthmiddle)
			draggable.appendChild(resizerheightmiddle)
		}

		let editBlock = () => {
			edit = true
			draggable.innerHTML = ``;
			draggable.appendChild(textarea(value))
			mountResizers()
		}
		let saveBlock = () => {
			edit = false
			update_block(block.id, { content: value }).then(res => console.log(res))
			draggable.innerHTML = ``;
			draggable.appendChild(dom([".block.text", editOrTag, ...MD(value)])) // 
			mountResizers()
		}
		let cancelEdit = () => {
			value = old
			edit = false
			draggable.innerHTML = ``;
			draggable.appendChild(dom([".block.text", editOrTag, ...MD(value)])) // 
			mountResizers()
		}

		let saveButton = button("save", saveBlock)
		let editButton = button('edit', editBlock)
		let cancelButton = button('cancel', cancelEdit)
		let blockUserTag = ["p.tag", block.user.slug]
		let editOrTag = memo(() => block.user.slug == authslug.value() ? editButton : blockUserTag, [authslug])

		el = [".block.text", editOrTag, ...MD(value)]
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
		drag(resizer, { set_left: (v) => width.next(v), set_top: (v) => height.next(v) })
		// drag(resizerwidth, { set_left: (v) => width.next(v), set_top: () => null })
		drag(resizerheight, { set_left: () => null, set_top: (v) => height.next(v) })
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
		data.data = JSON.parse(state.dotcanvas.content.plain)
	}

	if (!data.data) {
		let nodes = blocks.filter(e => e.title != ".canvas").map(constructBlockData)
		data.data = { nodes, edges: [] }
	}
}

function intersectRect(r1, r2) {
	return !(r2.left > r1.right ||
		r2.right < r1.left ||
		r2.top > r1.bottom ||
		r2.bottom < r1.top);
}

let pointStart = reactive([0, 0])
let pointEnd = reactive([100, 100])

let renderBlocks = (blocks) => {
	// reset stuff
	// I think itll be a good idea to just do a page refresh
	// connections = []
	data.data = undefined
	let c = document.querySelector(".container")
	c ? c.remove() : null

	// try find a .canvas block
	updateData(blocks)
	blocks = processBlockForRendering(blocks)

	if (!mountDone) mount()

	let timer = reactive(0)
	setInterval(() => timer.next(e => e + 1), 500)

	let stylemmeo = memo(() => `
		transform-origin: ${canvasX.value() + window.innerWidth / 2}px ${canvasY.value() + window.innerHeight / 2}px;
		transform: translate(${canvasX.value() * -1}px, ${canvasY.value() * -1}px) scale(${canvasScale.value()}) ;
`, [canvasX, canvasY, canvasScale])


	try_auth()
	let blocksmapped = blocks.filter(e => e.type != 'group').map(blockEl)
	let groupRender = reactive(0)
	let groupmapped = memo(() => data.data.nodes.filter(e => e.type == 'group').map(groupEl), [groupRender])

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
		data.data.nodes.push(d)
		groupRender.next(e => e + 1)

	}

	let bigline = memo(() => svgrect(...pointStart.value(), ...pointEnd.value(), "red", 8), [pointStart, pointEnd])
	let stupidSVG = ['svg', { width: dimensions, height: dimensions }, bigline]

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
	let lineEls = memo(() => lines.value().map(f => svgline(...f, "white")), [lines])
	// Fix the leaks here...
	let svg = ['svg.line-canvas', { width: window.innerWidth, height: window.innerHeight }, lineEls]

	let nodes = [svg, slcurse, sls, sly, slx]
	let pos = (x, y) => `position: fixed; left: ${x}em; top: ${y}em; z-index: 9999;`

	let openbtn = button(">", () => { sidebarOpen.next(e => e == 'true' ? 'false' : 'true') }, { style: pos(1, 1) })
	let savebtn = button("save", () => {
		let content = JSON.stringify(data.data)
		if (state.dotcanvas.id) update_block(state.dotcanvas.id, { content, title: ".canvas" })
		else add_block(currentslug, '.canvas', content)
	}, { style: pos(3, 1), })

	document.body.appendChild(dom(['.nodes', ...nodes]))
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

	if (e.key == 'W') {
		addnode(keyPresser({ left: 150, top: 250, key: 'w' }))
	}

	if (e.key == 'A') {
		addnode(keyPresser({ left: 150, top: 250, key: 'a' }))
	}

	if (e.key == 'N') {
		let value = reactive(Math.random() * 55)
		addnode(reactiveEl({
			left: 150, top: 250, value
		}))
	}

	if (e.key == 'd' && e.metaKey) {
		e.preventDefault()
		let download_json = (json, file = 'data') => {
			let a = document.createElement("a");
			var json = JSON.stringify(json), blob = new Blob([json], { type: "octet/stream" }), url = window.URL.createObjectURL(blob);
			a.href = url;
			a.download = file + ".canvas";
			a.click();
			window.URL.revokeObjectURL(url);
		};
		// let obsidianable = {
		// 	nodes: data,
		// 	edged: []
		// }
		download_json(data.data, currentslug)
	}
}
document.onmousemove = (e) => {
	mouse.next({ x: parseFloat(e.clientX), y: parseFloat(e.clientY) })
}
document.ondragover = (e) => {
	e.preventDefault();
	console.log("BEING DRAGGED", e)
}

document.ondrop = e => {
	e.preventDefault();
	const fileItems = [...e.dataTransfer.files]
	fileItems.forEach((file) => {
		let reader = new FileReader();
		reader.onload = function(event) {
			processNewCanvas(event.target.result)
		};
		reader.readAsText(file);
	})
}

let processNewCanvas = str => {
	let d
	try {
		d = JSON.parse(str)
	} catch (e){
		console.log('failes', e)
	}

	let updateList = []
	if (d) {
		console.log("PARSED", d)
		// check each block and see if text updated
		d.nodes.forEach(b => {
			let f = data.data.nodes.find(e => e.id == b.id)
			if (b.type == 'text'){
				if (f &&f.text != b.text) {
					console.log('UPDATED: ', b.id,'\n', b.text, "\nOLD: ", f.text)
				}
			}
		})
	}
}

document.addEventListener("wheel", e => {
	if (e.metaKey) {
		canvasY.next(f => f + e.deltaY)
		canvasX.next(f => f + e.deltaX)
	}
	else { canvasScale.next(f => f - (e.deltaY / 2500)) }
})

// make this nodeable
set_channel(currentslug)

