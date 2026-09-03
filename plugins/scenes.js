import { reactive } from "../chowk.js";

const isScenesObject = (value) =>
	value && typeof value == "object" && !Array.isArray(value);

const Scenes = {
	id: "scenes",
	name: "Scenes",
	description: "Save and recall canvas viewport locations.",

	setup(controller) {
		let scenes = reactive({});

		let loadScene = (number) => {
			let scene = scenes.value()[String(number)];
			if (!scene) return;
			controller.setCanvasTransform(scene);
		};

		let saveScene = (number) => {
			let transform = controller.getCanvasTransform();
			if (!transform) return;

			scenes.next({
				...scenes.value(),
				[String(number)]: { ...transform },
			});
			controller.markDirty();
		};

		let updateScene = (number, event) => {
			if (event?.metaKey || event?.ctrlKey) saveScene(number);
			else loadScene(number);
		};

		let controls = [
			".scenes",
			...Array.from({ length: 5 }, (_, index) => {
				let number = index + 1;
				return ["button", {
					type: "button",
					title: "Load scene " + number + "; command-click to save",
					onclick: (event) => updateScene(number, event),
				}, String(number)];
			}),
		];

		controller.registerUI("bottom-bar", controls);

		controller.registerHook("canvas:serialize", ({ data }) => ({
			data: {
				...data,
				scenes: scenes.value(),
			},
		}));

		controller.registerHook("canvas:deserialize", ({ data }) => {
			scenes.next(isScenesObject(data?.scenes) ? data.scenes : {});
		});

		for (let number = 1; number <= 5; number++) {
			controller.on(String(number), () => loadScene(number), {
				disable_in_input: true,
			});
		}

		let style = document.createElement("style");
		style.textContent = `
			.scenes {
				display: flex;
				gap: .5em;
			}
		`;
		document.head.appendChild(style);

		return () => style.remove();
	},
};

export default Scenes;
