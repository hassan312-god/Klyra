// End Call to Action: a closing card over the last seconds of the edited video.

const DEFAULTS = {
	enabled: false,
	headline: "Essayez gratuitement",
	url: "monsite.com",
	seconds: 4,
	color: "#2f6bff",
	style: "card",
};
const FADE_SECONDS = 0.4;

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
		id: "end-cta",
		label: "End Call to Action",
		icon: "MegaphoneSimple",
		parentSection: "scene",
		fields: [
			{ id: "enabled", label: "Show at the end", type: "toggle", defaultValue: false },
			{ id: "headline", label: "Headline", type: "text", defaultValue: DEFAULTS.headline },
			{ id: "url", label: "Website", type: "text", defaultValue: DEFAULTS.url },
			{
				id: "seconds",
				label: "Last seconds shown",
				type: "slider",
				defaultValue: DEFAULTS.seconds,
				min: 2,
				max: 10,
				step: 0.5,
			},
			{ id: "color", label: "Button color", type: "color", defaultValue: DEFAULTS.color },
			{
				id: "style",
				label: "Style",
				type: "select",
				defaultValue: DEFAULTS.style,
				options: [
					{ label: "Card at the bottom", value: "card" },
					{ label: "Full screen", value: "fullscreen" },
				],
			},
		],
	});

	api.registerRenderHook("final", (hook) => {
		if (!setting(api, "enabled") || hook.durationMs <= 0) return;
		const shownSeconds = Number(setting(api, "seconds"));
		const remaining = (hook.durationMs - hook.timeMs) / 1000;
		if (remaining > shownSeconds || remaining < 0) return;

		const alpha = Math.min(1, (shownSeconds - remaining) / FADE_SECONDS);
		const ctx = hook.ctx;
		const unit = Math.min(hook.width, hook.height) / 1080;
		const headline = String(setting(api, "headline")).trim();
		const url = String(setting(api, "url")).trim();
		const fullscreen = setting(api, "style") === "fullscreen";
		const font = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";

		const centerX = hook.width / 2;
		let headlineY;
		if (fullscreen) {
			ctx.fillStyle = "rgba(8, 8, 18, 0.82)";
			ctx.fillRect(0, 0, hook.width, hook.height);
			headlineY = hook.height / 2 - 40 * unit;
		} else {
			const cardWidth = Math.min(hook.width * 0.8, 820 * unit);
			const cardHeight = 190 * unit;
			const cardY = hook.height - cardHeight - 48 * unit;
			ctx.fillStyle = "rgba(10, 10, 22, 0.88)";
			roundedRect(ctx, centerX - cardWidth / 2, cardY, cardWidth, cardHeight, 24 * unit);
			ctx.fill();
			headlineY = cardY + 58 * unit;
		}

		if (headline) {
			ctx.fillStyle = "#ffffff";
			ctx.font = `700 ${(fullscreen ? 64 : 44) * unit}px ${font}`;
			ctx.fillText(headline, centerX, headlineY);
		}
		if (url) {
			ctx.font = `600 ${(fullscreen ? 34 : 28) * unit}px ${font}`;
			const buttonWidth = ctx.measureText(url).width + 56 * unit;
			const buttonHeight = (fullscreen ? 70 : 58) * unit;
			const buttonY = headlineY + (fullscreen ? 70 : 44) * unit;
			ctx.fillStyle = String(setting(api, "color"));
			roundedRect(
				ctx,
				centerX - buttonWidth / 2,
				buttonY,
				buttonWidth,
				buttonHeight,
				buttonHeight / 2,
			);
			ctx.fill();
			ctx.fillStyle = "#ffffff";
			ctx.fillText(url, centerX, buttonY + buttonHeight / 2);
		}
		ctx.restore();
	});
}

export function deactivate() {
	// Klyra removes this extension's hooks and panels automatically.
}
