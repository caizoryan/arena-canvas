import { memo, reactive } from "./hok.js"
export let authslug = reactive('')
export const dimensions = 10000

let t = localStorage.getItem('transform')
if (t) t=JSON.parse(t)
else t = {x: 0, y: 0, scale: 1}

export let mouse = reactive({ x: 0, y: 0 })
export let canvasX = reactive(t.x)
export let canvasY = reactive(t.y)
export let canvasScale = reactive(t.scale)


memo(() => {
	localStorage.setItem("transform", JSON.stringify({
		x: canvasX.value(),
		y: canvasY.value(),
		scale: canvasScale.value()
	}))

}, [canvasX, canvasY, canvasScale])

export let data = {data: undefined}

export let state = {
	connectionBuffer: undefined,
	dotcanvas: undefined,
	connections: []
}

export let dataSubscriptions = []
export let save_data = () => {
	localStorage.setItem("canvas", JSON.stringify(data.data))
	dataSubscriptions.forEach(fn => fn(data.data))
}
