/**
 * Background tracks bundled with Klyra. Every track is original music
 * synthesized by `scripts/music-library/generate.py`, so it can be used in
 * any exported video, commercial or not, without attribution.
 */
export interface MusicLibraryTrack {
	id: string;
	title: string;
	mood: string;
	bpm: number;
	fileName: string;
}

/** Library tracks start quieter than imported audio so narration stays on top. */
export const MUSIC_LIBRARY_DEFAULT_VOLUME = 0.35;

export const MUSIC_LIBRARY_TRACKS: readonly MusicLibraryTrack[] = [
	{ id: "calm-focus", title: "Calm Focus", mood: "Ambient", bpm: 72, fileName: "calm-focus.mp3" },
	{
		id: "upbeat-product",
		title: "Upbeat Product",
		mood: "Energetic",
		bpm: 118,
		fileName: "upbeat-product.mp3",
	},
	{
		id: "lofi-chill",
		title: "Lo-fi Chill",
		mood: "Relaxed",
		bpm: 80,
		fileName: "lofi-chill.mp3",
	},
	{
		id: "tech-pulse",
		title: "Tech Pulse",
		mood: "Electronic",
		bpm: 124,
		fileName: "tech-pulse.mp3",
	},
	{
		id: "corporate-bright",
		title: "Corporate Bright",
		mood: "Positive",
		bpm: 105,
		fileName: "corporate-bright.mp3",
	},
	{
		id: "minimal-piano",
		title: "Minimal Piano",
		mood: "Emotional",
		bpm: 66,
		fileName: "minimal-piano.mp3",
	},
];

export function isMusicLibraryFileName(fileName: string): boolean {
	return MUSIC_LIBRARY_TRACKS.some((track) => track.fileName === fileName);
}
