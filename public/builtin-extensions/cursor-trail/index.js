// Cursor Trail: a glowing, tapering line along the cursor's recent path.

const DEFAULTS = { enabled: false, color: "#8b5cf6", width: 1, length: 1 };

function setting(api, id) {
	const value = api.getSetting(id);
	return value === undefined || value === null ? DEFAULTS[id] : value;
}

function hexToRgb(hex) {
	const match = /^#?([0-9a-f]{6})$/i.exec(String(hex));
	if (!match) return { r: 139, g: 92, b: 246 };
	const value = Number.parseInt(match[1], 16);
	return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function activate(api) {
	api.registerSettingsPanel({
		id: "cursor-trail",
		label: "Cursor Trail",
		icon: "Sparkle",
		parentSection: "cursor",
		fields: [
			{ id: "enabled", label: "Show a trail", type: "toggle", defaultValue: false },
			{ id: "color", label: "Color", type: "color", defaultValue: DEFAULTS.color },
			{
				id: "width",
				label: "Thickness",
				type: "slider",
				defaultValue: DEFAULTS.width,
				min: 0.3,
				max: 3,
				step: 0.1,
			},
			{
				id: "length",
				label: "Length",
				type: "slider",
				defaultValue: DEFAULTS.length,
				min: 0.2,
				max: 1,
				step: 0.05,
			},
		],
	});

	api.registerRenderHook("post-cursor", (hook) => {
		if (!setting(api, "enabled")) return;
		const smoothed = hook.smoothedCursor;
		if (!smoothed || !Array.isArray(smoothed.trail)) return;

		// The trail is newest-first and spans a fixed time window, so its length on
		// screen is the same in the preview and in exports at any frame rate.
		const keep = Math.max(
			2,
			Math.round(smoothed.trail.length * Number(setting(api, "length"))),
		);
		const points = [
			...smoothed.trail.slice(0, keep).reverse(),
			{ cx: smoothed.cx, cy: smoothed.cy },
		];
		if (points.length < 2) return;

		const ctx = hook.ctx;
		const unit = Math.min(hook.width, hook.height) / 1080;
		const maxWidth = 10 * unit * Number(setting(api, "width"));
		const { r, g, b } = hexToRgb(setting(api, "color"));

		ctx.save();
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.8)`;
		ctx.shadowBlur = 12 * unit;
		// Older segments are thinner and more transparent.
		for (let index = 1; index < points.length; index++) {
			const progress = index / (points.length - 1);
			ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.85 * progress})`;
			ctx.lineWidth = Math.max(0.5, maxWidth * progress);
			ctx.beginPath();
			ctx.moveTo(points[index - 1].cx * hook.width, points[index - 1].cy * hook.height);
			ctx.lineTo(points[index].cx * hook.width, points[index].cy * hook.height);
			ctx.stroke();
		}
		ctx.restore();
	});
}

export function deactivate() {
	// Klyra removes this extension's hooks and panels automatically.
}
