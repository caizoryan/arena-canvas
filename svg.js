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
let value = (v) => typeof v == 'number' ? v : v.isReactive ? v.value() : v

export let svgcurveline = (
  x1, y1,
  x2, y2,
  stroke = "blue",
  width = 4,
  curve = 40,
) => [
  'path',
  {
    d: `M ${value(x1)} ${value(y1)}
        C ${value(x1) + curve} ${value(y1)},
          ${value(x2) - curve} ${value(y2)},
          ${value(x2)} ${value(y2)}`,
		fill: 'none',
    stroke,
    'stroke-width': width
  }
]

export let svgArrow = (side, width, height, stroke = 'blue', weight = 3) => {
	if (!height) height = width

	let midX = width / 2
	let midY = height / 2

	switch (side) {
		case 'e': // →
			return ['svg', { width, height },
				// shaft
				svgline(0, midY, width, midY, stroke, weight),
				// head
				svgline(width - midY, 0, width, midY, stroke, weight),
				svgline(width - midY, height, width, midY, stroke, weight),
			]

		case 'w': // ←
			return ['svg', { width, height },
				svgline(width, midY, 0, midY, stroke, weight),
				svgline(midY, 0, 0, midY, stroke, weight),
				svgline(midY, height, 0, midY, stroke, weight),
			]

		case 'n': // ↑
			return ['svg', { width, height },
				svgline(midX, height, midX, 0, stroke, weight),
				svgline(0, midX, midX, 0, stroke, weight),
				svgline(width, midX, midX, 0, stroke, weight),
			]

		case 's': // ↓
			return ['svg', { width, height },
				svgline(midX, 0, midX, height, stroke, weight),
				svgline(0, height - midX, midX, height, stroke, weight),
				svgline(width, height - midX, midX, height, stroke, weight),
			]
	}
}
