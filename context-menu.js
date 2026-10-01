import { dom } from "./dom.js";

// A single, app-owned context menu. Plugins contribute items through the
// controller. On a right-click the menu is "scheduled": rendering is deferred
// by one macrotask so every listener in the same event turn (including nested
// plugin handlers that stop propagation) gets a chance to add items.

const GROUP_ORDER = ["block", "selection", "clipboard"];

let pending = null;
let flushTimer = null;

let openMenuElement = null;
let openMenuCleanup = null;

const clearFlushTimer = () => {
	if (flushTimer == null) return;
	clearTimeout(flushTimer);
	flushTimer = null;
};

const dismissOpenMenu = () => {
	if (openMenuCleanup) {
		openMenuCleanup();
		openMenuCleanup = null;
	}
	if (openMenuElement) {
		openMenuElement.remove();
		openMenuElement = null;
	}
};

const toItems = (value) =>
	Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];

const groupRank = (group) => {
	let index = GROUP_ORDER.indexOf(group);
	return index == -1 ? GROUP_ORDER.length + 1 : index;
};

const sortItems = (items) =>
	items
		.map((item, index) => ({ item, index }))
		.sort((a, b) => {
			let rank = groupRank(a.item.group) - groupRank(b.item.group);
			if (rank) return rank;

			let group = String(a.item.group ?? "").localeCompare(
				String(b.item.group ?? ""),
			);
			if (group) return group;

			let priority = (Number(b.item.priority) || 0) -
				(Number(a.item.priority) || 0);
			if (priority) return priority;

			return a.index - b.index;
		})
		.map((entry) => entry.item);

const menuItem = (item, session) => {
	let attributes = {
		type: "button",
		role: "menuitem",
		onclick: (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (item.disabled) return;
			if (!item.keepOpen) dismissOpenMenu();
			try {
				item.onSelect?.({
					event: session.event,
					blockId: session.blockId,
					node: session.node,
					menu: session,
				});
			} catch (error) {
				console.error("Context menu item failed", error);
			}
		},
	};
	if (item.disabled) attributes.disabled = "";
	if (item.title) attributes.title = item.title;

	let tag = item.danger
		? "button.context-menu-item.danger"
		: "button.context-menu-item";

	return dom([tag, attributes, item.label]);
};

const buildMenuItems = (items, session) => {
	let sorted = sortItems(items);
	let children = [];
	let lastGroup;

	sorted.forEach((item) => {
		if (item.type == "separator") {
			children.push(dom(["div.context-menu-separator"]));
			return;
		}
		if (item.type == "label") {
			children.push(dom(["div.context-menu-label", item.label]));
			return;
		}

		if (lastGroup != undefined && item.group != lastGroup) {
			children.push(dom(["div.context-menu-separator"]));
		}
		lastGroup = item.group;

		children.push(menuItem(item, session));
	});

	return children;
};

const focusableItems = (menu) =>
	Array.from(menu.querySelectorAll(".context-menu-item")).filter(
		(element) => !element.disabled,
	);

const placeMenu = (menu, session) => {
	let margin = 8;
	let x = session.event?.clientX ?? 0;
	let y = session.event?.clientY ?? 0;

	menu.style.left = `${x}px`;
	menu.style.top = `${y}px`;
	menu.style.visibility = "";

	let rect = menu.getBoundingClientRect();
	let left = x;
	let top = y;

	if (left + rect.width > window.innerWidth - margin) {
		left = Math.max(margin, window.innerWidth - margin - rect.width);
	}
	if (top + rect.height > window.innerHeight - margin) {
		top = Math.max(margin, window.innerHeight - margin - rect.height);
	}

	menu.style.left = `${left}px`;
	menu.style.top = `${top}px`;
};

const renderMenu = (session, items) => {
	dismissOpenMenu();

	let menu = dom([
		"div.context-menu",
		{
			role: "menu",
			tabindex: -1,
			oncontextmenu: (event) => event.preventDefault(),
		},
		...buildMenuItems(items, session),
	]);
	menu.style.position = "fixed";
	menu.style.left = "0px";
	menu.style.top = "0px";
	menu.style.visibility = "hidden";

	document.body.appendChild(menu);
	placeMenu(menu, session);

	let onPointerDown = (event) => {
		if (!menu.contains(event.target)) dismissOpenMenu();
	};
	let onKeyDown = (event) => {
		if (event.key == "Escape") {
			event.stopPropagation();
			dismissOpenMenu();
			return;
		}

		let focusable = focusableItems(menu);
		if (!focusable.length) return;

		let currentIndex = focusable.indexOf(document.activeElement);
		if (event.key == "ArrowDown") {
			event.preventDefault();
			focusable[(currentIndex + 1) % focusable.length].focus();
		} else if (event.key == "ArrowUp") {
			event.preventDefault();
			focusable[
				(currentIndex - 1 + focusable.length) % focusable.length
			].focus();
		} else if (event.key == "Enter" || event.key == " ") {
			if (currentIndex != -1) {
				event.preventDefault();
				focusable[currentIndex].click();
			}
		}
	};
	let onScrollOrResize = () => dismissOpenMenu();
	let onBlur = () => dismissOpenMenu();

	document.addEventListener("pointerdown", onPointerDown, true);
	document.addEventListener("keydown", onKeyDown, true);
	window.addEventListener("scroll", onScrollOrResize, true);
	window.addEventListener("resize", onScrollOrResize);
	window.addEventListener("blur", onBlur);

	openMenuElement = menu;
	openMenuCleanup = () => {
		document.removeEventListener("pointerdown", onPointerDown, true);
		document.removeEventListener("keydown", onKeyDown, true);
		window.removeEventListener("scroll", onScrollOrResize, true);
		window.removeEventListener("resize", onScrollOrResize);
		window.removeEventListener("blur", onBlur);
	};

	menu.focus?.();
};

const flush = () => {
	clearFlushTimer();
	let session = pending;
	pending = null;
	if (!session) return;

	let items = session.items.filter(Boolean);
	if (!items.length) return;

	renderMenu(session, items);
};

const scheduleFlush = () => {
	clearFlushTimer();
	flushTimer = setTimeout(flush, 0);
};

const createSession = (context = {}) => {
	let session = {
		event: context.event,
		blockId: context.blockId,
		node: context.node,
		source: context.source,
		items: [],
		add: (value) => {
			toItems(value).forEach((item) => {
				if (item.id) {
					let index = session.items.findIndex(
						(existing) => existing?.id == item.id,
					);
					if (index != -1) session.items[index] = item;
					else session.items.push(item);
				} else {
					session.items.push(item);
				}
			});
			scheduleFlush();
			return session;
		},
		remove: (id) => {
			session.items = session.items.filter((item) => item?.id != id);
			return session;
		},
		setItems: (value) => {
			session.items = toItems(value);
			scheduleFlush();
			return session;
		},
		dismiss: () => {
			if (pending === session) {
				clearFlushTimer();
				pending = null;
			}
			dismissOpenMenu();
		},
	};

	return session;
};

export const scheduleContextMenu = (context = {}) => {
	// Merge into the in-flight session when it belongs to the same event so all
	// listeners in this turn contribute to one menu.
	if (pending && (!context.event || pending.event === context.event)) {
		return pending;
	}

	if (pending) flush();

	pending = createSession(context);
	scheduleFlush();
	return pending;
};

export const addContextMenuItem = (value, options = {}) => {
	let session = pending;
	if (
		!session ||
		(options.event && session.event && session.event !== options.event)
	) {
		session = scheduleContextMenu(options);
	}
	return session.add(value);
};

export const dismissContextMenu = () => {
	clearFlushTimer();
	pending = null;
	dismissOpenMenu();
};
