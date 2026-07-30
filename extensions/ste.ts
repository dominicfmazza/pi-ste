/**
 * ste — Simplified Technical English (ASD-STE100) output mode for pi.
 *
 * STE removes "AI slop" and keeps full, plain, active-voice prose, plus
 * compaction that cuts token waste. Adapted from woosal1337/blog ep01
 * "the cure for AI slop".
 *
 *   - Persistent toggle (stays on across turns until you turn it off)
 *   - Modes: strict | flavored (default strict)
 *   - System-prompt nudge while active. It states the internal workflow:
 *       propose the answer -> check against STE -> correct -> answer.
 *   - Footer status indicator
 *   - message_end hook runs ste-lint.py on each finalized assistant message
 *     and posts the slop score (violations per 100 words) to the transcript.
 *   - /ste-lint [file] runs the linter on a file, or on the last assistant
 *     message when no file is given.
 *
 * Commands:
 *   /ste                  -> enable, default mode "strict"
 *   /ste <mode>           -> enable at strict|flavored
 *   /ste off              -> disable
 *   /ste-lint [file]      -> lint a file, or the last assistant answer
 *
 * State lives in session entries (custom type "ste-state"), so it survives
 * /reload and resume.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type Mode = "strict" | "flavored";

interface SteState {
	enabled: boolean;
	mode: Mode;
}

const STATE_TYPE = "ste-state";
const DEFAULT_MODE: Mode = "strict";

// Resolve ste-lint.py. In a package, the skill sits beside this extension
// (../skills/ste/ste-lint.py). Fall back to the legacy ~/.pi path.
function resolveLintScript(): string {
	try {
		const here = dirname(fileURLToPath(import.meta.url));
		const pkgPath = join(here, "..", "skills", "ste", "ste-lint.py");
		if (existsSync(pkgPath)) return pkgPath;
	} catch {
		// import.meta.url may be unavailable in some load modes; fall through.
	}
	return join(homedir(), ".pi", "agent", "skills", "ste", "ste-lint.py");
}

const LINT_SCRIPT = resolveLintScript();

function isMode(s: string): s is Mode {
	return s === "strict" || s === "flavored";
}

function buildSystemPromptAppendix(state: SteState): string {
	if (!state.enabled) return "";
	return [
		"",
		"## STE mode active",
		"",
		`You are in Simplified Technical English (ASD-STE100) mode at level **${state.mode}**.`,
		"Follow the rules in `/skill:ste` for every response. Workflow every turn:",
		"",
		"1. Propose the answer internally, in normal prose.",
		"2. Check the draft against the STE rules. Find each violation: long",
		"   sentences (>20 words), semicolons, contractions, passive voice, `-ing`",
		"   main verbs, nominalizations, phrasal verbs, banned words, marketing",
		"   adjectives, hedges.",
		"3. Correct each violation with the plain form.",
		"4. Return only the corrected text.",
		"",
		"Compaction (every mode): keep plain prose, but cut token waste.",
		"- Drop filler (just, really, basically, actually, simply, that).",
		"- Drop hedges (I think, it seems, perhaps, might want to).",
		"- Drop pleasantries (sure, of course, happy to, great question).",
		"- Cut redundant lead-ins (it is important to note, as you can see).",
		"- Keep grammar and articles. Do not drop a, an, the. Do not clip to fragments.",
		"- Say a thing once. Do not restate the question back to the user.",
		"",
		"Rules in brief:",
		"- Use the short common word: use (not utilize/leverage), help (not",
		"  facilitate), make sure (not ensure), before (not prior to), start (not",
		"  begin/commence/initiate), get (not obtain), show (not demonstrate).",
		"- No marketing adjectives (seamless, robust, powerful, cutting-edge).",
		"- Active voice. Use a verb, not a nominalization (\"analyze the log\", not",
		"  \"perform an analysis of the log\").",
		"- No semicolons, no contractions. Keep articles (a, an, the).",
		state.mode === "strict"
			? "- strict: one instruction per sentence, max 20 words. Apply every rule."
			: "- flavored: sentence, paragraph, active-voice discipline. Relax the",
		state.mode === "strict"
			? ""
			: "  ~900-word dictionary so prose reads naturally.",
		"- Applies to prose only: docs, READMEs, PR text, error messages, comments.",
		"  Code, identifiers, and command syntax stay exact.",
		"- Stay in STE mode every turn until the user says \"normal mode\",",
		"  \"stop ste\", or runs `/ste off`.",
	]
		.filter((l) => l !== "")
		.join("\n");
}

function statusLine(state: SteState): string | undefined {
	return state.enabled ? `📝 ste: ${state.mode}` : undefined;
}

function loadStateFromEntries(ctx: ExtensionContext): SteState {
	const state: SteState = { enabled: true, mode: DEFAULT_MODE };
	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type !== "custom") continue;
		if ((entry as { customType?: string }).customType !== STATE_TYPE) continue;
		const data = (entry as { data?: Partial<SteState> }).data;
		if (!data) continue;
		if (typeof data.enabled === "boolean") state.enabled = data.enabled;
		if (typeof data.mode === "string" && isMode(data.mode)) state.mode = data.mode;
	}
	return state;
}

interface LintResult {
	words: number;
	total: number;
	total_per100w: number;
	"em_dash(slop-marker)": number;
	violations: Record<string, number>;
	sample_marketing: string[];
	sample_banned: string[];
}

async function runLint(text: string): Promise<LintResult | undefined> {
	if (!existsSync(LINT_SCRIPT)) return undefined;
	try {
		const stdout = await new Promise<string>((resolve, reject) => {
			const child = spawn("python3", [LINT_SCRIPT], {
				stdio: ["pipe", "pipe", "pipe"],
			});
			let out = "";
			let err = "";
			child.stdout.on("data", (d: Buffer) => {
				out += d.toString();
			});
			child.stderr.on("data", (d: Buffer) => {
				err += d.toString();
			});
			child.on("error", reject);
			child.on("close", (code: number | null) => {
				if (code === 0) resolve(out);
				else reject(new Error(`ste-lint exited ${code}: ${err}`));
			});
			child.stdin.on("error", () => {});
			child.stdin.write(text);
			child.stdin.end();
		});
		return JSON.parse(stdout) as LintResult;
	} catch {
		return undefined;
	}
}

function formatLintSummary(r: LintResult): string {
	const active = Object.entries(r.violations)
		.filter(([, n]) => n > 0)
		.map(([k, n]) => `${k}=${n}`);
	const lines = [
		`📝 STE lint: ${r.total_per100w} per 100w (${r.total} violations, ${r.words} words), em_dash=${r["em_dash(slop-marker)"]}`,
	];
	if (active.length > 0) lines.push(`  hits: ${active.join(", ")}`);
	if (r.sample_marketing.length > 0) lines.push(`  marketing: ${r.sample_marketing.join(", ")}`);
	if (r.sample_banned.length > 0) lines.push(`  banned: ${r.sample_banned.join(", ")}`);
	if (active.length === 0) lines.push("  clean.");
	return lines.join("\n");
}

function lastAssistantText(ctx: ExtensionContext): string | undefined {
	const entries = ctx.sessionManager.getEntries();
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type !== "message") continue;
		const msg = (entry as { message?: { role?: string; content?: unknown } }).message;
		if (!msg || msg.role !== "assistant") continue;
		return extractText(msg.content);
	}
	return undefined;
}

function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part) =>
				part && typeof part === "object" && "text" in part
					? String((part as { text?: unknown }).text ?? "")
					: "",
			)
			.join("\n");
	}
	return "";
}

export default function steExtension(pi: ExtensionAPI) {
	let state: SteState = { enabled: true, mode: DEFAULT_MODE };

	const persist = () => {
		pi.appendEntry(STATE_TYPE, { ...state });
	};

	const refreshStatus = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		const line = statusLine(state);
		ctx.ui.setStatus("ste", line);
	};

	pi.on("session_start", (_event, ctx) => {
		state = loadStateFromEntries(ctx);
		refreshStatus(ctx);
	});

	// Inject the STE workflow into the system prompt every turn while on.
	pi.on("before_agent_start", async (event, _ctx) => {
		if (!state.enabled) return;
		const appendix = buildSystemPromptAppendix(state);
		return { systemPrompt: `${event.systemPrompt}\n${appendix}` };
	});

	// After each assistant message, lint it and post the slop score. This is
	// the "hook in the script to analyze" step: it verifies the communication
	// went out in STE, and surfaces the score so the next turn can tighten.
	pi.on("message_end", async (event, _ctx) => {
		if (!state.enabled) return;
		const msg = (event as { message?: { role?: string; content?: unknown } }).message;
		if (!msg || msg.role !== "assistant") return;
		const text = extractText(msg.content).trim();
		if (!text) return;
		const result = await runLint(text);
		if (!result) return;
		pi.sendMessage(
			{
				customType: "ste-lint",
				content: formatLintSummary(result),
				display: true,
			},
			{ deliverAs: "nextTurn", triggerTurn: false },
		);
	});

	// /ste [mode] | off
	pi.registerCommand("ste", {
		description: "Toggle Simplified Technical English output mode. Usage: /ste [strict|flavored|off]",
		getArgumentCompletions: (prefix) => {
			const opts = ["strict", "flavored", "off"].filter((o) => o.startsWith(prefix));
			return opts.length > 0 ? opts.map((v) => ({ value: v, label: v })) : null;
		},
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			if (arg === "off") {
				state = { ...state, enabled: false };
				persist();
				refreshStatus(ctx);
				ctx.ui.notify("STE mode OFF.", "info");
				return;
			}
			let nextMode: Mode = state.mode;
			if (arg === "") {
				nextMode = DEFAULT_MODE;
			} else if (isMode(arg)) {
				nextMode = arg;
			} else {
				ctx.ui.notify(`Unknown STE option: "${arg}". Use strict | flavored | off.`, "warning");
				return;
			}
			state = { enabled: true, mode: nextMode };
			persist();
			refreshStatus(ctx);
			ctx.ui.notify(`STE mode ON — level: ${nextMode}.`, "info");
		},
	});

	// /ste-lint [file] — lint a file, or the last assistant answer.
	pi.registerCommand("ste-lint", {
		description: "Run the STE slop linter on a file, or on the last assistant answer",
		handler: async (args, ctx) => {
			const file = args.trim();
			let text: string | undefined;
			let source: string;
			if (file) {
				try {
					text = await import("node:fs/promises").then((fs) => fs.readFile(file, "utf8"));
					source = file;
				} catch {
					ctx.ui.notify(`Cannot read file: ${file}`, "warning");
					return;
				}
			} else {
				text = lastAssistantText(ctx);
				source = "last assistant answer";
			}
			if (!text || !text.trim()) {
				ctx.ui.notify("Nothing to lint.", "warning");
				return;
			}
			const result = await runLint(text);
			if (!result) {
				ctx.ui.notify(`Linter unavailable (${LINT_SCRIPT}). Is python3 installed?`, "warning");
				return;
			}
			pi.sendMessage(
				{
					customType: "ste-lint",
					content: `STE lint of ${source}:\n${formatLintSummary(result)}`,
					display: true,
				},
				{ deliverAs: "nextTurn", triggerTurn: false },
			);
			ctx.ui.notify("STE lint posted to transcript.", "info");
		},
	});
}
