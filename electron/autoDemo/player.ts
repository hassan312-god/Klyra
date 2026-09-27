import type { BrowserWindow } from "electron";
import { clearFieldScript, locateElementScript, scrollToScript } from "./pageScripts";
import {
	cursorMoveDurationMs,
	cursorPathPoint,
	type DemoStep,
	type Point,
	typingDelayMs,
} from "../../src/lib/autoDemo/scenario";

const FRAME_MS = 16;
const PAGE_LOAD_TIMEOUT_MS = 20_000;

export type DemoPlayerHooks = {
	/** Cursor position in the window's content, reported on every animation frame. */
	onCursor: (point: Point) => void;
	onClick: (point: Point, phase: "down" | "up") => void;
	onStep: (index: number, step: DemoStep) => void;
	isCancelled: () => boolean;
};

export class DemoStepError extends Error {
	constructor(
		readonly stepIndex: number,
		message: string,
	) {
		super(message);
	}
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function waitForPageLoad(win: BrowserWindow, timeoutMs = PAGE_LOAD_TIMEOUT_MS) {
	const contents = win.webContents;
	if (!contents.isLoading()) {
		return;
	}
	await new Promise<void>((resolve) => {
		const timer = setTimeout(done, timeoutMs);
		function done() {
			clearTimeout(timer);
			contents.removeListener("did-stop-loading", done);
			resolve();
		}
		contents.once("did-stop-loading", done);
	});
}

export async function playDemoSteps(win: BrowserWindow, steps: DemoStep[], hooks: DemoPlayerHooks) {
	const contents = win.webContents;
	const [contentWidth, contentHeight] = win.getContentSize();
	let cursor: Point = { x: contentWidth * 0.5, y: contentHeight * 0.55 };
	hooks.onCursor(cursor);

	const moveTo = async (target: Point) => {
		const from = cursor;
		const durationMs = cursorMoveDurationMs(from, target);
		const startedAt = Date.now();
		for (;;) {
			const t = Math.min(1, (Date.now() - startedAt) / durationMs);
			cursor = cursorPathPoint(from, target, t);
			hooks.onCursor(cursor);
			contents.sendInputEvent({
				type: "mouseMove",
				x: Math.round(cursor.x),
				y: Math.round(cursor.y),
			});
			if (t >= 1) {
				return;
			}
			await sleep(FRAME_MS);
		}
	};

	const locate = async (index: number, selector: string): Promise<Point> => {
		const first = (await contents.executeJavaScript(locateElementScript(selector, true))) as
			| (Point & { width: number; height: number })
			| null;
		if (!first) {
			throw new DemoStepError(index, `Element not found: ${selector}`);
		}
		// Let the smooth scroll settle before aiming at the element.
		await sleep(450);
		const settled = (await contents.executeJavaScript(
			locateElementScript(selector, false),
		)) as Point | null;
		return settled ?? first;
	};

	const click = async (target: Point) => {
		await moveTo(target);
		await sleep(120);
		const x = Math.round(target.x);
		const y = Math.round(target.y);
		hooks.onClick(target, "down");
		contents.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
		await sleep(70);
		contents.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
		hooks.onClick(target, "up");
	};

	for (const [index, step] of steps.entries()) {
		if (hooks.isCancelled()) {
			return;
		}
		hooks.onStep(index, step);
		switch (step.type) {
			case "click": {
				await click(await locate(index, step.selector));
				await sleep(650);
				await waitForPageLoad(win);
				break;
			}
			case "type": {
				await click(await locate(index, step.selector));
				await contents.executeJavaScript(clearFieldScript(step.selector));
				await sleep(150);
				for (const [charIndex, char] of Array.from(step.text).entries()) {
					if (hooks.isCancelled()) {
						return;
					}
					contents.sendInputEvent({ type: "char", keyCode: char });
					await sleep(typingDelayMs(charIndex));
				}
				await sleep(400);
				break;
			}
			case "press": {
				contents.sendInputEvent({ type: "keyDown", keyCode: step.key });
				if (step.key === "Enter") {
					contents.sendInputEvent({ type: "char", keyCode: "\r" });
				}
				contents.sendInputEvent({ type: "keyUp", keyCode: step.key });
				await sleep(650);
				await waitForPageLoad(win);
				break;
			}
			case "scroll": {
				await contents.executeJavaScript(scrollToScript(step.y));
				await sleep(900);
				break;
			}
			case "wait": {
				const endAt = Date.now() + step.ms;
				while (Date.now() < endAt && !hooks.isCancelled()) {
					await sleep(Math.min(100, endAt - Date.now()));
				}
				break;
			}
			case "navigate": {
				await contents.loadURL(step.url).catch(() => undefined);
				await waitForPageLoad(win);
				await sleep(500);
				break;
			}
		}
	}
	// Hold the final frame a moment so the video does not end on the last action.
	await sleep(1_200);
}
