// Auto demo scenarios: a site URL plus the steps Klyra replays while it records.
// Everything here is pure so the recorder, the player and the UI agree on one format.

export type DemoStep =
	| { type: "click"; selector: string; label?: string }
	| { type: "type"; selector: string; text: string; label?: string }
	| { type: "press"; key: "Enter" | "Tab" | "Escape" }
	| { type: "scroll"; y: number }
	| { type: "wait"; ms: number }
	| { type: "navigate"; url: string };

export type DemoScenario = {
	version: 1;
	url: string;
	steps: DemoStep[];
};

export const MAX_DEMO_STEPS = 500;
export const MAX_WAIT_MS = 60_000;
const MAX_TEXT_LENGTH = 2_000;
const MAX_SELECTOR_LENGTH = 1_000;
const PRESS_KEYS = new Set(["Enter", "Tab", "Escape"]);

export function normalizeDemoUrl(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}
	const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
	try {
		const url = new URL(withProtocol);
		if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) {
			return null;
		}
		if (url.username || url.password) {
			return null;
		}
		return url.href;
	} catch {
		return null;
	}
}

function shortString(value: unknown, max: number): string | null {
	return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

function optionalLabel(value: unknown): { label?: string } {
	const label = shortString(value, 200);
	return label ? { label } : {};
}

export function normalizeDemoStep(raw: unknown): DemoStep | null {
	if (!raw || typeof raw !== "object") {
		return null;
	}
	const step = raw as Record<string, unknown>;
	switch (step.type) {
		case "click": {
			const selector = shortString(step.selector, MAX_SELECTOR_LENGTH);
			return selector ? { type: "click", selector, ...optionalLabel(step.label) } : null;
		}
		case "type": {
			const selector = shortString(step.selector, MAX_SELECTOR_LENGTH);
			const text = typeof step.text === "string" ? step.text.slice(0, MAX_TEXT_LENGTH) : null;
			return selector && text !== null
				? { type: "type", selector, text, ...optionalLabel(step.label) }
				: null;
		}
		case "press":
			return typeof step.key === "string" && PRESS_KEYS.has(step.key)
				? { type: "press", key: step.key as "Enter" | "Tab" | "Escape" }
				: null;
		case "scroll":
			return typeof step.y === "number" && Number.isFinite(step.y)
				? { type: "scroll", y: Math.max(0, Math.round(step.y)) }
				: null;
		case "wait":
			return typeof step.ms === "number" && Number.isFinite(step.ms)
				? { type: "wait", ms: Math.min(MAX_WAIT_MS, Math.max(0, Math.round(step.ms))) }
				: null;
		case "navigate": {
			const url = normalizeDemoUrl(step.url);
			return url ? { type: "navigate", url } : null;
		}
		default:
			return null;
	}
}

export function normalizeDemoScenario(raw: unknown): DemoScenario | null {
	if (!raw || typeof raw !== "object") {
		return null;
	}
	const scenario = raw as Record<string, unknown>;
	const url = normalizeDemoUrl(scenario.url);
	if (!url) {
		return null;
	}
	const rawSteps = Array.isArray(scenario.steps) ? scenario.steps : [];
	const steps = rawSteps
		.slice(0, MAX_DEMO_STEPS)
		.map(normalizeDemoStep)
		.filter((step): step is DemoStep => step !== null);
	return { version: 1, url, steps };
}

/**
 * Appends a freshly recorded step, folding the noise a person makes while
 * recording: successive edits of one field keep only the final text, and
 * successive scrolls keep only where the page came to rest.
 */
export function appendRecordedStep(steps: DemoStep[], next: DemoStep): DemoStep[] {
	const last = steps[steps.length - 1];
	if (last && next.type === "type" && last.type === "type" && last.selector === next.selector) {
		return [...steps.slice(0, -1), next];
	}
	if (last && next.type === "scroll" && last.type === "scroll") {
		return [...steps.slice(0, -1), next];
	}
	// Clicking into a field right before typing in it is implied by the type step.
	if (last && next.type === "type" && last.type === "click" && last.selector === next.selector) {
		return [...steps.slice(0, -1), next];
	}
	return [...steps, next].slice(0, MAX_DEMO_STEPS);
}

export type Point = { x: number; y: number };

function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Travel time for a cursor move, so short hops are quick and long ones stay readable. */
export function cursorMoveDurationMs(from: Point, to: Point): number {
	const distance = Math.hypot(to.x - from.x, to.y - from.y);
	return Math.round(Math.min(1_100, Math.max(350, 300 + distance * 0.9)));
}

/** Point along a gently arced, eased path from `from` to `to` at progress t in [0, 1]. */
export function cursorPathPoint(from: Point, to: Point, t: number): Point {
	const clamped = Math.min(1, Math.max(0, t));
	const eased = easeInOutCubic(clamped);
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	// Bow the path sideways a little, the way a hand moves, peaking mid-way.
	const arc = Math.sin(Math.PI * eased) * Math.min(60, Math.hypot(dx, dy) * 0.08);
	const length = Math.hypot(dx, dy) || 1;
	return {
		x: from.x + dx * eased + (-dy / length) * arc,
		y: from.y + dy * eased + (dx / length) * arc,
	};
}

/** Human-looking but deterministic delay before typing character `index`. */
export function typingDelayMs(index: number): number {
	const pattern = [55, 80, 65, 95, 60, 75, 110, 70];
	return pattern[index % pattern.length];
}
