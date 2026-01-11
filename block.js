import { update_block } from "./arena.js"
import { reactive, memo } from "./chowk.js"
import { dom } from "./dom.js"
import { drag } from "./drag.js"
import { MD } from "./md.js"
import { notificationpopup } from "./notification.js"
import { getNodeLocation, store, subscribeToId, state, addNode } from "./state.js"
import { svgx } from "./svg.js"



// ---------
// Utilities
// ~~~~~~~~~
const uuid = () => Math.random().toString(36).slice(-6);
const button = (t, fn, opts = {}) => ['button', { onclick: fn, ...opts }, t]
const unwrap = t => t.isReactive ? t.value() : t
const CSSTransform = (x, y, width, height) => `
		position: absolute;
		left: ${unwrap(x)}px;
		top: ${unwrap(y)}px;
		width: ${unwrap(width)}px;
		height: ${unwrap(height)}px;`

const Transform = (x, y, width, height) => ({ x, y, width, height })
const Color = i => 'background-color: var(--b' + i + ');'
const isRectContained = (rect1, rect2) => {
	return (
		rect2.x >= rect1.x &&
		rect2.y >= rect1.y &&
		rect2.x + rect2.width <= rect1.x + rect1.width &&
		rect2.y + rect2.height <= rect1.y + rect1.height
	);
}
const convertBlockToV3 = block => {
	if (block.class) {
		block.type = block.class
		if (block.type == 'Text') {
			block.content = { markdown: block.content, }
		}
		// if has image the change url to src or whatever
	}

	if (block.type == 'Channel') block.id = 'c' + block.id

	return block
}

// Reactive interface:
// ~> (to plug into the store)
// ~~~~~~~~~~~~~~~~~~~
let R = (location, id) => key => ({
	isReactive: true,
	value: () => store.get(location.concat([key])),
	next: (v) => store.tr(location, 'set', [key, v]),
	subscribe: (fn) => subscribeToId(id, [key], fn)
})

let groupTitleLabel = group => {
	let location = getNodeLocation(group.id)
	let r = R(location, group.id)
	let label = r('label')

	let editingLabel = reactive(false)
	let textLabel = () => ['h4', { onclick: () => { editingLabel.next(true) } }, label]
	let editLabel = () => ['div', ['input',
		{
			oninput: (e) => { label.next(e.target.value) },
			onkeydown: (e) => {
				if (e.key == 'Enter') editingLabel.next(false)
				if (e.key == 'Escape') editingLabel.next(false)
			},
			value: label
		}],

		button("set", () => editingLabel.next(false))]

	let title = dom(['.label', memo(() => editingLabel.value() ? editLabel() : textLabel(), [editingLabel])])

	return title
}
let colorBars = node => {
	let r = R(getNodeLocation(node.id), node.id)
	let color = r('color')
	let setcolorfn = i => () => color.next(i + "")
	let colorbuttons = ['.color-bar', ...[1, 2, 3, 4, 5, 6].map((i) => button('x', setcolorfn(i), { style: 'background-color: var(--b' + i + ");" }))]
	return colorbuttons
}

export function GroupElement(group) {
	// Convert From  v3 to v2 incase
	let r = R(getNodeLocation(group.id), group.id)
	let anchored = []

	let left = r('x')
	let top = r('y')
	let color = r('color')
	let height = r('height')
	let width = r('width')

	let style = memo(() =>
		CSSTransform(left, top, width, height) + Color(color.value())
		, [left, top, width, height, color])


	let onstart = () => {
		// saves this location for undo
		store.startBatch()
		left.next(left.value())
		top.next(top.value())
		width.next(width.value())
		height.next(height.value())

		store.get(['data', 'nodes']).forEach((e, i) => {
			if (isRectContained(
				Transform(
					left.value(), top.value(),
					width.value(), height.value()), e)
			) {
				let item = {
					blockLocation: ['data', 'nodes', i],
					position: { x: e.x, y: e.y },
					offset: {
						x: e.x - left.value(),
						y: e.y - top.value(),
					}
				}
				anchored.push(item)
			}
		})

		anchored.forEach((e, i) => {
			store.tr(e.blockLocation, 'set', ['x', e.position.x])
			store.tr(e.blockLocation, 'set', ['y', e.position.y])
		})

		store.endBatch()
		store.pauseTracking()
	}
	let onend = () => {
		store.resumeTracking()
		anchored = []
	}

	let edges = resizers(left, top, width, height, { onstart, onend })
	let el = dom('.draggable.node.group', { style }, colorBars(group), groupTitleLabel(group), ...edges)

	setTimeout(() => {
		drag(el, {
			onstart,
			onend,
			set_position: (x, y) => {
				left.next(x)
				top.next(y)

				anchored.forEach((e) => {
					store.tr(e.blockLocation, 'set', ['x', x + e.offset.x])
					store.tr(e.blockLocation, 'set', ['y', y + e.offset.y])
				})
			},
		})
	}, 50)

	return el
}

// ------------------
// Block and Group El
// ------------------
export function BlockElement(block) {
	// Convert From  v3 to v2 incase
	block = convertBlockToV3(block)
	let location = getNodeLocation(block.id)

	if (!location) {
		let newNode = constructBlockData(block, 0)
		addNode(newNode)
		location = getNodeLocation(block.id)
	}

	let r = R(location, block.id)

	let left = r('x')
	let top = r('y')
	let color = r('color')
	let height = r('height')
	let width = r('width')

	let style = memo(() =>
		CSSTransform(left, top, width, height)
		+ Color(color.value()),
		[left, top, width, height, color])

	let el, components, attributes

	switch (block.type) {
		case "Text":
			[el, components, attributes] = TextBlock(block); break;
		case "Image":
			[el, components, attributes] = ImageBlock(block); break;
		case "Embed":
			[el, components, attributes] = EmbedBlock(block); break;
		case "Attachment":
			[el, components, attributes] = AttachmentBlock(block); break;
		case "Link":
			[el, components, attributes] = LinkBlock(block); break;
		case "Channel":
			[el, components, attributes] = Channel(block); break;
	}

	let t = ['.top-bar', colorBars(block)]

	if (components && components["edit-controls"]) {
		t.push(components["edit-controls"])
	}

	let b = ['.bottom-bar', ...Object.values(BasicComponents(block))]

	let onstart = () => {
		console.log('id', store.get(getNodeLocation(block.id)))
		store.startBatch()
		// saves this location for undo
		left.next(left.value())
		top.next(top.value())
		width.next(width.value())
		height.next(height.value())
		store.endBatch()

		store.pauseTracking()
	}

	let onend = () => store.resumeTracking()

	let edges = resizers(left, top, width, height, { onstart, onend })
	el = dom('.draggable.node',
		{ style, "block-id": block.id, ...attributes },
		t, el, ...edges, b,)

	setTimeout(() => {
		drag(el, {
			onstart,
			onend,
			pan_switch: () => attributes ? !attributes.edit.value() : true,
			set_position: (x, y) => {
				left.next(x)
				top.next(y)
			},
		})
	}, 50)

	return el
}

const resizers = (left, top, width, height, opts = {}) => {
	let MainCorner = dom(".absolute.flex-center.box.cur-se", {
		style: memo(() => CSSTransform(
			width.value() - 15,
			height.value() - 15,
			30, 30
		), [width, height])
	}, svgx(30))
	let WidthMiddle = dom(".absolute.flex-center.box.cur-e", {
		style: memo(() => CSSTransform(
			width.value() - 15,
			height.value() / 4,
			30,
			height.value() / 2), [width, height])
	}, svgx(30))
	let HeightMiddle = dom(".absolute.flex-center.box.cur-s", {
		style: memo(() => CSSTransform(
			width.value() / 4,
			height.value() - 15,
			width.value() / 2,
			30), [width, height])
	}, svgx(30))

	setTimeout(() => {
		drag(MainCorner, {
			set_position: (x, y) => {
				width.next(x)
				height.next(y)
			},
			...opts,
		})
		drag(WidthMiddle, {
			set_left: (v) => width.next(v), set_top: () => null, ...opts,
		})
		drag(HeightMiddle, {
			set_left: () => null, set_top: (v) => height.next(v), ...opts,
		})
	}, 100)

	return [MainCorner, WidthMiddle, HeightMiddle]
}

const TextBlock = (block) => {
	let root = dom('.block')
	let child = dom(['.block.text', ...MD(block.content.markdown)])
	root.appendChild(child)

	let attributes = {
		edit: reactive(false)
	}

	let owned = memo(() => state.authSlug.value() == block.user?.slug,
		[state.authSlug])

	let value = block.content?.markdown
	let old = ''
	let wc = reactive(value?.split(" ").length)
	let reset = () => root.innerHTML = ''

	let editBlock = (e) => {
		e.stopImmediatePropagation()
		e.stopPropagation()
		if (attributes.edit.value()) return
		attributes.edit.next(true)
		reset()
		child = dom(['.block.text', textarea(value)])
		root.appendChild(child)
	}
	attributes.ondblclick = editBlock
	let editButton = button('edit', editBlock)

	let saveBlock = () => {
		attributes.edit.next(false)
		update_block(block.id, { content: value })
			.then(res => {
				if (res.status == 204) notificationpopup("Updated 👍")
				else if (res.status == 401) notificationpopup("Failed: Unauthorized :( ", true)
				else notificationpopup("Failed :( status: " + res.status, true)
			})
		reset()

		child = dom(['.block.text', ...MD(value)])
		root.appendChild(child)
	}
	let saveButton = dom(button("save", saveBlock))

	let cancelEdit = () => {
		setValue(old)
		attributes.edit.next(false)
		reset()
		root.appendChild(dom([".block.text", ...MD(value)]))
	}
	let cancelButton = dom(button('cancel', cancelEdit))

	let blockUserTag = ["p.tag", block.user?.slug]

	let editOrTagOrSave = memo(() => attributes.edit.value()
		? owned ? [saveButton, cancelButton] : [cancelButton]
		: owned && block.type == 'Text'
			? [editButton]
			: [blockUserTag],
		[state.authSlug, attributes.edit])

	let setValue = (t) => {
		wc.next(t.split(' ').length)
		value = t
	}

	let textarea = md => {
		old = value
		return dom(["textarea", {
			oninput: e => setValue(e.target.value),
			onkeydown: e => {
				if (e.key == 's' && (e.metaKey || e.ctrlKey)) saveBlock()
			}
		}, md])
	}

	let comps = {
		"edit-controls": editOrTagOrSave,
	}

	return [root, comps, attributes]
}
const ImageBlock = (block) => {
	let link = block.image?.large?.src || block.image?.large?.url
	return [['.block.image', ['img', { src: link }]], {}, {}]
}
const LinkBlock = ImageBlock
const EmbedBlock = ImageBlock
const AttachmentBlock = ImageBlock

const Channel = block => {
	return [[".block.channel",
		['h2', block.title],
		['h4', ['strong', block.slug]],
		['p', ['a', { href: "#" + block.slug }, button('Open in Canvas')]],
		['p', ['a',
			{ href: "https://are.na/channel/" + block.slug },
			button('View on Are.na')]
		], {}, {}]
	]
}

const BasicComponents = (block) => {
	let copyLink = button("copy", (e) => {
		let link = "https://are.na/block/" + block.id
		if (e.metaKey) link = `[title](${link})`
		navigator.clipboard.writeText(link)
	})

	let jumpToArena = button("", (e) => {
		let link = "https://are.na/block/" + block.id
		window.open(link, '_blank').focus();
	})

	return {
		'copy-link': copyLink,
		'jump-to-are.na': jumpToArena
	}
}

export let constructBlockData = (e, i) => {
	let d = {
		id: e.id,
		width: 300,
		height: 300,
		color: '1'
	}
	if (typeof i == 'number') {
		d.x = (i % 8) * 400
		d.y = (Math.floor(i / 8)) * 450
	}
	else {
		d.x = i.x
		d.y = i.y
		d.width = i.width
		d.height = i.height
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

export let constructGroupData = (x, y, width, height) => {
	let d = {
		type: 'group',
		label: "Group",
		id: 'group-' + uuid(),
		x, y, width, height,
		color: '6',
	}

	return d
}
