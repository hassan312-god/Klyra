import { describe, expect, it } from "vitest";
import {
	CURSOR_TRAIL_WINDOW_MS,
	DEFAULT_CURSOR_CONFIG,
	SmoothedCursorState,
} from "./cursorRenderer";

function trailSpanMs(fps: number): number {
	const state = new SmoothedCursorState(DEFAULT_CURSOR_CONFIG);
	const frameMs = 1000 / fps;
	let timeMs = 0;
	for (let frame = 0; frame < fps * 2; frame++) {
		timeMs = frame * frameMs;
		state.update(0.2 + (frame % 10) * 0.05, 0.5, timeMs);
	}
	const oldest = state.trail[state.trail.length - 1];
	return timeMs - oldest.timeMs;
}

describe("cursor trail", () => {
	it("keeps the newest position first", () => {
		const state = new SmoothedCursorState(DEFAULT_CURSOR_CONFIG);
		state.update(0.1, 0.1, 0);
		state.update(0.5, 0.5, 16);
		state.update(0.9, 0.9, 32);
		expect(state.trail[0].timeMs).toBeGreaterThan(state.trail[state.trail.length - 1].timeMs);
	});

	it("covers the same time window at any frame rate", () => {
		for (const fps of [30, 60]) {
			const span = trailSpanMs(fps);
			expect(span).toBeLessThanOrEqual(CURSOR_TRAIL_WINDOW_MS);
			expect(span).toBeGreaterThan(CURSOR_TRAIL_WINDOW_MS - 1000 / fps - 1);
		}
	});
});
