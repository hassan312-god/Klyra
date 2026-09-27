// Click Callouts: a speech bubble pops up next to the cursor on every click.

const DEFAULTS = { enabled: false, text: "Cliquez ici", color: "#2f6bff", duration: 1.2 };
const POP_MS = 160;
const FADE_MS = 250;

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
		id: "click-callouts",
		label: "Click Callouts",
		icon: "ChatCircleDots",
		parentSection: "cursor",
		fields: [
			{
				id: "enabled",
				label: "Show a bubble on clicks",
				type: "toggle",
				defaultValue: false,
			},
			{ id: "text", label: "Bubble text", type: "text", defaultValue: DEFAULTS.text },
			{ id: "color", label: "Color", type: "color", defaultValue: DEFAULTS.color },
			{
				id: "duration",
				label: "Duration (s)",
				type: "slider",
				defaultValue: DEFAULTS.duration,
				min: 0.5,
				max: 3,
				step: 0.1,
			},
		],
	});

	api.registerCursorEffect((effect) => {
		if (!setting(api, "enabled") || effect.interactionType === "mouseup") return false;
		const text = String(setting(api, "text")).trim();
		const totalMs = Number(setting(api, "duration")) * 1000;
		if (!text || effect.elapsedMs > totalMs) return false;

		const pop = Math.min(1, effect.elapsedMs / POP_MS);
		// Slight overshoot on the pop-in, then fade out at the end.
		const scale =
			pop < 1
				? 0.6 + 0.5 * pop
				: 1 + 0.08 * Math.max(0, 1 - (effect.elapsedMs - POP_MS) / 120);
		const alpha = Math.min(1, (totalMs - effect.elapsedMs) / FADE_MS);

		const ctx = effect.ctx;
		const unit = Math.min(effect.width, effect.height) / 1080;
		const fontSize = 24 * unit;
		const x = effect.cx * effect.width;
		const y = effect.cy * effect.height;

		ctx.save();
		ctx.globalAlpha = Math.max(0, alpha);
		ctx.translate(x + 18 * unit, y - 18 * unit);
		ctx.scale(scale, scale);
		ctx.font = `600 ${fontSize}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;
		ctx.textBaseline = "middle";
		const paddingX = 16 * unit;
		const boxWidth = ctx.measureText(text).width + paddingX * 2;
		const boxHeight = fontSize + 18 * unit;

		// Bubble sits above-right of the click, with a tail pointing at it.
		ctx.fillStyle = String(setting(api, "color"));
		roundedRect(ctx, 0, -boxHeight, boxWidth, boxHeight, 12 * unit);
		ctx.fill();
		ctx.beginPath();
		ctx.moveTo(10 * unit, -2 * unit);
		ctx.lineTo(-6 * unit, 12 * unit);
		ctx.lineTo(26 * unit, -2 * unit);
		ctx.closePath();
		ctx.fill();

		ctx.fillStyle = "#ffffff";
		ctx.fillText(text, paddingX, -boxHeight / 2);
		ctx.restore();
		return true;
	});
}

export function deactivate() {
	// Klyra removes this extension's hooks and panels automatically.
}
