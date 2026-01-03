import { reactive } from "./hok.js"
export let authslug = reactive('')
export const dimensions = 10000

export let mouse = reactive({ x: 0, y: 0 })
export let canvasX = reactive(0)
export let canvasY = reactive(0)
export let canvasScale = reactive(1)

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
