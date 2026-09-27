// Countdown: a 3-2-1 countdown over the first seconds of the video.

const DEFAULTS = { enabled: false, from: "3", backdrop: 0.7, color: "#8b5cf6" };

function setting(api, id) {
	const value = api.getSetting(id);
	return value === undefined || value === null ? DEFAULTS[id] : value;
}

export function activate(api) {
	api.registerSettingsPanel({
		id: "countdown",
		label: "Countdown",
		icon: "Timer",
		parentSection: "scene",
		fields: [
			{ id: "enabled", label: "Start with a countdown", type: "toggle", defaultValue: false },
			{
				id: "from",
				label: "Count from",
				type: "select",
				defaultValue: DEFAULTS.from,
				options: [
					{ label: "3", value: "3" },
					{ label: "5", value: "5" },
				],
			},
			{
				id: "backdrop",
				label: "Background darkness",
				type: "slider",
				defaultValue: DEFAULTS.backdrop,
				min: 0,
				max: 1,
				step: 0.05,
			},
			{ id: "color", label: "Ring color", type: "color", defaultValue: DEFAULTS.color },
		],
	});

	api.registerRenderHook("final", (hook) => {
		if (!setting(api, "enabled")) return;
		const total = Number(setting(api, "from"));
		const seconds = hook.timeMs / 1000;
		if (seconds < 0 || seconds >= total) return;

		const number = total - Math.floor(seconds);
		const withinSecond = seconds - Math.floor(seconds);
		const ctx = hook.ctx;
		const unit = Math.min(hook.width, hook.height) / 1080;
		const centerX = hook.width / 2;
		const centerY = hook.height / 2;
		const radius = 130 * unit;
		// Fade the whole overlay out during the last 0.3 s.
		const alpha = Math.min(1, (total - seconds) / 0.3);

		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.fillStyle = `rgba(6, 6, 14, ${Number(setting(api, "backdrop"))})`;
		ctx.fillRect(0, 0, hook.width, hook.height);

		ctx.lineWidth = 12 * unit;
		ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
		ctx.beginPath();
		ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
		ctx.stroke();
		// The ring drains over each second.
		ctx.strokeStyle = String(setting(api, "color"));
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.arc(
			centerX,
			centerY,
			radius,
			-Math.PI / 2,
			-Math.PI / 2 + Math.PI * 2 * (1 - withinSecond),
		);
		ctx.stroke();

		const pop = 1 + 0.25 * Math.max(0, 1 - withinSecond * 5);
		ctx.translate(centerX, centerY);
		ctx.scale(pop, pop);
		ctx.fillStyle = "#ffffff";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.font = `800 ${150 * unit}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;
		ctx.fillText(String(number), 0, 8 * unit);
		ctx.restore();
	});
}

export function deactivate() {
	// Klyra removes this extension's hooks and panels automatically.
}
