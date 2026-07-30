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
- A slop linter, `ste-lint.py`. It runs after each answer and posts a score
  (violations per 100 words) to the transcript.
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

- The extension adds an STE workflow to the system prompt every turn while on.
  The model drafts an answer, checks it against the rules, corrects each
  violation, then returns the clean text.
- The `message_end` hook runs `ste-lint.py` on each finished answer and posts
  the score. A non-zero score means slop leaked. Tighten the next answer.
- State lives in session entries, so the mode survives `/reload` and resume.

## Modes

- **strict** — apply every rule and both length caps. One instruction per
  sentence. Max 20 words.
- **flavored** — apply the sentence, paragraph, active-voice, and phrasal-verb
  discipline. Relax the ~900-word dictionary so prose reads naturally.

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
