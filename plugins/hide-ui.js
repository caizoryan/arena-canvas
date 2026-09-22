const HideUI = {
	id: "hide-ui",
	name: "Hide UI",
	description: "Hide block top and bottom bars with Shift+W.",

	setup(controller) {
		let style = document.createElement("style");
		style.textContent = `
			.top-bar,
			.bottom-bar {
				display: none !important;
			}
		`;

		let hideBars = () => {
			let top = () => document.querySelector('.top-buttons')
			let bottom = () => document.querySelector('.bottom-buttons')

			let cur_style = top().style.display
			if (cur_style == 'flex') { 
				top().style.display = 'none'
				bottom().style.display = 'none'
			}
			else {
				top().style.display = 'flex'
				bottom().style.display = 'flex'
			}
		}

		controller.on("shift + w", hideBars, {
			disable_in_input: true,
			preventDefault: true,
		});

		return () => style.remove();
	},
};

export default HideUI;
