import { dom } from "./dom.js"
import { reactive, memo } from "./hok.js"
import { drag } from "./drag.js"
import { MD } from "./md.js"

let dimensions = 10000
let a = localStorage.getItem("auth")
let auth = ''
if (a) auth = a
let headers = {
	"Content-Type": "application/json",
	Authorization: "Bearer " + auth,
}

let slug = 'list-are-na-api-possibilities'
let set_channel = slug => {
fetch("https://api.are.na/v3/channels/" + slug + "/contents?per=50&sort=position_desc", { headers })
		.then(res => {
			console.log(res.status)
			return res.json()
		})
		.then(res => render(res.data))
}

set_channel(slug)

// fetch("./data.json")
// 	.then(res => res.json())
// 	.then(res => data = res.nodes)


// let host = "http://localhost:3000/api/";
let host = "https://api.are.na/v2/"
export const update_block = async (block_id, body, slug, fuck = false) => {
	return fetch(host + `blocks/${block_id}`, {
		headers,
		method: "PUT",
		body: JSON.stringify(body),
	}).then((res) => {
		// if (fuck) { fuck_refresh(slug) }
		return res
	});
};

let data
// let d = localStorage.getItem("canvas")
// if (d) data = JSON.parse(d)
function round(value, precision) {
	var multiplier = Math.pow(10, precision || 0);
	return Math.round(value * multiplier) / multiplier;
}

let makeData = (e, i) => {
	let r1 = Math.random() * 850
	let r2 = Math.random() * 850
	let d = {
		id: e.id,
		x: (i % 8) * 400 + r1,
		y: (Math.floor(i / 8)) * 450 + r2,
		width: 300,
		height: 300,
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
let save_data = () => {
	localStorage.setItem("canvas", JSON.stringify(data))
}

function mapRange(value, inMin, inMax, outMin, outMax) {
	return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
}
let buffer

let inputConnector = (left, top, signal, position) => {
	let bufferkill = reactive("false")
	let colorx = memo(() => bufferkill.value() == 'false' ? '#fff2' : "yellow", [bufferkill])

	let style = `left: ${left}px; top: ${top}px;`
	let element_x = dom(['.connection.input', {
		style,
		onclick: () => {
			if (bufferkill.value() != 'false') {
				bufferkill.value().disconnect()
				bufferkill.next('false')
			}

			else if (buffer) {
				bufferkill.next(buffer)
				buffer.connectAsOutput(signal, position)
			}
		}
	}, svgx(30, colorx)])

	return element_x
}

let outputConnector = (left, top, signal, position) => {
	return dom(['.connection.output', {
		style: `top: ${top}px; right: ${left}px;`,
		onclick: () => {
			if (buffer) { buffer = undefined }
			else {
				buffer = createConnection()
				buffer.connectAsInput(signal, position)
			}
		}
	}, svgx(30)])
}


let slidercursor = ({
	left, top,
	width,
	height,
	min,
	max,
	value,
}) => {
	let mapx = (v) => mapRange(v, 0, width, min, max)
	let mapy = (v) => mapRange(v, 0, height, min, max)
	let scaled = width/dimensions
	//minimap doesn't work yet...
	let mappednodes = data.nodes.map(e => {
		let n = {}
		n.x = e.x * scaled
		n.y = e.y * scaled
		n.width = e.width*scaled
		n.height = e.height*scaled
		console.log("wtfff", e.x, e.y, scaled, n.x, n.y)
		return n
	}).map(e => {

		let style = `
position: absolute;
left: ${e.x}px;
top: ${e.y}px;
width: ${e.width}px;
height: ${e.height}px;
background-color:#0002; 
`
		return [".mini", {style}]
	})

	let y = reactive(value)
	let x = reactive(value)

	left = reactive(left)
	top = reactive(top)

	let inx_left = memo(() => left.value() + 15, [left])
	let inx_top = memo(() => top.value(), [top])

	let iny_left = memo(() => left.value() + 80, [left])
	let iny_top = memo(() => top.value(), [top])

	let outx_left = memo(() => left.value() + width + 5, [left])
	let outx_top = memo(() => top.value() + 40, [top])

	let outy_left = memo(() => left.value() + width + 5, [left])
	let outy_top = memo(() => top.value() + 80, [top])

	let connectinput_x = inputConnector(0, -30, x, [inx_left, inx_top])
	let connectinput_y = inputConnector(55, -30, y, [iny_left, iny_top])

	let connectoutput_x = outputConnector(-30, 10, x, [outx_left, outx_top])
	let connectoutput_y = outputConnector(-30, 40, y, [outy_left, outy_top])

	let style = memo(() => `
		left: ${left.value()}px;
		top: ${top.value()}px;
		height: ${height}px;
		width: ${width}px;
	`, [left, top])

	let stylememo = memo(() => `
		top: ${y.value()}px;
		left: ${x.value()}px;
		background-color: #fff0; 
`, [x, y])

	let cursor = dom(['.psuedo-cursor', { style: stylememo }], svgx(30))
	let el = dom(
		['.psuedo-container', { style: style },
			['.psuedo-slider',
				{ style: `height: ${height}px;width: ${width}px;` },
				...mappednodes,
				cursor, connectoutput_x, connectoutput_y,
				connectinput_x, connectinput_y,]])

	setTimeout(() => {
		let set_top = (v) => y.next(v)
		let set_left = (v) => x.next(v)
		drag(cursor, { set_left, set_top })
		drag(el, { set_left: (v) => left.next(v), set_top: (v) => top.next(v) })
	}, 100)

	return el
}
let sliderAxis = ({
	top, left,
	axis,
	width,
	height,
	min, max,
	value,
	input, output,
	label = ''
}) => {
	let dimensionmax = axis == 'horizontal' ? width : height
	let mapper = (v) => mapRange(v, 0, dimensionmax, min, max)
	let reversemapper = (v) => mapRange(v, min, max, 0, dimensionmax)

	left = reactive(left)
	top = reactive(top)

	let in_left = memo(() => left.value() + 5, [left])
	let in_top = memo(() => top.value() - 15, [top])

	let out_left = memo(() => left.value() + width + 5, [left])
	let out_top = memo(() => top.value() + height + 15, [top])

	let style = memo(() => `
		left:${left.value()}px;
		top:${top.value()}px;
		width: ${width}px;
		height: ${height}px;
`, [left, top])

	let x = reactive(reversemapper(value))
	if (input) input.subscribe(v => x.next(reversemapper(v)))
	if (output) x.subscribe(v => output.next(mapper(v)))

	let stylememo = memo(() => `
		left: ${axis == 'horizontal' ? x.value() : -8}px;
		top:  ${axis == 'vertical' ? x.value() : -8}px;`, [x])

	let connectinput = inputConnector(-8, -36, x, [in_left, in_top])
	let connectoutput = outputConnector(-8, height + 5, x, [out_left, out_top])

	let cursor = dom(['.psuedo-cursor.flex-center', { style: stylememo }, label])
	let el = dom(['.psuedo-slider', { style }, cursor, connectoutput, connectinput])

	setTimeout(() => {
		let set_left = (v) => axis == 'horizontal' ? x.next(v) : null
		let set_top = (v) => axis == 'vertical' ? x.next(v) : null

		drag(cursor, { set_left, set_top })
		drag(el, { set_left: (v) => left.next(v), set_top: (v) => top.next(v) })
	}, 100)

	return el
}

// connection:
// connectAsInput
// connectAsOutput

// createConnection ->
// will create a closure with a signal
// an input fn that writes to the signal
// and an output fn that subscribes to signal

let connections = []
let uuid = () => Math.random().toString(36).slice(-6);
function createConnection() {
	let signal = reactive(0)
	let disconnectInput, disconnectOutput
	let start, end
	let id = uuid
	let self = {
		line: () => {
			let l = []
			if (start && !end) l = [...start]
			else if (start && end) l = [...start, ...end]
			return l
		},
		connectAsInput: (v, position) => {
			if (position.isReactive) {
				start = position.value()
				position.subscribe(v => start = v)
			}
			else start = position
			signal.next(v.value())
			disconnectInput = v.subscribe(x => signal.next(x))
		},

		connectAsOutput: (v, position) => {
			if (position.isReactive) {
				end = position.value()
				position.subscribe(v => end = v)
			}

			else end = position

			v.next(signal.value())
			disconnectOutput = signal.subscribe(x => v.next(x))
			connections.push(self)
			buffer = undefined
		},

		disconnect: () => {
			// delete line
			disconnectInput()
			disconnectOutput()
			let us = connections.findIndex(v => v == self)
			if (us != -1) connections.splice(us, 1)
		}
	}
	return self
}

let sliderButtons = ({ style, width, height, min, max, divisions, value, setvalue, axis, input }) => {
	let dimensionmax = axis == 'horizontal' ? width : height
	let mapper = (v) => mapRange(v, 0, dimensionmax, min, max)
	let reversemapper = (v) => mapRange(v, min, max, 0, dimensionmax)

	let x = reactive(reversemapper(value))
	x.subscribe(v => setvalue(mapper(v)))
	if (input) input(v => x.next(reversemapper(v)))


	let each = (dimensionmax / divisions)

	let stylebtns = axis == 'horizontal' ? "width: " + each + "px;" : "height: " + each + "px;"

	let btns = Array(divisions).fill(0).map((_, i) =>
		['button', {
			style: stylebtns,
			onclick: () => x.next(i * each)
		}, round(mapper(i * each), 1) + "%"]
	)
	let el = dom(['.psuedo-slider', { style: ` ${style}; width: ${width}px;height: ${height}px;` }, ...btns])

	return el

}

let reactiveEl = ({ left, top, value }) => {
	let width = 80

	left = reactive(left)
	top = reactive(top)
	let out_left = memo(() => left.value() + width + 45, [left])
	let out_top = memo(() => top.value() + 5, [top])
	let in_left = memo(() => left.value() - 15, [left])
	let in_top = memo(() => top.value() + 5, [top])

	let input = inputConnector(-35, 0, value, [in_left, in_top])
	let output = outputConnector(-35, 0, value, [out_left, out_top])

	let style = memo(() => `
		left:${left.value()}px;
		top:${top.value()}px;
		width: ${width}px;
		padding: 1em;
`, [left, top])

	let el = dom(['div.psuedo-slider', { style },
		['div.psuedo-cursor',
			{ style: `left: 5px; top:0px; width: 50` },
			memo(() => round(value.value(), 5) + "", [value])], input, output])
	setTimeout(() => {
		drag(el, { set_left: (v) => left.next(v), set_top: (v) => top.next(v) })
	}, 100)
	return el

}

let keys = []
let keyPresser = ({ left, top, key }) => {
	let width = 80

	let inputvalue = reactive(0)
	let outputvalue = reactive(0)
	left = reactive(left)
	top = reactive(top)
	let out_left = memo(() => left.value() + width + 45, [left])
	let out_top = memo(() => top.value() + 5, [top])
	let in_left = memo(() => left.value() - 15, [left])
	let in_top = memo(() => top.value() + 5, [top])

	let input = inputConnector(-35, 0, inputvalue, [in_left, in_top])
	let output = outputConnector(-35, 0, outputvalue, [out_left, out_top])

	keys.push({
		key,
		fn: () => {
			outputvalue.next(Math.random())
			outputvalue.next(inputvalue.value())
		}
	})

	let style = memo(() => `
		left:${left.value()}px;
		top:${top.value()}px;
		width: ${width}px;
		padding: 1em;
`, [left, top])

	let el = dom(['div.psuedo-slider', { style },
		['div.psuedo-cursor',
			{ style: `left: 5px; top:0px; width: 50` }, key], input, output])
	setTimeout(() => {
		drag(el, { set_left: (v) => left.next(v), set_top: (v) => top.next(v) })
	}, 100)
	return el

}

let blockEl = block => {
	let position = data.nodes.find(e => e.id == block.id)
	if (!position) data.nodes.push(makeData(block, 0))
	position = data.nodes.find(e => e.id == block.id)

	let left = reactive(position.x)
	let top = reactive(position.y)
	let width = reactive(position.width)
	let height = reactive(position.height)

	left.subscribe(v => position.x = v)
	left.subscribe(save_data)
	top.subscribe(v => position.y = v)
	top.subscribe(save_data)

	width.subscribe(v => position.width = v)
	height.subscribe(v => position.height = v)
	height.subscribe(save_data)
	width.subscribe(save_data)


	let style = memo(() => `
		position: absolute;
		left: ${left.value()}px;
		top: ${top.value()}px;
		width: ${width.value()}px;
		height: ${height.value()}px
	`, [left, top, width, height])

	let resize = memo(() => `
left:${width.value()+10}px;
top:${height.value()+10}px;
`, [width, height])

	let resizewidth = memo(() => `
left:${width.value()+10}px;
top:-10px;
`, [width])

	let resizewidthmiddle = memo(() => `
left:${width.value()+10}px;
top:${height.value()/2}px;
`, [width, height])

	let resizeheightmiddle = memo(() => `
top:${height.value()+10}px;
left:${width.value()/2}px;
`, [height, width])

	let resizeheight = memo(() => `
top:${height.value()+10}px;
left:-10px;
`, [height])


	let resizer = dom(".absolute.flex-center.box.cur-se", { style: resize }, svgx(30))
	let resizerwidth = dom(".absolute.flex-center.box.cur-e", { style: resizewidth }, svgx(30))
	let resizerheight = dom(".absolute.flex-center.box.cur-s", { style: resizeheight }, svgx(30))

	let resizerwidthmiddle = dom(".absolute.flex-center.box.cur-e", { style: resizewidthmiddle }, svgx(30))

	let resizerheightmiddle = dom(".absolute.flex-center.box.cur-s", { style: resizeheightmiddle }, svgx(30))

	let draggable = dom('.draggable', { style: style }, resizer, resizerwidth, resizerheight, resizerheightmiddle, resizerwidthmiddle)
	let el
	let image = block => ['img', { src: block.image?.large?.src }]
	let edit = false

	if (block.type == "Text") {
		let value = block.content.markdown
		let old = ''
		let textarea = md => (old = value, dom([".block.text", save, cancel, ["textarea", {
			onclick: (e) => {
				e.stopPropagation();
				e.stopImmediatePropagation()
			}, oninput: e => value = e.target.value
		}, md]]))

		let editbtn = ["button.edit", {
			onclick: () => {
				edit = true
				draggable.innerHTML = ``;
				draggable.appendChild(textarea(value))
				draggable.appendChild(resizer)
				draggable.appendChild(resizerwidth)
				draggable.appendChild(resizerheight)

				draggable.appendChild(resizerwidthmiddle)
				draggable.appendChild(resizerheightmiddle)
			}
		}, "edit"]

		let save = ["button.save", {
			onclick: () => {
				edit = false
				update_block(block.id, { content: value }).then(res => console.log(res))
				draggable.innerHTML = ``;
				draggable.appendChild(dom([".block.text", editbtn, ...MD(value)])) // 
				draggable.appendChild(resizer)
				draggable.appendChild(resizerwidth)
				draggable.appendChild(resizerheight)
				draggable.appendChild(resizerwidthmiddle)
				draggable.appendChild(resizerheightmiddle)
			}
		}, "save"]

		let cancel = ["button", {
			onclick: () => {
				value = old
				edit = false
				draggable.innerHTML = ``;
				draggable.appendChild(dom([".block.text", editbtn, ...MD(value)])) // 
				draggable.appendChild(resizer)
				draggable.appendChild(resizerwidth)
				draggable.appendChild(resizerheight)
				draggable.appendChild(resizerwidthmiddle)
				draggable.appendChild(resizerheightmiddle)
			}
		}, "cancel"]

		el = [".block.text", editbtn, ...MD(value)]
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
		drag(draggable, { set_left, set_top, pan_switch: () => !edit })
		drag(resizer, { set_left: (v) => width.next(v), set_top: (v) => height.next(v) })
		drag(resizerwidth, { set_left: (v) => width.next(v), set_top: (v) => null })
		drag(resizerheight, { set_left: (v) => null, set_top: (v) => height.next(v) })

		drag(resizerwidthmiddle, { set_left: (v) => width.next(v), set_top: (v) => null })
		drag(resizerheightmiddle, { set_left: (v) => null, set_top: (v) => height.next(v) })
	}, 100)

	return draggable
}
let dawg = reactive({ x: 0, y: 0 })
let dotcanvas
let render = (blocks) => {
	data = undefined
	// try find a .canvas block
	dotcanvas = blocks.find(e => e.title == '.canvas')
	if (dotcanvas) { data = JSON.parse(dotcanvas.content.plain) }
	blocks = blocks.filter(e => e.title != ".canvas")
	blocks = blocks.filter(e => e.type != ".canvas")

	document.body.innerHTML = ''

	if (!data) {
		let nodes = blocks.filter(e => e.title != ".canvas").map(makeData)
		data = { nodes }
	}


	let w = 300
	let x = reactive(0)
	let y = reactive(0)
	// make this nodeable
	wheelfn = e => {
		if (e.metaKey){
			y.next(f => f +e.deltaY)
			x.next(f => f +e.deltaX)
		}
		else {
			scale.next(f => f - (e.deltaY/2500))
		}
	}
	let scale = reactive(1)
	let timer = reactive(0)
	setInterval(() => timer.next(e => e + 1), 500)

	let stylemmeo = memo(() => `
transform-origin: ${x.value() + window.innerWidth / 2}px ${y.value() + window.innerHeight / 2}px;
transform: translate(${x.value() * -1}px, ${y.value() * -1}px) scale(${scale.value()}) ;
`, [x, y, scale])

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
		height: w,
		width: 15,
		max: 2.5,
		value: 1,
		axis: 'vertical',
		input: scale,
		output: scale,
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
		input: x,
		output: x,
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
		input: y,
		output: y,
		label: "Y",
	})

	let funkypunky = reactiveEl({
		left: 100,
		top: 100,
		value: timer
	})

	let lines = memo(() => {
		let l = []
		if (buffer) l.push([buffer.line()[0], buffer.line()[1], dawg.value().x, dawg.value().y])
		connections.forEach(e => l.push(e.line()))
		return l
	}, [dawg])
	let query = ""
	let try_auth = () => {
		console.log("will try auth with", auth)
	}

	let open = reactive("false")
	let close = ["button", {
		onclick: () => {
			open.next(e => e == 'true' ? 'false' : 'true')
		}
	}, "close"]
	let openbtn = ["button", {
		style: 'position: fixed; left: 1em; top: 1em; z-index: 9999;', onclick: () => {
			open.next(e => e == 'true' ? 'false' : 'true')
		}
	}, ">"]
	let savebtn = ["button", {
		style: 'position: fixed; left: 3em; top: 1em; z-index: 9999;', onclick: () => {
			if (dotcanvas){
				let content = JSON.stringify(data, null, 2)
				update_block(dotcanvas.id, {content, title: ".canvas"})
			}

			else {
				
			}
		}
	}, "save"]

	let search = [".section.search", ["h4", "search"],
								["input", { oninput: (e) => query = e.target.value }],
								["button", {onclick: (e) => set_channel(query)}, "set"]]

	let authenticate = [".section.auth",
		["h4", "Authenticate"],
		["input", { oninput: (e) => auth = e.target.value.trim() }],
		["button", {
			onclick: (e) => {
				localStorage.setItem("auth", auth)
				try_auth()
			}
		}, "what"]]
	let sidebar = [".sidebar", { open: open, onclick: (e) => console.log("PLEASE", e.target) }, close, search, authenticate, ]
	let lineEls = memo(() => lines.value().map(f => svgline(...f, "white")), [lines])
	let svg = ['svg.line-canvas', { width: window.innerWidth, height: window.innerHeight }, lineEls]
	let blocksmapped = blocks.map(blockEl)
	let root = [".container", { style: stylemmeo }, ...blocksmapped]
	let nodes = [svg, slcurse, sls, funkypunky, sly, slx]

	document.body.appendChild(dom(['.nodes', ...nodes]))
	document.body.appendChild(dom(root))

	document.body.appendChild(dom(sidebar))
	document.body.appendChild(dom(openbtn))
	document.body.appendChild(dom(savebtn))
}

let addnode = node =>
	document.querySelector(".nodes").appendChild(node)

let wheelfn

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
		download_json(data)
	}
}
document.addEventListener("wheel", (e) => {
	if (wheelfn) wheelfn(e)
})


let svgline = (x1, y1, x2, y2, stroke = "blue") => ['line', { x1, y1, x2, y2, stroke, "stroke-width": 4 }]
let svgx = (size, fill = 'blue') => ['svg', { width: size, height: size },
	svgline(0, 0, size, size, fill),
	svgline(size, 0, 0, size, fill),]

document.onmousemove = (e) => {
	dawg.next({ x: parseFloat(e.clientX), y: parseFloat(e.clientY) })
}
