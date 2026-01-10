import { reactive, memo } from "./chowk.js"

let t = localStorage.getItem('transform')
if (t) t=JSON.parse(t)
else t = {x: 0, y: 0, scale: 1}

export let mouse = reactive({ x: 0, y: 0 })
export let canvasX = reactive(t.x)
export let canvasY = reactive(t.y)
export let canvasScale = reactive(t.scale)
