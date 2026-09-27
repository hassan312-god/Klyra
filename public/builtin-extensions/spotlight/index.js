// Spotlight: darkens everything except a soft circle that follows the cursor.

const DEFAULTS = { enabled: false, radius: 0.16, dim: 0.55, softness: 0.5 };

function setting(api, id) {
	const value = api.getSetting(id);
	return value === undefined || value === null ? DEFAULTS[id] : value;
}

export function activate(api) {
	api.registerSettingsPanel({
		id: "spotlight",
		label: "Spotlight",
		icon: "Flashlight",
		parentSection: "cursor",
		fields: [
			{ id: "enabled", label: "Spotlight the cursor", type: "toggle", defaultValue: false },
			{
				id: "radius",
				label: "Size",
				type: "slider",
				defaultValue: DEFAULTS.radius,
				min: 0.05,
				max: 0.45,
				step: 0.01,
			},
			{
				id: "dim",
				label: "Darkness",
				type: "slider",
				defaultValue: DEFAULTS.dim,
				min: 0.1,
				max: 0.9,
				step: 0.05,
			},
			{
				id: "softness",
				label: "Edge softness",
				type: "slider",
				defaultValue: DEFAULTS.softness,
				min: 0,
				max: 1,
				step: 0.05,
			},
		],
	});

	api.registerRenderHook("post-cursor", (hook) => {
		if (!setting(api, "enabled")) return;
		const cursor = hook.smoothedCursor ?? hook.cursor;
		if (!cursor) return;

		const ctx = hook.ctx;
		const x = cursor.cx * hook.width;
		const y = cursor.cy * hook.height;
		const radius = Math.min(hook.width, hook.height) * Number(setting(api, "radius"));
		const innerRadius = radius * (1 - Number(setting(api, "softness")) * 0.85);
		const dim = Number(setting(api, "dim"));

		const shade = ctx.createRadialGradient(x, y, innerRadius, x, y, radius);
		shade.addColorStop(0, "rgba(0, 0, 0, 0)");
		shade.addColorStop(1, `rgba(0, 0, 0, ${dim})`);

		ctx.save();
		ctx.fillStyle = shade;
		// This phase runs inside the zoom transform; oversize the fill so the
		// shade still covers the whole frame while zoomed or panned.
		ctx.fillRect(-hook.width, -hook.height, hook.width * 3, hook.height * 3);
		ctx.restore();
	});
}

export function deactivate() {
	// Klyra removes this extension's hooks and panels automatically.
}
