import { describe, expect, it } from "vitest";
import {
	clearFieldScript,
	locateElementScript,
	RECORDER_SCRIPT,
	scrollToScript,
} from "../../../electron/autoDemo/pageScripts";
import {
	appendRecordedStep,
	cursorMoveDurationMs,
	cursorPathPoint,
	type DemoStep,
	normalizeDemoScenario,
	normalizeDemoUrl,
} from "./scenario";

describe("normalizeDemoUrl", () => {
	it("adds https to a bare domain", () => {
		expect(normalizeDemoUrl("monsite.com")).toBe("https://monsite.com/");
	});

	it("keeps http and https URLs", () => {
		expect(normalizeDemoUrl("http://localhost:3000/app")).toBe("http://localhost:3000/app");
	});

	it("rejects other protocols and embedded credentials", () => {
		expect(normalizeDemoUrl("file:///etc/passwd")).toBeNull();
		expect(normalizeDemoUrl("javascript:alert(1)")).toBeNull();
		expect(normalizeDemoUrl("https://user:pass@site.com")).toBeNull();
		expect(normalizeDemoUrl("")).toBeNull();
	});
});

describe("normalizeDemoScenario", () => {
	it("keeps valid steps and drops invalid ones", () => {
		const scenario = normalizeDemoScenario({
			url: "site.com",
			steps: [
				{ type: "click", selector: "#go", label: "Go" },
				{ type: "click" },
				{ type: "type", selector: 'input[name="q"]', text: "hello" },
				{ type: "press", key: "Delete" },
				{ type: "press", key: "Enter" },
				{ type: "wait", ms: 999_999 },
				{ type: "navigate", url: "ftp://nope" },
				{ type: "scroll", y: -40 },
			],
		});
		expect(scenario).toEqual({
			version: 1,
			url: "https://site.com/",
			steps: [
				{ type: "click", selector: "#go", label: "Go" },
				{ type: "type", selector: 'input[name="q"]', text: "hello" },
				{ type: "press", key: "Enter" },
				{ type: "wait", ms: 60_000 },
				{ type: "scroll", y: 0 },
			],
		});
	});

	it("rejects a scenario without a usable URL", () => {
		expect(normalizeDemoScenario({ url: "file:///x", steps: [] })).toBeNull();
		expect(normalizeDemoScenario(null)).toBeNull();
	});
});

describe("appendRecordedStep", () => {
	it("keeps only the final text of successive edits to one field", () => {
		let steps: DemoStep[] = [];
		steps = appendRecordedStep(steps, { type: "click", selector: "#email" });
		steps = appendRecordedStep(steps, { type: "type", selector: "#email", text: "a" });
		steps = appendRecordedStep(steps, { type: "type", selector: "#email", text: "ab" });
		steps = appendRecordedStep(steps, { type: "type", selector: "#name", text: "x" });
		expect(steps).toEqual([
			{ type: "type", selector: "#email", text: "ab" },
			{ type: "type", selector: "#name", text: "x" },
		]);
	});

	it("keeps only where successive scrolls came to rest", () => {
		let steps: DemoStep[] = [{ type: "click", selector: "#a" }];
		steps = appendRecordedStep(steps, { type: "scroll", y: 100 });
		steps = appendRecordedStep(steps, { type: "scroll", y: 400 });
		expect(steps).toEqual([
			{ type: "click", selector: "#a" },
			{ type: "scroll", y: 400 },
		]);
	});
});

describe("cursor path", () => {
	const from = { x: 0, y: 0 };
	const to = { x: 400, y: 300 };

	it("starts and ends exactly on the endpoints", () => {
		expect(cursorPathPoint(from, to, 0)).toEqual(from);
		const end = cursorPathPoint(from, to, 1);
		expect(end.x).toBeCloseTo(to.x);
		expect(end.y).toBeCloseTo(to.y);
	});

	it("bows off the straight line mid-way", () => {
		const mid = cursorPathPoint(from, to, 0.5);
		const straight = { x: 200, y: 150 };
		expect(Math.hypot(mid.x - straight.x, mid.y - straight.y)).toBeGreaterThan(5);
	});

	it("takes longer for longer moves within bounds", () => {
		const short = cursorMoveDurationMs(from, { x: 10, y: 0 });
		const long = cursorMoveDurationMs(from, { x: 2000, y: 0 });
		expect(short).toBeGreaterThanOrEqual(350);
		expect(long).toBeLessThanOrEqual(1_100);
		expect(long).toBeGreaterThan(short);
	});
});

describe("page scripts", () => {
	it("are valid JavaScript", () => {
		for (const source of [
			RECORDER_SCRIPT,
			locateElementScript('a[href="/x"]', true),
			clearFieldScript("#q"),
			scrollToScript(120),
		]) {
			expect(() => new Function(source)).not.toThrow();
		}
	});
});
