// Device Frames: resolution-independent frames drawn with the 2D canvas API.
// Each draw() fills the frame chrome and leaves the screen area (defined by
// screenInsets, as fractions of the frame size) transparent for the video.

function roundedRectPath(ctx, x, y, width, height, radius) {
	const r = Math.min(radius, width / 2, height / 2);
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + width, y, x + width, y + height, r);
	ctx.arcTo(x + width, y + height, x, y + height, r);
	ctx.arcTo(x, y + height, x, y, r);
	ctx.arcTo(x, y, x + width, y, r);
	ctx.closePath();
}

function clearScreen(ctx, width, height, insets) {
	ctx.clearRect(
		insets.left * width,
		insets.top * height,
		width * (1 - insets.left - insets.right),
		height * (1 - insets.top - insets.bottom),
	);
}

function browserFrame(theme) {
	const dark = theme === "dark";
	const insets = { top: 0.075, right: 0.004, bottom: 0.006, left: 0.004 };
	return {
		id: `browser-${theme}`,
		label: dark ? "Browser (dark)" : "Browser (light)",
		category: "browser",
		appearance: dark ? "dark" : "light",
		screenInsets: insets,
		draw(ctx, width, height) {
			const barHeight = insets.top * height;
			const radius = Math.min(width, height) * 0.018;
			ctx.fillStyle = dark ? "#1f1f28" : "#e9e9ef";
			roundedRectPath(ctx, 0, 0, width, height, radius);
			ctx.fill();
			ctx.strokeStyle = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.12)";
			ctx.lineWidth = Math.max(1, height * 0.0015);
			ctx.stroke();

			// Traffic lights.
			const dot = barHeight * 0.13;
			["#ff5f57", "#febc2e", "#28c840"].forEach((color, index) => {
				ctx.fillStyle = color;
				ctx.beginPath();
				ctx.arc(barHeight * 0.55 + index * dot * 3.2, barHeight / 2, dot, 0, Math.PI * 2);
				ctx.fill();
			});

			// Address bar.
			const barWidth = width * 0.46;
			const pillHeight = barHeight * 0.52;
			ctx.fillStyle = dark ? "#2c2c38" : "#ffffff";
			roundedRectPath(
				ctx,
				(width - barWidth) / 2,
				(barHeight - pillHeight) / 2,
				barWidth,
				pillHeight,
				pillHeight / 2,
			);
			ctx.fill();

			clearScreen(ctx, width, height, insets);
		},
	};
}

// Renderers call draw() detached from the frame object, so each frame reads its
// insets from a constant rather than from `this`.
const LAPTOP_INSETS = { top: 0.045, right: 0.075, bottom: 0.14, left: 0.075 };
const PHONE_INSETS = { top: 0.035, right: 0.05, bottom: 0.035, left: 0.05 };

const laptopFrame = {
	id: "laptop",
	label: "Laptop",
	category: "laptop",
	appearance: "dark",
	screenInsets: LAPTOP_INSETS,
	draw(ctx, width, height) {
		const insets = LAPTOP_INSETS;
		const baseHeight = height * 0.075;
		const lidBottom = height - baseHeight;
		const lidInset = width * 0.045;

		// Lid with bezel.
		ctx.fillStyle = "#15151c";
		roundedRectPath(ctx, lidInset, 0, width - lidInset * 2, lidBottom, height * 0.035);
		ctx.fill();
		// Camera.
		ctx.fillStyle = "#2d2d3a";
		ctx.beginPath();
		ctx.arc(width / 2, insets.top * height * 0.5, height * 0.006, 0, Math.PI * 2);
		ctx.fill();

		// Base, slightly wider than the lid, with a finger notch.
		const gradient = ctx.createLinearGradient(0, lidBottom, 0, height);
		gradient.addColorStop(0, "#c9cad3");
		gradient.addColorStop(1, "#8d8e99");
		ctx.fillStyle = gradient;
		roundedRectPath(ctx, 0, lidBottom, width, baseHeight, baseHeight * 0.45);
		ctx.fill();
		ctx.fillStyle = "rgba(0,0,0,0.18)";
		roundedRectPath(
			ctx,
			width * 0.43,
			lidBottom,
			width * 0.14,
			baseHeight * 0.3,
			baseHeight * 0.15,
		);
		ctx.fill();

		clearScreen(ctx, width, height, insets);
	},
};

const phoneFrame = {
	id: "phone",
	label: "Phone",
	category: "phone",
	appearance: "dark",
	screenInsets: PHONE_INSETS,
	draw(ctx, width, height) {
		const insets = PHONE_INSETS;
		ctx.fillStyle = "#101016";
		roundedRectPath(ctx, 0, 0, width, height, Math.min(width, height) * 0.14);
		ctx.fill();
		ctx.strokeStyle = "#3a3a48";
		ctx.lineWidth = Math.max(2, Math.min(width, height) * 0.008);
		ctx.stroke();
		clearScreen(ctx, width, height, insets);

		// Dynamic-island pill, drawn over the top of the screen.
		const pillWidth = width * 0.28;
		const pillHeight = Math.min(width, height) * 0.05;
		ctx.fillStyle = "#000000";
		roundedRectPath(
			ctx,
			(width - pillWidth) / 2,
			insets.top * height + pillHeight * 0.4,
			pillWidth,
			pillHeight,
			pillHeight / 2,
		);
		ctx.fill();
	},
};

export function activate(api) {
	for (const frame of [browserFrame("light"), browserFrame("dark"), laptopFrame, phoneFrame]) {
		api.registerFrame(frame);
	}
}

export function deactivate() {
	// Klyra removes this extension's frames automatically.
}
