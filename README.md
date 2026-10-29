# pi-ste

Simplified Technical English (ASD-STE100) output mode for [pi](https://pi.dev).

pi-ste makes pi write plain, active-voice prose and cut token waste. It removes
"AI slop": long sentences, hedges, filler, marketing adjectives, passive voice,
and nominalizations. A linter scores each answer, so you can see the slop drop.

## What you get

- A persistent `/ste` toggle. It stays on across turns until you turn it off.
- Two modes: `strict` (procedures, runbooks, safety text) and `flavored`
  (READMEs, docs, pull-request text). Default is `strict`.
- Compaction in every mode. It cuts filler, hedges, pleasantries, and repeated
  content, but keeps grammar and articles.
- A slop linter, `ste-lint.py`. It scores each answer in violations per
  100 words.
- A live status in the footer. The score updates while the answer streams.
- Hidden feedback to the agent. The next prompt lists each violation and its
  fix. The transcript does not show it.
- A `/ste-lint [file]` command. It lints a file, or the last answer.

## Install

```bash
pi install git:github.com/dominicfmazza/pi-ste
```

To try it for one run without installing:

```bash
pi -e git:github.com/dominicfmazza/pi-ste
```

## Use

```
/ste                enable, default mode strict
/ste strict         enable strict mode
/ste flavored       enable flavored mode
/ste off            disable
/ste-lint           lint the last assistant answer
/ste-lint FILE      lint a file
```

The linter needs `python3` on your PATH.

## How it works

- While STE mode is on, the extension adds an `ste_mode` section to the
  system prompt. The model writes a draft, checks it against the rules,
  corrects each violation, and returns the clean text.
- While an answer streams, the extension lints the text about once a second.
  The footer status shows the result:

  | Status | Meaning |
  |---|---|
  | `ste strict …` | The answer has too few words to lint. |
  | `ste strict 3 (1.2/100w) live` | The answer streams. It has 3 violations so far. |
  | `ste strict ✓` | The last answer has no violations. |
  | `ste strict 3 (1.2/100w)` | The last answer has 3 violations. |
  | `ste strict lint unavailable` | The linter did not run. Install `python3`. |

- When the agent run ends, the extension lints all answer text of the run.
  Thinking text and tool calls are not part of it.
- If the run has violations, the next prompt carries a hidden `ste-feedback`
  message. It quotes each violation and gives the fix. The agent reads it.
  The transcript does not show it.
- The extension keeps the mode in session entries. The mode stays after
  `/reload` and after a resume.

## Modes

- **strict**: apply every rule and both length caps. One instruction per
  sentence. Max 20 words.
- **flavored**: apply the sentence, paragraph, active-voice, and phrasal-verb
  rules. Relax the ~900-word dictionary, so the prose reads naturally.

## Scope

STE applies to prose: docs, READMEs, pull-request text, error messages,
release notes, and comments. It does not apply to code, identifiers, or
command syntax. It is not for marketing copy or anything that needs a voice.

## Credits

- Adapted from [woosal1337/blog ep01 — the cure for AI slop](https://github.com/woosal1337/blog/tree/main/videos/ep01-the-cure-for-ai-slop).
- Standard: ASD-STE100 Issue 9, free at [asd-ste100.org](https://asd-ste100.org).

This is not a certified STE checker. It fixes the mechanical form of slop. The
judgment rules still need a human.

## License

MIT. See [LICENSE](LICENSE).
