// Beat Sync Cursor: pulses a glow ring around the cursor in time with the music.
// The pulse depends only on the timeline time, never on wall-clock time, so the
// preview and the exported video are frame-for-frame identical.

const TRACK_BPM = {
	"calm-focus": 72,
	"upbeat-product": 118,
	"lofi-chill": 80,
	"tech-pulse": 124,
	"corporate-bright": 105,
	"minimal-piano": 66,
};

const DEFAULTS = {
	enabled: false,
	track: "upbeat-product",
	customBpm: 120,
	musicStart: 0,
	beatsPerPulse: "1",
	color: "#7c5cff",
	intensity: 1,
};

function setting(api, id) {
	const value = api.getSetting(id);
	return value === undefined || value === null ? DEFAULTS[id] : value;
}

function hexToRgb(hex) {
	const match = /^#?([0-9a-f]{6})$/i.exec(String(hex));
	if (!match) return { r: 124, g: 92, b: 255 };
	const value = Number.parseInt(match[1], 16);
	return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function activate(api) {
	api.registerSettingsPanel({
		id: "beat-sync-cursor",
		label: "Beat Sync Cursor",
		icon: "MusicNotes",
		parentSection: "cursor",
		fields: [
			{
				id: "enabled",
				label: "Pulse cursor to the music",
				type: "toggle",
				defaultValue: false,
			},
			{
				id: "track",
				label: "Tempo",
				type: "select",
				defaultValue: DEFAULTS.track,
				options: [
					{ label: "Calm Focus (72 BPM)", value: "calm-focus" },
					{ label: "Upbeat Product (118 BPM)", value: "upbeat-product" },
					{ label: "Lo-fi Chill (80 BPM)", value: "lofi-chill" },
					{ label: "Tech Pulse (124 BPM)", value: "tech-pulse" },
					{ label: "Corporate Bright (105 BPM)", value: "corporate-bright" },
					{ label: "Minimal Piano (66 BPM)", value: "minimal-piano" },
					{ label: "Custom BPM", value: "custom" },
				],
			},
			{
				id: "customBpm",
				label: "Custom BPM",
				type: "slider",
				defaultValue: DEFAULTS.customBpm,
				min: 60,
				max: 180,
				step: 1,
			},
			{
				id: "musicStart",
				label: "Music starts at (s)",
				type: "slider",
				defaultValue: DEFAULTS.musicStart,
				min: 0,
				max: 120,
				step: 0.05,
			},
			{
				id: "beatsPerPulse",
				label: "Pulse every",
				type: "select",
				defaultValue: DEFAULTS.beatsPerPulse,
				options: [
					{ label: "Half beat", value: "0.5" },
					{ label: "Beat", value: "1" },
					{ label: "2 beats", value: "2" },
					{ label: "Bar (4 beats)", value: "4" },
				],
			},
			{ id: "color", label: "Color", type: "color", defaultValue: DEFAULTS.color },
			{
				id: "intensity",
				label: "Intensity",
				type: "slider",
				defaultValue: DEFAULTS.intensity,
				min: 0.2,
				max: 1.5,
				step: 0.05,
			},
		],
	});

	api.registerRenderHook("post-cursor", (hook) => {
		if (!setting(api, "enabled")) return;
		const cursor = hook.smoothedCursor ?? hook.cursor;
		if (!cursor) return;

		const track = setting(api, "track");
		const bpm = track === "custom" ? Number(setting(api, "customBpm")) : TRACK_BPM[track];
		if (!Number.isFinite(bpm) || bpm <= 0) return;

		const elapsedSeconds = hook.timeMs / 1000 - Number(setting(api, "musicStart"));
		if (elapsedSeconds < 0) return;

		const pulseSeconds = (60 / bpm) * Number(setting(api, "beatsPerPulse"));
		// 0 on the beat, rising to 1 just before the next one.
		const phase = (elapsedSeconds % pulseSeconds) / pulseSeconds;
		const intensity = Number(setting(api, "intensity"));
		const hit = Math.exp(-phase * 6); // sharp attack on the beat, smooth decay
		const { r, g, b } = hexToRgb(setting(api, "color"));

		const ctx = hook.ctx;
		const unit = Math.min(hook.width, hook.height) / 1080;
		const x = cursor.cx * hook.width;
		const y = cursor.cy * hook.height;
		const baseRadius = 22 * unit;

		ctx.save();
		// Soft glow that swells on each beat.
		const glowRadius = baseRadius * (1.4 + hit * 1.1 * intensity);
		const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
		glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.45 * hit * intensity})`);
		glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
		ctx.fillStyle = glow;
		ctx.beginPath();
		ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
		ctx.fill();

		// Ring that expands and fades between beats.
		const ringRadius = baseRadius * (1 + phase * 2.4);
		ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${Math.max(0, (1 - phase) * 0.85 * intensity)})`;
		ctx.lineWidth = Math.max(1, 3.5 * unit * (1 - phase * 0.6));
		ctx.beginPath();
		ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	});
}

export function deactivate() {
	// Klyra removes this extension's hooks and panels automatically.
}
