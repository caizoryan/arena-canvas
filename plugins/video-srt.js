import { dom } from "../dom.js";

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

	shift(delta, unit = "milliseconds") {
		let multipliers = {
			hours: 60 * 60,
			minutes: 60,
			seconds: 1,
			milliseconds: 1 / 1000,
		};
		let multiplier = multipliers[unit];
		if (multiplier == undefined) return;

		let offset = delta * multiplier;
		this.lines = this.lines.map((line, index) => {
			let start = Math.max(0, line.start + offset);
			let end = Math.max(start, line.end + offset);
			return this.updateLineTime(index, start, end);
		});
		this.updateSrtContent();
	}

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

export const MP4Block = (block) => {
	let link = block.attachment.url;
	let video = dom(["video", { src: link }]);
	let srt = new Srt(block.description.plain);
	console.log(srt)
	let subtitle = srt.valid ? dom([".video-subtitle"]) : null;

	let togglePlay = () => {
		video.paused ? video.play() : video.pause();
		video.paused
			? playPause.innerText = "play"
			: playPause.innerText = "pause";
	};
	let playPause = dom(["button", {
		onclick: togglePlay,
	}, "play"]);

	video.ontimeupdate = () => {
		if (video.duration) seeker.value = video.currentTime / video.duration;

		if (subtitle) {
			let line = srt.lines.find((line) =>
				video.currentTime >= line.start && video.currentTime <= line.end
			);
			subtitle.textContent = line ? line.subtitle : "";
		}
	};

	let seeker = dom([
		"input",
		{
			oninput: (e) =>
				video.currentTime = parseFloat(e.target.value) * video.duration,
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
		seeker,
	];
	let body = [".block.image.video", video];
	if (subtitle) body.push(subtitle);

	return {
		body,
		topBar: [["button", block.title]],
		bottomBar: [controls],
		attributes: { ondblclick: togglePlay },
	};
};
