// Watermark: draws a small branded label in a corner of the frame.

const DEFAULTS = {
	enabled: false,
	text: "Made with Klyra",
	position: "bottom-right",
	opacity: 0.85,
	size: 1,
};

function setting(api, id) {
	const value = api.getSetting(id);
	return value === undefined || value === null ? DEFAULTS[id] : value;
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
		id: "watermark",
		label: "Watermark",
		icon: "SealCheck",
		parentSection: "scene",
		fields: [
			{ id: "enabled", label: "Show watermark", type: "toggle", defaultValue: false },
			{ id: "text", label: "Text", type: "text", defaultValue: DEFAULTS.text },
			{
				id: "position",
				label: "Position",
				type: "select",
				defaultValue: DEFAULTS.position,
				options: [
					{ label: "Bottom right", value: "bottom-right" },
					{ label: "Bottom left", value: "bottom-left" },
					{ label: "Top right", value: "top-right" },
					{ label: "Top left", value: "top-left" },
				],
			},
			{
				id: "opacity",
				label: "Opacity",
				type: "slider",
				defaultValue: DEFAULTS.opacity,
				min: 0.2,
				max: 1,
				step: 0.05,
			},
			{
				id: "size",
				label: "Size",
				type: "slider",
				defaultValue: DEFAULTS.size,
				min: 0.6,
				max: 2,
				step: 0.05,
			},
		],
	});

	api.registerRenderHook("final", (hook) => {
		if (!setting(api, "enabled")) return;
		const text = String(setting(api, "text")).trim();
		if (!text) return;

		const ctx = hook.ctx;
		const unit = (Math.min(hook.width, hook.height) / 1080) * Number(setting(api, "size"));
		const fontSize = 22 * unit;
		const paddingX = 14 * unit;
		const paddingY = 8 * unit;
		const margin = 28 * unit;

		ctx.save();
		ctx.globalAlpha = Number(setting(api, "opacity"));
		ctx.font = `600 ${fontSize}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;
		ctx.textBaseline = "middle";
		const boxWidth = ctx.measureText(text).width + paddingX * 2;
		const boxHeight = fontSize + paddingY * 2;

		const position = String(setting(api, "position"));
		const x = position.endsWith("left") ? margin : hook.width - margin - boxWidth;
		const y = position.startsWith("top") ? margin : hook.height - margin - boxHeight;

		roundedRect(ctx, x, y, boxWidth, boxHeight, boxHeight / 2);
		ctx.fillStyle = "rgba(10, 10, 20, 0.55)";
		ctx.fill();
		ctx.fillStyle = "#ffffff";
		ctx.fillText(text, x + paddingX, y + boxHeight / 2);
		ctx.restore();
	});
}

export function deactivate() {
	// Klyra removes this extension's hooks and panels automatically.
}
