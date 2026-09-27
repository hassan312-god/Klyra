import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isMusicLibraryFileName, MUSIC_LIBRARY_TRACKS } from "./musicLibrary";

describe("music library", () => {
	it("ships an audio file for every catalogue entry", () => {
		for (const track of MUSIC_LIBRARY_TRACKS) {
			expect(existsSync(path.join(process.cwd(), "public", "music", track.fileName))).toBe(true);
		}
	});

	it("has unique ids and file names", () => {
		const ids = new Set(MUSIC_LIBRARY_TRACKS.map((track) => track.id));
		const files = new Set(MUSIC_LIBRARY_TRACKS.map((track) => track.fileName));
		expect(ids.size).toBe(MUSIC_LIBRARY_TRACKS.length);
		expect(files.size).toBe(MUSIC_LIBRARY_TRACKS.length);
	});

	it("only accepts catalogue file names", () => {
		expect(isMusicLibraryFileName("lofi-chill.mp3")).toBe(true);
		expect(isMusicLibraryFileName("../../secret.mp3")).toBe(false);
		expect(isMusicLibraryFileName("unknown.mp3")).toBe(false);
	});
});
