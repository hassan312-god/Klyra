import { BrowserWindow, ipcMain, type Session, session, type WebContents } from "electron";
import { pushCursorSample, getCursorCaptureElapsedMs } from "../ipc/cursor/telemetry";
import { broadcastSelectedSourceChange } from "../ipc/register/sources";
import { isCursorCaptureActive, setSelectedSource, setSyntheticCursorPoint } from "../ipc/state";
import {
	createAutoDemoControlWindow,
	getAutoDemoControlWindow,
	getHudOverlayWindow,
} from "../windows";
import { RECORDER_SCRIPT, STEP_MESSAGE_PREFIX } from "./pageScripts";
import { DemoStepError, playDemoSteps, waitForPageLoad } from "./player";
import {
	type DemoStep,
	normalizeDemoScenario,
	normalizeDemoStep,
	normalizeDemoUrl,
} from "../../src/lib/autoDemo/scenario";

const DEMO_PARTITION = "persist:klyra-demo";
const DEMO_WINDOW_TITLE = "Klyra Demo";
const RECORDING_START_TIMEOUT_MS = 30_000;
const RECORDING_STOP_TIMEOUT_MS = 120_000;

export type AutoDemoStatus =
	| { phase: "idle" }
	| { phase: "capturing" }
	| { phase: "loading" }
	| { phase: "waiting-for-recording" }
	| { phase: "playing"; stepIndex: number; stepCount: number }
	| { phase: "finishing" }
	| { phase: "done" }
	| { phase: "error"; message: string; stepIndex?: number };

let demoSession: Session | null = null;
let demoWindow: BrowserWindow | null = null;
let capturing = false;
let running = false;
let cancelRequested = false;

/** Demo pages browse the open web on purpose, so they skip the app's navigation lock. */
export function isAutoDemoWebContents(contents: WebContents): boolean {
	return demoSession !== null && contents.session === demoSession;
}

function getDemoSession(): Session {
	if (!demoSession) {
		demoSession = session.fromPartition(DEMO_PARTITION);
		demoSession.setPermissionRequestHandler((_contents, _permission, callback) =>
			callback(false),
		);
		demoSession.setPermissionCheckHandler(() => false);
	}
	return demoSession;
}

function sendToControl(channel: string, payload: unknown) {
	const control = getAutoDemoControlWindow();
	if (control) {
		control.webContents.send(channel, payload);
	}
}

function setStatus(status: AutoDemoStatus) {
	sendToControl("auto-demo:status", status);
}

function getOpenDemoWindow(): BrowserWindow | null {
	return demoWindow && !demoWindow.isDestroyed() ? demoWindow : null;
}

function openDemoWindow(): BrowserWindow {
	const existing = getOpenDemoWindow();
	if (existing) {
		existing.show();
		existing.focus();
		return existing;
	}

	const win = new BrowserWindow({
		width: 1280,
		height: 800,
		title: DEMO_WINDOW_TITLE,
		backgroundColor: "#ffffff",
		webPreferences: {
			session: getDemoSession(),
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
		},
	});
	win.setMenuBarVisibility(false);
	// A fixed title keeps the window easy to find as a capture source.
	win.on("page-title-updated", (event) => event.preventDefault());
	win.webContents.setWindowOpenHandler(({ url }) => {
		const safeUrl = normalizeDemoUrl(url);
		if (safeUrl) {
			void win.loadURL(safeUrl).catch(() => undefined);
		}
		return { action: "deny" };
	});
	win.webContents.on("will-navigate", (event, url) => {
		if (!normalizeDemoUrl(url)) {
			event.preventDefault();
		}
	});
	win.webContents.on("dom-ready", () => {
		if (capturing) {
			void win.webContents.executeJavaScript(RECORDER_SCRIPT).catch(() => undefined);
		}
	});
	win.webContents.on("console-message", (...args: unknown[]) => {
		if (!capturing) {
			return;
		}
		const details = args[0] as { message?: unknown } | undefined;
		const message = typeof details?.message === "string" ? details.message : args[2];
		if (typeof message !== "string" || !message.startsWith(STEP_MESSAGE_PREFIX)) {
			return;
		}
		try {
			const step = normalizeDemoStep(JSON.parse(message.slice(STEP_MESSAGE_PREFIX.length)));
			if (step) {
				sendToControl("auto-demo:step", step);
			}
		} catch {
			// Ignore malformed messages; the page can print anything.
		}
	});
	win.on("closed", () => {
		if (demoWindow === win) {
			demoWindow = null;
		}
		if (capturing) {
			capturing = false;
			setStatus({ phase: "idle" });
		}
		if (running) {
			cancelRequested = true;
		}
	});
	demoWindow = win;
	return win;
}

async function loadDemoUrl(win: BrowserWindow, url: string) {
	await win.webContents.loadURL(url).catch(() => undefined);
	await waitForPageLoad(win);
}

async function waitFor(predicate: () => boolean, timeoutMs: number) {
	const endAt = Date.now() + timeoutMs;
	while (Date.now() < endAt) {
		if (predicate()) {
			return true;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return predicate();
}

function toNormalizedPoint(win: BrowserWindow, point: { x: number; y: number }) {
	const bounds = win.getBounds();
	const content = win.getContentBounds();
	return {
		cx: (content.x + point.x - bounds.x) / Math.max(1, bounds.width),
		cy: (content.y + point.y - bounds.y) / Math.max(1, bounds.height),
	};
}

async function runDemo(rawScenario: unknown): Promise<{ success: boolean; error?: string }> {
	const scenario = normalizeDemoScenario(rawScenario);
	if (!scenario) {
		return { success: false, error: "invalid-scenario" };
	}
	if (running) {
		return { success: false, error: "already-running" };
	}
	const hud = getHudOverlayWindow();
	if (!hud) {
		return { success: false, error: "hud-unavailable" };
	}

	running = true;
	cancelRequested = false;
	capturing = false;
	let recordingStarted = false;
	let succeeded = false;
	try {
		setStatus({ phase: "loading" });
		const win = openDemoWindow();
		await loadDemoUrl(win, scenario.url);
		await new Promise((resolve) => setTimeout(resolve, 600));

		setSelectedSource({
			id: win.getMediaSourceId(),
			name: DEMO_WINDOW_TITLE,
			sourceType: "window",
			windowTitle: DEMO_WINDOW_TITLE,
			appName: "Klyra",
		});
		broadcastSelectedSourceChange();
		const [contentWidth, contentHeight] = win.getContentSize();
		setSyntheticCursorPoint(
			toNormalizedPoint(win, { x: contentWidth * 0.5, y: contentHeight * 0.55 }),
		);

		setStatus({ phase: "waiting-for-recording" });
		hud.webContents.send("auto-demo:start-recording");
		recordingStarted = await waitFor(
			() => isCursorCaptureActive || cancelRequested,
			RECORDING_START_TIMEOUT_MS,
		);
		if (!recordingStarted || cancelRequested) {
			throw new Error(cancelRequested ? "cancelled" : "recording-did-not-start");
		}
		win.focus();
		await new Promise((resolve) => setTimeout(resolve, 700));

		await playDemoSteps(win, scenario.steps, {
			onCursor: (point) => setSyntheticCursorPoint(toNormalizedPoint(win, point)),
			onClick: (point, phase) => {
				if (!isCursorCaptureActive) {
					return;
				}
				const { cx, cy } = toNormalizedPoint(win, point);
				pushCursorSample(
					cx,
					cy,
					getCursorCaptureElapsedMs(),
					phase === "down" ? "click" : "mouseup",
				);
			},
			onStep: (stepIndex) =>
				setStatus({ phase: "playing", stepIndex, stepCount: scenario.steps.length }),
			isCancelled: () => cancelRequested || win.isDestroyed(),
		});

		setStatus({ phase: "finishing" });
		succeeded = true;
		return { success: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		setStatus({
			phase: "error",
			message,
			...(error instanceof DemoStepError ? { stepIndex: error.stepIndex } : {}),
		});
		return { success: false, error: message };
	} finally {
		if (recordingStarted && isCursorCaptureActive) {
			hud.webContents.send("stop-recording-from-tray");
			await waitFor(() => !isCursorCaptureActive, RECORDING_STOP_TIMEOUT_MS);
		}
		setSyntheticCursorPoint(null);
		running = false;
		const win = getOpenDemoWindow();
		if (win) {
			setTimeout(() => {
				if (!win.isDestroyed() && !running) {
					win.close();
				}
			}, 1_500);
		}
		if (succeeded) {
			setStatus({ phase: "done" });
		} else if (cancelRequested) {
			setStatus({ phase: "idle" });
		}
	}
}

export function registerAutoDemoHandlers() {
	ipcMain.handle("auto-demo:open-control", () => {
		createAutoDemoControlWindow();
	});

	ipcMain.handle("auto-demo:start-capture", async (_event, rawUrl: unknown) => {
		const url = normalizeDemoUrl(rawUrl);
		if (!url) {
			return { success: false, error: "invalid-url" };
		}
		if (running) {
			return { success: false, error: "already-running" };
		}
		capturing = true;
		const win = openDemoWindow();
		setStatus({ phase: "capturing" });
		await loadDemoUrl(win, url);
		return { success: true, url };
	});

	ipcMain.handle("auto-demo:stop-capture", () => {
		capturing = false;
		setStatus({ phase: "idle" });
		const win = getOpenDemoWindow();
		if (win) {
			win.close();
		}
		return { success: true };
	});

	ipcMain.handle("auto-demo:run", (_event, scenario: unknown) => runDemo(scenario));

	ipcMain.handle("auto-demo:cancel", () => {
		cancelRequested = true;
		return { success: true };
	});
}

export type { DemoStep };
