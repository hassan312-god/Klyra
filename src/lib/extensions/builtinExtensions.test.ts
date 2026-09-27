import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const BUILTIN_DIR = path.join(process.cwd(), "public", "builtin-extensions");
const VALID_PERMISSIONS = new Set([
	"render",
	"cursor",
	"audio",
	"timeline",
	"ui",
	"assets",
	"export",
]);

type HookFn = (context: Record<string, unknown>) => void;

function createCanvasContextStub() {
	const calls: string[] = [];
	const gradient = { addColorStop: () => undefined };
	const ctx = new Proxy(
		{
			measureText: (text: string) => ({ width: text.length * 10 }),
			createRadialGradient: () => gradient,
			createLinearGradient: () => gradient,
		} as Record<string, unknown>,
		{
			get(target, prop: string) {
				if (prop in target) return target[prop];
				return (..._args: unknown[]) => {
					calls.push(prop);
				};
			},
			set(target, prop: string, value) {
				target[prop] = value;
				return true;
			},
		},
	);
	return { ctx, calls };
}

async function loadExtension(dir: string) {
	const manifest = JSON.parse(readFileSync(path.join(dir, "klyra-extension.json"), "utf-8"));
	const module = await import(pathToFileURL(path.join(dir, manifest.main)).href);
	const settings = new Map<string, unknown>();
	const hooks: { phase: string; hook: HookFn }[] = [];
	const cursorEffects: ((context: Record<string, unknown>) => boolean)[] = [];
	const frames: { id: string; draw: (ctx: unknown, w: number, h: number) => void }[] = [];
	const wallpapers: { file: string; thumbnail?: string }[] = [];
	const panels: { fields: { id: string; defaultValue: unknown }[] }[] = [];
	module.activate({
		registerSettingsPanel: (panel: (typeof panels)[number]) => panels.push(panel),
		registerRenderHook: (phase: string, hook: HookFn) => hooks.push({ phase, hook }),
		registerCursorEffect: (effect: (typeof cursorEffects)[number]) =>
			cursorEffects.push(effect),
		registerFrame: (frame: (typeof frames)[number]) => frames.push(frame),
		registerWallpaper: (wallpaper: (typeof wallpapers)[number]) => wallpapers.push(wallpaper),
		getSetting: (id: string) => settings.get(id),
		setSetting: (id: string, value: unknown) => settings.set(id, value),
	});
	return { manifest, module, settings, hooks, cursorEffects, frames, wallpapers, panels };
}

function runCursorEffects(
	effects: ((context: Record<string, unknown>) => boolean)[],
	elapsedMs: number,
) {
	const { ctx, calls } = createCanvasContextStub();
	const alive = effects.map((effect) =>
		effect({
			ctx,
			width: 1920,
			height: 1080,
			timeMs: 1000,
			cx: 0.5,
			cy: 0.5,
			interactionType: "click",
			elapsedMs,
		}),
	);
	return { calls, alive };
}

function runHooks(hooks: { hook: HookFn }[], timeMs: number) {
	const { ctx, calls } = createCanvasContextStub();
	for (const { hook } of hooks) {
		hook({
			ctx,
			width: 1920,
			height: 1080,
			timeMs,
			durationMs: 10_000,
			cursor: { cx: 0.5, cy: 0.5 },
			smoothedCursor: {
				cx: 0.5,
				cy: 0.5,
				trail: [
					{ cx: 0.48, cy: 0.5 },
					{ cx: 0.45, cy: 0.49 },
					{ cx: 0.4, cy: 0.47 },
				],
			},
		});
	}
	return calls;
}

const extensionDirs = readdirSync(BUILTIN_DIR).map((name) => path.join(BUILTIN_DIR, name));

describe("builtin extensions", () => {
	it("ships at least one extension", () => {
		expect(extensionDirs.length).toBeGreaterThan(0);
	});

	for (const dir of extensionDirs) {
		describe(path.basename(dir), () => {
			it("has a valid manifest", async () => {
				const { manifest } = await loadExtension(dir);
				expect(manifest.id).toMatch(/^[a-z0-9][a-z0-9._-]*$/i);
				expect(manifest.name).toBeTruthy();
				expect(manifest.main).toBe("index.js");
				for (const permission of manifest.permissions) {
					expect(VALID_PERMISSIONS.has(permission)).toBe(true);
				}
			});

			it("contributes something", async () => {
				const { hooks, cursorEffects, frames, wallpapers } = await loadExtension(dir);
				expect(
					hooks.length + cursorEffects.length + frames.length + wallpapers.length,
				).toBeGreaterThan(0);
			});

			it("draws nothing until it is enabled, then draws", async () => {
				const { hooks, cursorEffects, settings, panels } = await loadExtension(dir);
				if (hooks.length === 0 && cursorEffects.length === 0) return;
				expect(panels[0].fields.find((field) => field.id === "enabled")?.defaultValue).toBe(
					false,
				);
				// Early in the video (intro effects) and near the end (outro effects).
				expect(runHooks(hooks, 500)).toEqual([]);
				expect(runCursorEffects(cursorEffects, 100).calls).toEqual([]);
				settings.set("enabled", true);
				const drawn =
					runHooks(hooks, 500).length +
					runHooks(hooks, 3500).length +
					runHooks(hooks, 9000).length +
					runCursorEffects(cursorEffects, 100).calls.length;
				expect(drawn).toBeGreaterThan(0);
			});
		});
	}
});

describe("beat sync cursor", () => {
	it("pulses deterministically from the video time", async () => {
		const { hooks, settings } = await loadExtension(path.join(BUILTIN_DIR, "beat-sync-cursor"));
		settings.set("enabled", true);
		settings.set("track", "custom");
		settings.set("customBpm", 120);
		// Same timestamp always produces the same drawing, so preview matches export.
		expect(runHooks(hooks, 1234)).toEqual(runHooks(hooks, 1234));
		// Nothing is drawn before the music starts.
		settings.set("musicStart", 2);
		expect(runHooks(hooks, 1000)).toEqual([]);
	});
});

describe("device frames", () => {
	it("leaves the screen area transparent inside each frame", async () => {
		const { frames } = await loadExtension(path.join(BUILTIN_DIR, "device-frames"));
		expect(frames.length).toBe(4);
		for (const frame of frames as unknown as {
			draw: (ctx: unknown, w: number, h: number) => void;
			screenInsets: { top: number; right: number; bottom: number; left: number };
		}[]) {
			const { ctx, calls } = createCanvasContextStub();
			// Renderers call draw() detached from the frame object.
			const detachedDraw = frame.draw;
			detachedDraw(ctx, 1600, 1000);
			expect(calls).toContain("clearRect");
			const { top, right, bottom, left } = frame.screenInsets;
			expect(left + right).toBeLessThan(0.5);
			expect(top + bottom).toBeLessThan(0.5);
		}
	});
});

describe("brand wallpapers", () => {
	it("ships every referenced image", async () => {
		const dir = path.join(BUILTIN_DIR, "brand-wallpapers");
		const { wallpapers } = await loadExtension(dir);
		expect(wallpapers.length).toBe(6);
		for (const wallpaper of wallpapers) {
			for (const file of [wallpaper.file, wallpaper.thumbnail]) {
				expect(file && readFileSync(path.join(dir, file)).length).toBeGreaterThan(0);
			}
		}
	});
});

describe("chapters", () => {
	it("parses m:ss entries in time order", async () => {
		const { module } = await loadExtension(path.join(BUILTIN_DIR, "chapters"));
		expect(module.parseChapters("1:02 Export | 0:05 Sign up\n12.5 Invite")).toEqual([
			{ startSeconds: 5, title: "Sign up" },
			{ startSeconds: 12.5, title: "Invite" },
			{ startSeconds: 62, title: "Export" },
		]);
	});
});

describe("end call to action", () => {
	it("only shows during the last seconds of the timeline", async () => {
		const { hooks, settings } = await loadExtension(path.join(BUILTIN_DIR, "end-cta"));
		settings.set("enabled", true);
		settings.set("seconds", 4);
		// runHooks uses a 10 s timeline.
		expect(runHooks(hooks, 5000)).toEqual([]);
		expect(runHooks(hooks, 7000).length).toBeGreaterThan(0);
	});
});
