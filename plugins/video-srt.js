import { memo, reactive } from "../chowk.js";
import { CSSTransform, R } from "../block.js";
import { dom } from "../dom.js";
import { controller } from "../plugin.js";
import { getNodeLocation } from "../state.js";

const timestampPattern = /^(\d+):(\d{2}):(\d{2}),(\d{3})$/;
const timestampPatternSource = `(\\d+):(\\d{2}):(\\d{2}),(\\d{3})`;
const timingPattern = new RegExp(
	`^${timestampPatternSource}\\s+-->\\s+${timestampPatternSource}$`,
);

const timestampToSeconds = (timestamp) => {
	let match = timestamp.match(timestampPattern);
	if (!match) return;

	let [, hours, minutes, seconds, milliseconds] = match;
	return Number(hours) * 60 * 60 +
		Number(minutes) * 60 +
		Number(seconds) +
		Number(milliseconds) / 1000;
};

const secondsToTimestamp = (seconds) => {
	let date = new Date(seconds * 1000);
	let hours = Math.floor(seconds / (60 * 60));
	let minutes = date.getUTCMinutes();
	let remainingSeconds = date.getUTCSeconds();
	let milliseconds = date.getUTCMilliseconds();

	return [hours, minutes, remainingSeconds]
		.map((value) => value.toString().padStart(2, "0"))
		.join(":") + "," + milliseconds.toString().padStart(3, "0");
};

const formatTime = (time) => {
	if (!Number.isFinite(time)) return "00:00";

	let seconds = Math.floor(time);
	let minutes = Math.floor(seconds / 60);
	seconds %= 60;
	return [minutes, seconds]
		.map((value) => value.toString().padStart(2, "0"))
		.join(":");
};

export class Srt {
	constructor(srtContent) {
		this.srtContent = srtContent;
		this.lines = [];
		this.valid = this.parse();
	}

	parse() {
		if (typeof this.srtContent != "string" || !this.srtContent.trim()) {
			return false;
		}

		let sourceLines = this.srtContent.trim().replace(/\r/g, "").split("\n");
		let lines = [];
		let index = 0;

		while (index < sourceLines.length) {
			while (sourceLines[index]?.trim() == "") index++;
			if (index >= sourceLines.length) break;

			let counter = sourceLines[index++].trim();
			let timing = sourceLines[index++]?.trim().match(timingPattern);
			if (!timing) return false;

			let start = timestampToSeconds(timing[1] + ":" + timing[2] + ":" + timing[3] + "," + timing[4]);
			let end = timestampToSeconds(timing[5] + ":" + timing[6] + ":" + timing[7] + "," + timing[8]);
			if (start == undefined || end == undefined || end < start) return false;

			let subtitleLines = [];
			while (index < sourceLines.length) {
				if (sourceLines[index].trim() == "") {
					index++;
					break;
				}

				let nextTiming = sourceLines[index + 1]?.trim().match(timingPattern);
				if (nextTiming) break;
				subtitleLines.push(sourceLines[index++]);
			}

			if (!subtitleLines.length) return false;
			lines.push({
				counter,
				subtitle: subtitleLines.join("\n").trim(),
				start,
				end,
			});
		}

		this.lines = lines;
		return lines.length > 0;
	}

	// shift(delta, unit = "milliseconds") {
	// 	let multipliers = {
	// 		hours: 60 * 60,
	// 		minutes: 60,
	// 		seconds: 1,
	// 		milliseconds: 1 / 1000,
	// 	};
	// 	let multiplier = multipliers[unit];
	// 	if (multiplier == undefined) return;
	//
	// 	let offset = delta * multiplier;
	// 	this.lines = this.lines.map((line, index) => {
	// 		let start = Math.max(0, line.start + offset);
	// 		let end = Math.max(start, line.end + offset);
	// 		return this.updateLineTime(index, start, end);
	// 	});
	// 	this.updateSrtContent();
	// }

	updateLineTime(index, start, end) {
		let line = this.lines[index];
		return {
			counter: line.counter,
			subtitle: line.subtitle,
			start,
			end,
		};
	}

	updateSrtContent() {
		this.srtContent = this.lines.map((line) =>
			line.counter + "\n" +
			secondsToTimestamp(line.start) + " --> " + secondsToTimestamp(line.end) + "\n" +
			line.subtitle
		).join("\n\n");
	}

	getSrtContent() {
		return this.srtContent;
	}
}

const SrtScroll = (block, srt, video, offset) => {
	let location = getNodeLocation(block.id);
	let r = R(location, block.id);
	let left = r("x");
	let top = r("y");
	let width = r("width");
	let height = r("height");
	let subtitleElements = srt.lines.map((line) =>
		dom([".srt-scroll-line", {
			onclick: () => {
				video.currentTime = Math.max(0, line.start - offset.value());
				sync(video.currentTime);
			},
		},
		[".srt-scroll-time", formatTime(line.start)],
		line.subtitle,
	])
	);
	let lines = dom([".srt-scroll-lines", ...subtitleElements]);
	let panel;
	let activeIndex = -1;

	let changeOffset = (amount) => {
		offset.next((value) => value + amount);
		sync(video.currentTime);
	};
	let offsetButton = dom(["button.srt-offset", memo(() => {
		let value = offset.value();
		return (value > 0 ? "+" : "") + value.toFixed(1) + "s";
	}, [offset])]);
	let offsetControls = dom([".srt-scroll-controls",
		dom(["button", { onclick: () => changeOffset(-.1) }, "-"]),
		offsetButton,
		dom(["button", { onclick: () => changeOffset(.1) }, "+"]),
	]);
	let close = () => panel.remove();

	let closeButton = dom(["button.srt-scroll-close", {
		onclick: close,
	}, "close"]);
	panel = dom([".srt-scroll", {
		style: memo(() =>
			CSSTransform(
				left.value() + width.value() + 10,
				top.value(),
				undefined,
				height.value(),
			), [left, top, width, height]),
	}, offsetControls, closeButton, lines]);

	let sync = (time) => {
		let adjustedTime = time + offset.value();
		let nextIndex = srt.lines.findIndex((line) =>
			adjustedTime >= line.start && adjustedTime <= line.end
		);
		if (nextIndex == activeIndex) return;

		activeIndex = nextIndex;
		subtitleElements.forEach((element, index) =>
			element.classList.toggle("active", index == activeIndex)
		);

		if (activeIndex != -1) {
			let activeElement = subtitleElements[activeIndex];
			let yCoord = activeElement.offsetTop - lines.offsetTop -
				(lines.clientHeight - activeElement.offsetHeight) / 2;
			lines.scrollTo({top: yCoord, behavior: 'smooth'});
		}
	};

	return { panel, sync };
};

export const MP4Block = (block) => {
	let link = block.attachment.url;
	let video = dom(["video", { src: link }]);
	let description = typeof block.description == "string"
		? block.description
		: block.description?.plain;
	let srt = new Srt(description);
	let subtitle = srt.valid ? dom([".video-subtitle"]) : null;
	let offset = reactive(0);
	let srtScroll;

	let mountSrtScroll = () => {
		if (srtScroll?.panel.isConnected) return;
		srtScroll = SrtScroll(block, srt, video, offset);
		controller.mountToCanvas(srtScroll.panel);
		srtScroll.sync(video.currentTime);
	};
	let srtButton = srt.valid ? dom(["button", {
		onclick: mountSrtScroll,
	}, "subtitles"]) : null;

	let togglePlay = () => {
		video.paused ? video.play() : video.pause();
		video.paused
			? playPause.innerText = "play"
			: playPause.innerText = "pause";
	};
	let playPause = dom(["button", {
		onclick: togglePlay,
	}, "play"]);
	let currentTime = dom(["span.video-current-time", "00:00"]);

	let syncVideoSubtitle = () => {
		if (!subtitle) return;

		let time = video.currentTime + offset.value();
		let lineIndex = srt.lines.findIndex(line => time >= line.start && time <= line.end)
		let line = srt.lines.find((line) =>
			time >= line.start && time <= line.end
		);

		// let nextLine = srt.lines[lineIndex+1]
		// if (nextLine && line) subtitle.textContent = line.subtitle + " " +nextLine.subtitle
		// else 
			subtitle.textContent = line ? line.subtitle : "";
	};
	if (subtitle) offset.subscribe(syncVideoSubtitle);

	video.ontimeupdate = () => {
		currentTime.textContent = formatTime(video.currentTime);
		if (video.duration) seeker.value = video.currentTime / video.duration;

		syncVideoSubtitle();
		if (srtScroll) srtScroll.sync(video.currentTime);
	};

	let seeker = dom([
		"input",
		{
			oninput: (e) => {
				video.currentTime = parseFloat(e.target.value) * video.duration;
				currentTime.textContent = formatTime(video.currentTime);
			},
			type: "range",
			min: 0,
			max: 1,
			step: 0.01,
			value: 0,
		},
	]);

	let controls = [
		".controls",
		playPause,
		currentTime,
		seeker,
	];
	if (srtButton) controls.push(srtButton);

	let body = [".block.image.video", video];
	if (subtitle) body.push(subtitle);

	return {
		body,
		topBar: [["button", block.title]],
		bottomBar: [controls],
		attributes: { ondblclick: togglePlay },
	};
};
