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
	const panels: { fields: { id: string; defaultValue: unknown }[] }[] = [];
	module.activate({
		registerSettingsPanel: (panel: (typeof panels)[number]) => panels.push(panel),
		registerRenderHook: (phase: string, hook: HookFn) => hooks.push({ phase, hook }),
		getSetting: (id: string) => settings.get(id),
		setSetting: (id: string, value: unknown) => settings.set(id, value),
	});
	return { manifest, settings, hooks, panels };
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
			smoothedCursor: { cx: 0.5, cy: 0.5, trail: [] },
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

			it("draws nothing until it is enabled", async () => {
				const { hooks } = await loadExtension(dir);
				expect(hooks.length).toBeGreaterThan(0);
				expect(runHooks(hooks, 500)).toEqual([]);
			});

			it("draws once enabled", async () => {
				const { hooks, settings, panels } = await loadExtension(dir);
				expect(panels[0].fields.find((field) => field.id === "enabled")?.defaultValue).toBe(
					false,
				);
				settings.set("enabled", true);
				expect(runHooks(hooks, 500).length).toBeGreaterThan(0);
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
