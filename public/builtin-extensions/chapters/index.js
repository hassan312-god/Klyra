// Chapters: section titles that appear at chosen times on the timeline.
// Format: "0:05 Create an account | 0:18 Invite your team | 1:02 Export"

const DEFAULTS = {
	enabled: false,
	chapters: "0:02 Étape 1 : créer un compte | 0:10 Étape 2 : configurer",
	seconds: 3,
	position: "bottom-left",
};
const FADE_SECONDS = 0.35;

function setting(api, id) {
	const value = api.getSetting(id);
	return value === undefined || value === null ? DEFAULTS[id] : value;
}

/** Parses "m:ss Title" entries separated by "|" or new lines. Exported for tests. */
export function parseChapters(text) {
	const chapters = [];
	for (const entry of String(text).split(/[|\n]/)) {
		const match = /^\s*(?:(\d+):)?(\d+(?:\.\d+)?)\s+(.+?)\s*$/.exec(entry);
		if (!match) continue;
		const minutes = match[1] ? Number(match[1]) : 0;
		chapters.push({ startSeconds: minutes * 60 + Number(match[2]), title: match[3] });
	}
	return chapters.sort((left, right) => left.startSeconds - right.startSeconds);
}

function roundedRect(ctx, x, y, width, height, radius) {
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.arcTo(x + width, y, x + width, y + height, radius);
	ctx.arcTo(x + width, y + height, x, y + height, radius);
	ctx.arcTo(x, y + height, x, y, radius);
	ctx.arcTo(x, y, x + width, y, radius);
	ctx.closePath();
}

export function activate(api) {
	api.registerSettingsPanel({
		id: "chapters",
		label: "Chapters",
		icon: "ListNumbers",
		parentSection: "scene",
		fields: [
			{ id: "enabled", label: "Show chapter titles", type: "toggle", defaultValue: false },
			{
				id: "chapters",
				label: "Chapters (m:ss Title | …)",
				type: "text",
				defaultValue: DEFAULTS.chapters,
			},
			{
				id: "seconds",
				label: "Shown for (s)",
				type: "slider",
				defaultValue: DEFAULTS.seconds,
				min: 1,
				max: 8,
				step: 0.5,
			},
			{
				id: "position",
				label: "Position",
				type: "select",
				defaultValue: DEFAULTS.position,
				options: [
					{ label: "Bottom left", value: "bottom-left" },
					{ label: "Top left", value: "top-left" },
				],
			},
		],
	});

	api.registerRenderHook("final", (hook) => {
		if (!setting(api, "enabled")) return;
		const now = hook.timeMs / 1000;
		const shown = Number(setting(api, "seconds"));
		const chapters = parseChapters(setting(api, "chapters"));
		const index = chapters.findLastIndex((chapter) => chapter.startSeconds <= now);
		if (index < 0) return;
		const chapter = chapters[index];
		const elapsed = now - chapter.startSeconds;
		if (elapsed > shown) return;

		const alpha = Math.min(1, elapsed / FADE_SECONDS, (shown - elapsed) / FADE_SECONDS);
		const ctx = hook.ctx;
		const unit = Math.min(hook.width, hook.height) / 1080;
		const font = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
		const margin = 40 * unit;
		const slide = (1 - Math.min(1, elapsed / FADE_SECONDS)) * 24 * unit;

		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.textBaseline = "middle";
		ctx.font = `700 ${34 * unit}px ${font}`;
		const titleWidth = ctx.measureText(chapter.title).width;
		const boxWidth = titleWidth + 56 * unit;
		const boxHeight = 96 * unit;
		const x = margin - slide;
		const y =
			setting(api, "position") === "top-left" ? margin : hook.height - margin - boxHeight;

		ctx.fillStyle = "rgba(10, 10, 22, 0.82)";
		roundedRect(ctx, x, y, boxWidth, boxHeight, 18 * unit);
		ctx.fill();
		ctx.fillStyle = "#8b5cf6";
		roundedRect(ctx, x, y, 8 * unit, boxHeight, 4 * unit);
		ctx.fill();

		ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
		ctx.font = `600 ${18 * unit}px ${font}`;
		ctx.fillText(`${index + 1} / ${chapters.length}`, x + 28 * unit, y + 28 * unit);
		ctx.fillStyle = "#ffffff";
		ctx.font = `700 ${34 * unit}px ${font}`;
		ctx.fillText(chapter.title, x + 28 * unit, y + 62 * unit);
		ctx.restore();
	});
}

export function deactivate() {
	// Klyra removes this extension's hooks and panels automatically.
}
