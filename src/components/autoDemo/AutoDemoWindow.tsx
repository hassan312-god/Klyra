import {
	ArrowDownIcon,
	ArrowUpIcon,
	CursorClickIcon,
	GlobeIcon,
	HourglassIcon,
	KeyboardIcon,
	MouseScrollIcon,
	RecordIcon,
	StopIcon,
	TextTIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useScopedT } from "@/contexts/I18nContext";
import {
	appendRecordedStep,
	type DemoStep,
	normalizeDemoScenario,
	normalizeDemoStep,
	normalizeDemoUrl,
} from "@/lib/autoDemo/scenario";

type Status =
	| { phase: "idle" | "capturing" | "loading" | "waiting-for-recording" | "finishing" | "done" }
	| { phase: "playing"; stepIndex: number; stepCount: number }
	| { phase: "error"; message: string; stepIndex?: number };

const STORAGE_KEY = "klyra.autoDemo.scenario";

function loadSaved(): { url: string; steps: DemoStep[] } {
	try {
		const scenario = normalizeDemoScenario(
			JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"),
		);
		if (scenario) {
			return { url: scenario.url, steps: scenario.steps };
		}
	} catch {
		// A missing or broken save just starts empty.
	}
	return { url: "", steps: [] };
}

const STEP_ICONS = {
	click: CursorClickIcon,
	type: TextTIcon,
	press: KeyboardIcon,
	scroll: MouseScrollIcon,
	wait: HourglassIcon,
	navigate: GlobeIcon,
} as const;

export function AutoDemoWindow() {
	const t = useScopedT("launch");
	const [initial] = useState(loadSaved);
	const [url, setUrl] = useState(initial.url);
	const [steps, setSteps] = useState<DemoStep[]>(initial.steps);
	const [status, setStatus] = useState<Status>({ phase: "idle" });
	const [notice, setNotice] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const capturing = status.phase === "capturing";
	const busy =
		status.phase === "loading" ||
		status.phase === "waiting-for-recording" ||
		status.phase === "playing" ||
		status.phase === "finishing";

	useEffect(() => {
		try {
			const normalizedUrl = normalizeDemoUrl(url);
			if (normalizedUrl) {
				localStorage.setItem(
					STORAGE_KEY,
					JSON.stringify({ version: 1, url: normalizedUrl, steps }),
				);
			}
		} catch {
			// Saving is a convenience only.
		}
	}, [url, steps]);

	useEffect(() => {
		const removeStep = window.electronAPI.onAutoDemoStep((raw) => {
			const step = normalizeDemoStep(raw);
			if (step) {
				setSteps((current) => appendRecordedStep(current, step));
			}
		});
		const removeStatus = window.electronAPI.onAutoDemoStatus((raw) => {
			setStatus(raw as Status);
		});
		return () => {
			removeStep();
			removeStatus();
		};
	}, []);

	const startCapture = useCallback(async () => {
		const normalizedUrl = normalizeDemoUrl(url);
		if (!normalizedUrl) {
			setNotice(t("autoDemo.invalidUrl"));
			return;
		}
		setNotice(null);
		setUrl(normalizedUrl);
		await window.electronAPI.autoDemoStartCapture(normalizedUrl);
	}, [url, t]);

	const run = useCallback(async () => {
		const scenario = normalizeDemoScenario({ version: 1, url, steps });
		if (!scenario) {
			setNotice(t("autoDemo.invalidUrl"));
			return;
		}
		setNotice(null);
		await window.electronAPI.autoDemoRun(scenario);
	}, [url, steps, t]);

	const updateStep = (index: number, next: DemoStep) =>
		setSteps((current) => current.map((step, i) => (i === index ? next : step)));
	const moveStep = (index: number, delta: number) =>
		setSteps((current) => {
			const target = index + delta;
			if (target < 0 || target >= current.length) {
				return current;
			}
			const copy = [...current];
			[copy[index], copy[target]] = [copy[target], copy[index]];
			return copy;
		});
	const removeStep = (index: number) =>
		setSteps((current) => current.filter((_, i) => i !== index));

	const exportScenario = () => {
		const scenario = normalizeDemoScenario({ version: 1, url, steps });
		if (!scenario) {
			setNotice(t("autoDemo.invalidUrl"));
			return;
		}
		const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: "application/json" });
		const link = document.createElement("a");
		link.href = URL.createObjectURL(blob);
		link.download = "klyra-demo.json";
		link.click();
		URL.revokeObjectURL(link.href);
	};

	const importScenario = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) {
			return;
		}
		try {
			const scenario = normalizeDemoScenario(JSON.parse(await file.text()));
			if (!scenario) {
				throw new Error("invalid");
			}
			setUrl(scenario.url);
			setSteps(scenario.steps);
			setNotice(null);
		} catch {
			setNotice(t("autoDemo.invalidFile"));
		}
	};

	const stepTitle = (step: DemoStep) => {
		switch (step.type) {
			case "click":
				return t("autoDemo.stepClick");
			case "type":
				return t("autoDemo.stepType");
			case "press":
				return t("autoDemo.stepPress");
			case "scroll":
				return t("autoDemo.stepScroll");
			case "wait":
				return t("autoDemo.stepWait");
			case "navigate":
				return t("autoDemo.stepNavigate");
		}
	};

	const statusText = (() => {
		switch (status.phase) {
			case "loading":
				return t("autoDemo.statusLoading");
			case "waiting-for-recording":
				return t("autoDemo.statusWaiting");
			case "playing":
				return t("autoDemo.statusPlaying", undefined, {
					current: status.stepIndex + 1,
					total: status.stepCount,
				});
			case "finishing":
				return t("autoDemo.statusFinishing");
			case "done":
				return t("autoDemo.statusDone");
			case "error":
				return t("autoDemo.statusError", undefined, {
					message:
						status.stepIndex !== undefined
							? `${status.message} (#${status.stepIndex + 1})`
							: status.message,
				});
			default:
				return null;
		}
	})();

	const hasPasswordGap = steps.some((step) => step.type === "type" && step.text === "");

	return (
		<div className="flex h-screen flex-col gap-4 overflow-hidden bg-editor-bg p-5 text-foreground">
			<header>
				<h1 className="text-lg font-semibold">{t("autoDemo.title")}</h1>
				<p className="mt-1 text-sm text-foreground/65">{t("autoDemo.subtitle")}</p>
			</header>

			<label className="flex flex-col gap-1.5 text-sm">
				<span className="font-medium">{t("autoDemo.urlLabel")}</span>
				<input
					className="rounded-lg border border-foreground/15 bg-foreground/5 px-3 py-2 outline-none focus:border-[#2f6bff]"
					value={url}
					placeholder={t("autoDemo.urlPlaceholder")}
					disabled={capturing || busy}
					onChange={(event) => setUrl(event.target.value)}
				/>
			</label>

			<div className="flex gap-2">
				{capturing ? (
					<Button
						className="flex-1"
						variant="secondary"
						onClick={() => void window.electronAPI.autoDemoStopCapture()}
					>
						<StopIcon size={16} /> {t("autoDemo.stopCapture")}
					</Button>
				) : (
					<Button
						className="flex-1"
						variant="secondary"
						disabled={busy}
						onClick={() => void startCapture()}
					>
						<CursorClickIcon size={16} /> {t("autoDemo.startCapture")}
					</Button>
				)}
				{busy ? (
					<Button
						className="flex-1"
						variant="destructive"
						onClick={() => void window.electronAPI.autoDemoCancel()}
					>
						<StopIcon size={16} /> {t("autoDemo.cancel")}
					</Button>
				) : (
					<Button
						className="flex-1"
						disabled={capturing || steps.length === 0}
						onClick={run}
					>
						<RecordIcon size={16} weight="fill" /> {t("autoDemo.run")}
					</Button>
				)}
			</div>

			{capturing && (
				<p className="text-xs text-foreground/65">{t("autoDemo.capturingHint")}</p>
			)}
			{statusText && (
				<p
					className={
						status.phase === "error"
							? "text-sm text-red-400"
							: "text-sm text-foreground/80"
					}
				>
					{statusText}
				</p>
			)}
			{notice && <p className="text-sm text-red-400">{notice}</p>}

			<div className="flex items-center justify-between">
				<h2 className="text-sm font-semibold">
					{t("autoDemo.steps")} ({steps.length})
				</h2>
				<div className="flex gap-1">
					<Button
						size="sm"
						variant="ghost"
						disabled={busy}
						onClick={() =>
							setSteps((current) => [...current, { type: "wait", ms: 1000 }])
						}
					>
						<HourglassIcon size={14} /> {t("autoDemo.addWait")}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						disabled={busy}
						onClick={() => fileInputRef.current?.click()}
					>
						{t("autoDemo.import")}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						disabled={steps.length === 0}
						onClick={exportScenario}
					>
						{t("autoDemo.export")}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						disabled={busy || steps.length === 0}
						onClick={() => setSteps([])}
					>
						{t("autoDemo.clear")}
					</Button>
				</div>
				<input
					ref={fileInputRef}
					type="file"
					accept="application/json,.json"
					className="hidden"
					onChange={(event) => void importScenario(event)}
				/>
			</div>

			<ol className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
				{steps.length === 0 && (
					<li className="rounded-lg border border-dashed border-foreground/15 p-4 text-center text-sm text-foreground/55">
						{t("autoDemo.noSteps")}
					</li>
				)}
				{steps.map((step, index) => {
					const Icon = STEP_ICONS[step.type];
					const active = status.phase === "playing" && status.stepIndex === index;
					return (
						<li
							key={index}
							className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${
								active
									? "border-[#2f6bff] bg-[#2f6bff]/10"
									: "border-foreground/10 bg-foreground/5"
							}`}
						>
							<span className="w-5 text-right text-xs text-foreground/45">
								{index + 1}
							</span>
							<Icon size={16} className="shrink-0 text-foreground/70" />
							<span className="shrink-0 font-medium">{stepTitle(step)}</span>
							<span className="min-w-0 flex-1 truncate text-foreground/65">
								{step.type === "type" ? (
									<input
										className="w-full rounded border border-foreground/10 bg-transparent px-1.5 py-0.5"
										value={step.text}
										disabled={busy}
										placeholder={step.label}
										onChange={(event) =>
											updateStep(index, { ...step, text: event.target.value })
										}
									/>
								) : step.type === "wait" ? (
									<span className="flex items-center gap-1">
										<input
											type="number"
											min={0}
											max={60}
											step={0.5}
											className="w-16 rounded border border-foreground/10 bg-transparent px-1.5 py-0.5"
											value={step.ms / 1000}
											disabled={busy}
											onChange={(event) =>
												updateStep(index, {
													type: "wait",
													ms:
														Math.max(
															0,
															Number(event.target.value) || 0,
														) * 1000,
												})
											}
										/>
										{t("autoDemo.seconds")}
									</span>
								) : step.type === "click" ? (
									(step.label ?? step.selector)
								) : step.type === "press" ? (
									step.key
								) : step.type === "scroll" ? (
									`${step.y}px`
								) : (
									step.url
								)}
							</span>
							<button
								type="button"
								title={t("autoDemo.moveUp")}
								disabled={busy || index === 0}
								className="text-foreground/50 hover:text-foreground disabled:opacity-30"
								onClick={() => moveStep(index, -1)}
							>
								<ArrowUpIcon size={14} />
							</button>
							<button
								type="button"
								title={t("autoDemo.moveDown")}
								disabled={busy || index === steps.length - 1}
								className="text-foreground/50 hover:text-foreground disabled:opacity-30"
								onClick={() => moveStep(index, 1)}
							>
								<ArrowDownIcon size={14} />
							</button>
							<button
								type="button"
								title={t("autoDemo.remove")}
								disabled={busy}
								className="text-foreground/50 hover:text-red-400 disabled:opacity-30"
								onClick={() => removeStep(index)}
							>
								<TrashIcon size={14} />
							</button>
						</li>
					);
				})}
			</ol>

			<footer className="text-xs text-foreground/50">
				{hasPasswordGap ? t("autoDemo.passwordHint") : t("autoDemo.hint")}
			</footer>
		</div>
	);
}
