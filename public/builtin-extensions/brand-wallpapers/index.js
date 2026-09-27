// Brand Wallpapers: background images in the Klyra palette.

const WALLPAPERS = [
	["klyra-aurora", "Klyra Aurora"],
	["midnight", "Midnight"],
	["sunset", "Sunset"],
	["ocean", "Ocean"],
	["mint-light", "Mint Light"],
	["graphite", "Graphite"],
];

export function activate(api) {
	for (const [id, label] of WALLPAPERS) {
		api.registerWallpaper({
			id,
			label,
			file: `images/${id}.jpg`,
			thumbnail: `images/${id}-thumb.jpg`,
		});
	}
}

export function deactivate() {
	// Klyra removes this extension's wallpapers automatically.
}
