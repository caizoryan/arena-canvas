export let svgrect = (x1, y1, x2, y2, stroke = "blue", width = 4) =>
	['rect', {
		x: Math.min(x1, x2), y: Math.min(y1, y2),
		width: Math.abs(x2 - x1),
		height: Math.abs(y2 - y1),
		stroke,
		fill: '#fff1',
		"stroke-width": width
	}]
export let svgline = (x1, y1, x2, y2, stroke = "blue", width = 4) => ['line', { x1, y1, x2, y2, stroke, "stroke-width": width }]
export let svgx = (width, height, fill = 'blue', weight = 4) => {
	if (!height) height = width
	return ['svg', { width, height },
		svgline(0, 0, width, height, fill, weight),
		svgline(width, 0, 0, height, fill, weight),]
}
