// Intro Title: a title card over the first seconds of the video.

const DEFAULTS = {
	enabled: false,
	title: "My Product",
	subtitle: "See how it works in 60 seconds",
	duration: 3,
	backdrop: 0.6,
};
const FADE_SECONDS = 0.45;

function setting(api, id) {
	const value = api.getSetting(id);
	return value === undefined || value === null ? DEFAULTS[id] : value;
}

export function activate(api) {
	api.registerSettingsPanel({
		id: "intro-title",
		label: "Intro Title",
		icon: "TextT",
		parentSection: "scene",
		fields: [
			{ id: "enabled", label: "Show intro title", type: "toggle", defaultValue: false },
			{ id: "title", label: "Title", type: "text", defaultValue: DEFAULTS.title },
			{ id: "subtitle", label: "Subtitle", type: "text", defaultValue: DEFAULTS.subtitle },
			{
				id: "duration",
				label: "Duration (s)",
				type: "slider",
				defaultValue: DEFAULTS.duration,
				min: 1,
				max: 8,
				step: 0.5,
			},
			{
				id: "backdrop",
				label: "Background darkness",
				type: "slider",
				defaultValue: DEFAULTS.backdrop,
				min: 0,
				max: 0.9,
				step: 0.05,
			},
		],
	});

	api.registerRenderHook("final", (hook) => {
		if (!setting(api, "enabled")) return;
		const seconds = hook.timeMs / 1000;
		const duration = Number(setting(api, "duration"));
		if (seconds < 0 || seconds > duration) return;

		// Fade in at the start and out at the end.
		const alpha = Math.min(1, seconds / FADE_SECONDS, (duration - seconds) / FADE_SECONDS);
		if (alpha <= 0) return;

		const ctx = hook.ctx;
		const unit = Math.min(hook.width, hook.height) / 1080;
		const title = String(setting(api, "title")).trim();
		const subtitle = String(setting(api, "subtitle")).trim();
		const rise = (1 - alpha) * 18 * unit;

		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.fillStyle = `rgba(0, 0, 0, ${Number(setting(api, "backdrop"))})`;
		ctx.fillRect(0, 0, hook.width, hook.height);

		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillStyle = "#ffffff";
		const centerY = hook.height / 2 + rise;
		if (title) {
			ctx.font = `700 ${72 * unit}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;
			ctx.fillText(title, hook.width / 2, subtitle ? centerY - 28 * unit : centerY);
		}
		if (subtitle) {
			ctx.globalAlpha = alpha * 0.8;
			ctx.font = `500 ${32 * unit}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;
			ctx.fillText(subtitle, hook.width / 2, title ? centerY + 44 * unit : centerY);
		}
		ctx.restore();
	});
}

export function deactivate() {
	// Klyra removes this extension's hooks and panels automatically.
}
