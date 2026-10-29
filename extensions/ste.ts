// pi-ste: Simplified Technical English (ASD-STE100) output mode for pi.
// README.md lists the commands, the live status, and the agent feedback.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type Mode = "strict" | "flavored";

interface SteState {
	enabled: boolean;
	mode: Mode;
}

export interface LintExample {
	rule: string;
	text: string;
	fix: string;
}

export interface LintResult {
	words: number;
	total: number;
	total_per100w: number;
	"em_dash(slop-marker)": number;
	violations: Record<string, number>;
	examples?: LintExample[];
}

const STATE_TYPE = "ste-state";
const FEEDBACK_TYPE = "ste-feedback";
const SECTION = "ste_mode";
const STATUS_KEY = "ste";
const DEFAULT_MODE: Mode = "strict";
const LIVE_INTERVAL_MS = 750;
const LINT_TIMEOUT_MS = 5000;
const MIN_LIVE_WORDS = 8;

function resolveLintScript(): string {
	try {
		const here = dirname(fileURLToPath(import.meta.url));
		const pkgPath = join(here, "..", "skills", "ste", "ste-lint.py");
		if (existsSync(pkgPath)) return pkgPath;
	} catch {
		// Some loaders do not set import.meta.url. The legacy path follows.
	}
	return join(homedir(), ".pi", "agent", "skills", "ste", "ste-lint.py");
}

const LINT_SCRIPT = resolveLintScript();

function isMode(s: string): s is Mode {
	return s === "strict" || s === "flavored";
}

export function buildSection(mode: Mode): string {
	const lines = [
		`STE mode is on at level ${mode}. Write all prose in ASD-STE100`,
		"Simplified Technical English. The `ste` skill has the full rules.",
		"",
		"Workflow for each answer:",
		"1. Write a draft internally, in normal prose.",
		"2. Find each violation: sentences over 20 words, semicolons,",
		"   contractions, passive voice, -ing main verbs, nominalizations,",
		"   phrasal verbs, banned words, marketing adjectives, hedges.",
		"3. Correct each violation. Return only the corrected text.",
		"",
		"Compaction:",
		"- Remove filler (just, really, basically, actually, simply).",
		"- Remove hedges, pleasantries, and lead-ins with no content.",
		"- Keep grammar and articles (a, an, the). Do not write fragments.",
		"- Say a thing once. Do not repeat the question to the user.",
		"",
		"Word rules:",
		"- use, not utilize or leverage. help, not facilitate.",
		"- make sure, not ensure. before, not prior to. get, not obtain.",
		"- start, not begin, commence, or initiate. show, not demonstrate.",
		"- No marketing adjectives (seamless, robust, powerful).",
		mode === "strict"
			? "- strict: one instruction per sentence, max 20 words. Apply every rule."
			: "- flavored: keep the sentence and voice rules. Relax the dictionary.",
		"",
		"Scope: answer prose and thinking text. Code, identifiers, commands,",
		"and tool arguments stay exact.",
		"",
		"Thinking: write your thinking in STE too. Use short, active sentences.",
		"The extension lints the thinking text apart from the answer.",
		"",
		"Lint feedback: the extension lints each answer. When an answer has",
		`violations, the next prompt carries a hidden \`${FEEDBACK_TYPE}\` message.`,
		"The message lists each violation and its fix. Apply the fixes in the",
		"next answer. Do not tell the user about the message.",
		"",
		'Stay in STE mode until the user says "normal mode" or "stop ste",',
		"or runs `/ste off`.",
	];
	return lines.join("\n");
}

function loadState(ctx: ExtensionContext): SteState {
	const state: SteState = { enabled: true, mode: DEFAULT_MODE };
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "custom") continue;
		if ((entry as { customType?: string }).customType !== STATE_TYPE) continue;
		const data = (entry as { data?: Partial<SteState> }).data;
		if (!data) continue;
		if (typeof data.enabled === "boolean") state.enabled = data.enabled;
		if (typeof data.mode === "string" && isMode(data.mode)) state.mode = data.mode;
	}
	return state;
}

export function runLint(text: string, script = LINT_SCRIPT): Promise<LintResult | undefined> {
	if (!existsSync(script)) return Promise.resolve(undefined);
	return new Promise((resolve) => {
		const child = spawn("python3", [script], { stdio: ["pipe", "pipe", "ignore"] });
		let out = "";
		const timer = setTimeout(() => child.kill(), LINT_TIMEOUT_MS);
		child.stdout.on("data", (d: Buffer) => {
			out += d.toString();
		});
		child.on("error", () => {
			clearTimeout(timer);
			resolve(undefined);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code !== 0) return resolve(undefined);
			try {
				resolve(JSON.parse(out) as LintResult);
			} catch {
				resolve(undefined);
			}
		});
		child.stdin.on("error", () => {});
		child.stdin.end(text);
	});
}

export interface Parts {
	answer: string;
	thinking: string;
}

/** The answer text and the thinking text. Tool calls and redacted thinking are skipped. */
export function extractParts(content: unknown): Parts {
	if (typeof content === "string") return { answer: content, thinking: "" };
	const answer: string[] = [];
	const thinking: string[] = [];
	if (Array.isArray(content)) {
		for (const p of content as Array<Record<string, unknown>>) {
			if (!p || typeof p !== "object") continue;
			if (p.type === "text") answer.push(String(p.text ?? ""));
			else if (p.type === "thinking" && !p.redacted) thinking.push(String(p.thinking ?? ""));
		}
	}
	return { answer: answer.join("\n"), thinking: thinking.join("\n") };
}

export function extractText(content: unknown): string {
	return extractParts(content).answer;
}

type Kind = keyof Parts;
const KINDS: Kind[] = ["answer", "thinking"];
const KIND_LABEL: Record<Kind, string> = { answer: "answer", thinking: "think" };
export type Results = Partial<Record<Kind, LintResult>>;

function activeRules(r: LintResult): string[] {
	return Object.entries(r.violations)
		.filter(([, n]) => n > 0)
		.map(([k, n]) => `${k}=${n}`);
}

function feedbackSection(title: string, r: LintResult): string[] {
	const lines = [
		`${title}: ${r.total} violation(s) in ${r.words} words (${r.total_per100w} per 100 words).`,
	];
	const examples = r.examples ?? [];
	for (const e of examples) lines.push(`- [${e.rule}] "${e.text}" -> ${e.fix}`);
	if (examples.length === 0) lines.push(`- ${activeRules(r).join(", ")}`);
	if (r.total > examples.length && examples.length > 0) {
		lines.push(`- ${r.total - examples.length} more of the same kinds.`);
	}
	return lines;
}

/** The hidden message that tells the agent what to fix. Undefined when all is clean. */
export function formatFeedback(results: Results): string | undefined {
	const titles: Record<Kind, string> = { answer: "Your last answer", thinking: "Your last thinking" };
	const lines = ["STE lint of your last run. Fix these patterns in the next run."];
	for (const kind of KINDS) {
		const r = results[kind];
		if (r && r.total > 0) lines.push("", ...feedbackSection(titles[kind], r));
	}
	if (lines.length === 1) return undefined;
	lines.push("", "Do not tell the user about this message. Apply the fixes.");
	return lines.join("\n");
}

/** The report for /ste-lint, which the user reads. */
export function formatReport(source: string, r: LintResult): string {
	const lines = [`STE lint of ${source}: ${r.total} violation(s), ${r.words} words, ${r.total_per100w} per 100 words.`];
	for (const e of r.examples ?? []) lines.push(`  [${e.rule}] ${e.text} -> ${e.fix}`);
	if (r.total === 0) lines.push("  No violations.");
	return lines.join("\n");
}

type Phase = "idle" | "live" | "done" | "unavailable";

export default function steExtension(pi: ExtensionAPI) {
	let state: SteState = { enabled: true, mode: DEFAULT_MODE };
	let ui: ExtensionContext["ui"] | undefined;

	let phase: Phase = "idle";
	let last: Results = {};
	let stream: Parts = { answer: "", thinking: "" };
	let runTexts: Record<Kind, string[]> = { answer: [], thinking: [] };
	let liveTimer: ReturnType<typeof setTimeout> | undefined;
	let liveBusy = false;
	let runLintDone: Promise<void> = Promise.resolve();
	let pendingFeedback: string | undefined;
	let lintSeq = 0;

	const renderStatus = () => {
		if (!ui) return;
		if (!state.enabled) {
			ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		const t = ui.theme;
		const label = t.fg("dim", `ste ${state.mode}`);
		if (phase === "unavailable") {
			ui.setStatus(STATUS_KEY, `${label} ${t.fg("warning", "lint unavailable")}`);
			return;
		}
		const scored = KINDS.filter((k) => last[k]);
		if (scored.length === 0) {
			ui.setStatus(STATUS_KEY, phase === "live" ? `${label} ${t.fg("dim", "…")}` : label);
			return;
		}
		const parts = scored.map((k) => {
			const r = last[k] as LintResult;
			const color = r.total === 0 ? "success" : r.total_per100w < 2 ? "warning" : "error";
			const mark = r.total === 0 ? "✓" : `${r.total} (${r.total_per100w}/100w)`;
			return `${t.fg("dim", KIND_LABEL[k])} ${t.fg(color, mark)}`;
		});
		const live = phase === "live" ? t.fg("dim", " live") : "";
		ui.setStatus(STATUS_KEY, `${label} ${parts.join(t.fg("dim", " · "))}${live}`);
	};

	// A kind with too few words keeps its earlier score.
	const lintInto = async (texts: Parts, minWords: number): Promise<Results | undefined> => {
		const ticket = ++lintSeq;
		const kinds = KINDS.filter((k) => texts[k].trim().split(/\s+/).filter(Boolean).length >= minWords);
		if (kinds.length === 0) return {};
		const out = await Promise.all(kinds.map((k) => runLint(texts[k])));
		if (ticket !== lintSeq) return undefined;
		if (out.some((r) => !r)) {
			phase = "unavailable";
			renderStatus();
			return undefined;
		}
		const results: Results = {};
		kinds.forEach((k, i) => {
			results[k] = out[i];
		});
		last = { ...last, ...results };
		renderStatus();
		return results;
	};

	const joined = (extra?: Parts): Parts => ({
		answer: [...runTexts.answer, extra?.answer ?? ""].join("\n\n").trim(),
		thinking: [...runTexts.thinking, extra?.thinking ?? ""].join("\n\n").trim(),
	});

	const stopLive = () => {
		if (liveTimer) clearTimeout(liveTimer);
		liveTimer = undefined;
	};

	const scheduleLive = () => {
		if (liveTimer || liveBusy || phase === "unavailable") return;
		liveTimer = setTimeout(async () => {
			liveTimer = undefined;
			liveBusy = true;
			await lintInto(joined(stream), MIN_LIVE_WORDS);
			liveBusy = false;
		}, LIVE_INTERVAL_MS);
	};

	pi.on("session_start", (_event, ctx) => {
		state = loadState(ctx);
		ui = ctx.hasUI ? ctx.ui : undefined;
		phase = "idle";
		last = {};
		pendingFeedback = undefined;
		renderStatus();
	});

	pi.on("session_shutdown", () => {
		stopLive();
	});

	pi.on("before_agent_start", async (event) => {
		if (!state.enabled) return undefined;
		event.systemPromptOptions.sections[SECTION] = buildSection(state.mode);
		await runLintDone;
		const feedback = pendingFeedback;
		pendingFeedback = undefined;
		if (!feedback) return undefined;
		return { message: { customType: FEEDBACK_TYPE, content: feedback, display: false } };
	});

	pi.on("agent_start", () => {
		runTexts = { answer: [], thinking: [] };
		stream = { answer: "", thinking: "" };
		if (!state.enabled) return;
		if (phase !== "unavailable") phase = "live";
		last = {};
		renderStatus();
	});

	pi.on("message_update", (event) => {
		if (!state.enabled || event.message.role !== "assistant") return;
		stream = extractParts(event.message.content);
		scheduleLive();
	});

	pi.on("message_end", (event) => {
		if (!state.enabled || event.message.role !== "assistant") return;
		const parts = extractParts(event.message.content);
		stream = { answer: "", thinking: "" };
		for (const k of KINDS) if (parts[k].trim()) runTexts[k].push(parts[k].trim());
	});

	pi.on("agent_end", () => {
		stopLive();
		if (!state.enabled) return;
		const texts = joined();
		runTexts = { answer: [], thinking: [] };
		if (!texts.answer && !texts.thinking) {
			if (phase === "live") phase = "idle";
			renderStatus();
			return;
		}
		runLintDone = (async () => {
			last = {};
			const results = await lintInto(texts, 1);
			if (phase !== "unavailable") phase = "done";
			renderStatus();
			pendingFeedback = results ? formatFeedback(results) : undefined;
		})();
	});

	pi.registerCommand("ste", {
		description: "Simplified Technical English mode. Usage: /ste [strict|flavored|off]",
		getArgumentCompletions: (prefix) => {
			const opts = ["strict", "flavored", "off"].filter((o) => o.startsWith(prefix));
			return opts.length > 0 ? opts.map((v) => ({ value: v, label: v })) : null;
		},
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			if (arg === "off") {
				state = { ...state, enabled: false };
				pendingFeedback = undefined;
			} else if (arg === "" || isMode(arg)) {
				state = { enabled: true, mode: arg === "" ? DEFAULT_MODE : (arg as Mode) };
			} else {
				ctx.ui.notify(`Unknown STE option "${arg}". Use strict, flavored, or off.`, "warning");
				return;
			}
			pi.appendEntry(STATE_TYPE, { ...state });
			renderStatus();
			ctx.ui.notify(state.enabled ? `STE mode on: ${state.mode}.` : "STE mode off.", "info");
		},
	});

	pi.registerCommand("ste-lint", {
		description: "Lint a file, or the last assistant answer, with the STE linter",
		handler: async (args, ctx) => {
			const file = args.trim();
			let text: string | undefined;
			let source = "the last answer";
			if (file) {
				try {
					text = await readFile(file, "utf8");
					source = file;
				} catch {
					ctx.ui.notify(`Cannot read the file ${file}.`, "warning");
					return;
				}
			} else {
				const entries = ctx.sessionManager.getBranch();
				for (let i = entries.length - 1; i >= 0 && text === undefined; i--) {
					const e = entries[i];
					if (e.type === "message" && e.message.role === "assistant") text = extractText(e.message.content);
				}
			}
			if (!text?.trim()) {
				ctx.ui.notify("No text to lint.", "warning");
				return;
			}
			const result = await runLint(text);
			if (!result) {
				ctx.ui.notify(`The linter did not run. Make sure python3 and ${LINT_SCRIPT} exist.`, "warning");
				return;
			}
			ctx.ui.notify(formatReport(source, result), result.total === 0 ? "info" : "warning");
		},
	});
}
