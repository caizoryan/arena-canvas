// Arrange blocks that overlap groups after a completed canvas drag.
//
// Group and block geometry lives in the local canvas node model, rather than
// in the corresponding Arena block. This plugin therefore works entirely on
// node snapshots and writes geometry through the controller.

const intersects = (group, node) => !(
	group.x + group.width <= node.x ||
	group.x >= node.x + node.width ||
	group.y + group.height <= node.y ||
	group.y >= node.y + node.height
);

const geometryValue = (node, key) => Number(node?.[key]);

const hasGeometry = (node) =>
	["x", "y", "width", "height"].every((key) =>
		Number.isFinite(geometryValue(node, key))
	);

const compareMembers = (a, b) =>
	geometryValue(a, "y") - geometryValue(b, "y") ||
	geometryValue(a, "x") - geometryValue(b, "x") ||
	String(a.id).localeCompare(String(b.id));

const sameGeometry = (node, next) =>
	["x", "y", "width", "height"].every((key) => node[key] == next[key]);

const layoutGroup = (group, nodes) => {
	if (!hasGeometry(group)) return [];

	// Take the complete membership snapshot before producing any changes. This
	// is important when a block's new position would otherwise affect whether a
	// later block still intersects the group.
	let members = nodes
		.filter((node) => node.type != "group" && hasGeometry(node))
		.filter((node) => intersects(group, node))
		.sort(compareMembers);

	if (!members.length) return [];

	// The first block in the requested ordering determines the dimensions for
	// every block in this group.
	let blockWidth = geometryValue(members[0], "width");
	let blockHeight = geometryValue(members[0], "height");
	let requiredHeight = members.length * blockHeight;

	let changes = [];
	members.forEach((node, index) => {
		let next = {
			id: node.id,
			x: geometryValue(group, "x"),
			y: geometryValue(group, "y") + index * blockHeight,
			width: blockWidth,
			height: blockHeight,
		};
		if (!sameGeometry(node, next)) changes.push(next);
	});

	// Groups only grow. Existing extra space is preserved.
	let nextGroup = {
		id: group.id,
		x: group.x,
		y: group.y,
		width: Math.max(geometryValue(group, "width"), blockWidth),
		height: Math.max(geometryValue(group, "height"), requiredHeight),
	};
	if (!sameGeometry(group, nextGroup)) changes.push(nextGroup);

	return changes;
};

const GroupLayout = {
	id: "group-layout",
	name: "Group layout",
	description: "Stacks intersecting blocks vertically and normalizes their size after a drag.",

	setup(controller) {
		return controller.registerHook("canvas:drag-end", () => {
			let nodes = controller.getNodes();
			let groups = nodes.filter((node) => node.type == "group");
			if (!groups.length) return;

			// Re-evaluate every group. This handles both sides of a move when a
			// block leaves one group and enters another, and also keeps groups
			// consistent after moving or resizing a group itself.
			let changesById = new Map();
			groups.forEach((group) => {
				layoutGroup(group, nodes).forEach((change) => {
					// Overlapping groups are resolved deterministically by node order:
					// the later group in the canvas node list wins for a shared block.
					changesById.set(String(change.id), change);
				});
			});

			if (!changesById.size) return;
			controller.updateNodesGeometry([...changesById.values()], {
				undoLabel: "Arrange group",
			});
		});
	},
};

export default GroupLayout;
