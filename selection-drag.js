let handlers;

export let registerSelectionDrag = (next) => {
	handlers = next;
};

export let selectionDrag = {
	start: (...args) => handlers?.start(...args) ?? false,
	setPosition: (...args) => handlers?.setPosition(...args),
	end: (...args) => handlers?.end(...args),
};
