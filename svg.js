let randoms = Array(10000).fill(0).map((e) => Math.random());
export function pixelatedLine(
	x1,
	y1,
	x2,
	y2,
	stroke = "blue",
	width = 2,
	dash = 0,
	attr = {},
	options = {},
) {
	const {
		step = 12, // size of each "pixel" step
		jitter = 15, // randomness per step
		seed = randoms[1],
	} = options;

	// deterministic-ish randomness if desired
	let rand = seed;
	const random = () => (rand = (rand * 9301 + 49297) % 233280) / 233280;

	const points = [];
	let x = x1;
	let y = y1;

	points.push(`${x},${y}`);

	const dx = x2 - x1;
	const dy = y2 - y1;
	const steps = Math.max(Math.abs(dx), Math.abs(dy)) / step;

	for (let i = 0; i < steps; i++) {
		// Move either horizontally or vertically (pixel style)
		if (Math.abs(dx) > Math.abs(dy)) {
			x += step * Math.sign(dx);
			y += (random() - 0.5) * jitter * 2;
		} else {
			y += step * Math.sign(dy);
			x += (random() - 0.5) * jitter * 2;
		}

		points.push(`${Math.round(x)},${Math.round(y)}`);
	}

	points.push(`${x2},${y2}`);

	return [
		"polyline",
		{
			stroke,
			points: points.join(" "),
			fill: "none",
			"shape-rendering": "crispEdges",
			"marker-start": "url(#x)",
			"marker-end": "url(#arrow)",
			"stroke-width": width,
			"stroke-dasharray": dash,
			...attr,
		},
	];
}
export let svgrectnormal = (
	x,
	y,
	width,
	height,
	stroke = "blue",
	strokewidth = 4,
) => {
	// TODO: Move the memo outside and send inside
	return ["rect", {
		x,
		y,
		width,
		height,
		stroke,
		fill: "#fff1",
		"stroke-width": strokewidth,
	}];
};
export let svgrect = (x1, y1, x2, y2, stroke = "blue", width = 4) => ["rect", {
	x: Math.min(x1, x2),
	y: Math.min(y1, y2),
	width: Math.abs(x2 - x1),
	height: Math.abs(y2 - y1),
	stroke,
	fill: "#fff1",
	"stroke-width": width,
}];
export let svgline = (
	x1,
	y1,
	x2,
	y2,
	stroke = "blue",
	width = 2,
	dash = 0,
	attr = {},
) => ["line", {
	x1,
	y1,
	x2,
	y2,
	stroke,
	"marker-start": "url(#x)",
	"marker-end": "url(#arrow)",
	"stroke-width": width,
	"stroke-dasharray": dash,
	...attr,
}];
export let svgx = (width, height, fill = "blue", weight = 2) => {
	if (!height) height = width;
	return [
		"svg",
		{ width, height },
		svgline(0, 0, width, height, fill, weight),
		svgline(width, 0, 0, height, fill, weight),
	];
};

export let svgArrow = (
	side,
	svgWidth,
	svgHeight,
	stroke = "blue",
	weight = 1.5,
) => {
	if (!svgHeight) svgHeight = svgWidth;

	let width = svgWidth - weight;
	let height = svgHeight - weight;
	let midX = width / 2;
	let midY = height / 2;

	switch (side) {
		case "e": // →
			return [
				"svg",
				{ width, height },
				// shaft
				svgline(
					weight,
					midY,
					width,
					midY,
					stroke,
					weight,
				),
				// head
				svgline(
					width - midY,
					weight,
					width,
					midY,
					stroke,
					weight,
				),
				svgline(
					width - midY,
					height,
					width,
					midY,
					stroke,
					weight,
				),
			];

		case "w": // ←
			return [
				"svg",
				{ width, height },
				svgline(
					width,
					midY,
					weight,
					midY,
					stroke,
					weight,
				),
				svgline(
					midY,
					weight,
					weight,
					midY,
					stroke,
					weight,
				),
				svgline(
					midY,
					height,
					weight,
					midY,
					stroke,
					weight,
				),
			];

		case "n": // ↑
			return [
				"svg",
				{ width, height },
				svgline(
					midX,
					height,
					midX,
					weight,
					stroke,
					weight,
				),
				svgline(
					weight,
					midX,
					midX,
					weight,
					stroke,
					weight,
				),
				svgline(
					width,
					midX,
					midX,
					weight,
					stroke,
					weight,
				),
			];

		case "s": // ↓
			return [
				"svg",
				{ width, height },
				svgline(
					midX,
					weight,
					midX,
					height,
					stroke,
					weight,
				),
				svgline(
					weight,
					height - midX,
					midX,
					height,
					stroke,
					weight,
				),
				svgline(
					width,
					height - midX,
					midX,
					height,
					stroke,
					weight,
				),
			];
	}
};
