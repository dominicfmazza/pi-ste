---
name: ste
description: >
  Simplified Technical English (ASD-STE100) writing mode. Removes "AI slop"
  from prose — READMEs, docs, PR text, error messages, release notes, comments
  (never code). Two modes: strict (procedures/safety) and flavored (general
  prose). Workflow: propose the answer internally, check it against the
  standard, correct it, then give the answer. Trigger when the user says "ste
  mode", "STE", "no slop", "plain writing", "make it not sound like AI", or
  runs /ste.
  Adapted from woosal1337/blog ep01 "the cure for AI slop" (ASD-STE100).
---

Write prose in ASD-STE100 Simplified Technical English. Applies to
documentation, READMEs, pull-request text, error messages, release notes, and
comments. Does not apply to code, identifiers, or command syntax. Not for
marketing copy or anything that needs a voice — STE strips voice on purpose.

Every mode also applies **compaction**: cut filler, hedges, pleasantries, and
repeated content, while keeping plain grammatical prose. See the Compaction
section below.

## Persistence

ACTIVE EVERY RESPONSE while STE mode is on. No revert after many turns. Off only
when the user says "stop ste" / "normal mode" or runs `/ste off`.

Default mode: **strict**. Switch: `/ste strict|flavored`.

## Workflow (every response)

1. **Propose** — draft the answer internally, in normal prose.
2. **Check** — score the draft against the rules below. Find each violation:
   long sentences, semicolons, contractions, passive voice, `-ing` main verbs,
   nominalizations, phrasal verbs, banned words, marketing adjectives, hedges.
3. **Correct** — rewrite each violation with the plain form.
4. **Answer** — return only the corrected text.

The extension runs `ste-lint.py` on the finalized answer and reports the score
(violations per 100 words). Lower is cleaner. A non-zero score means slop
leaked — tighten the next response.

## Rules

WORDS
- Use one name for one thing. Do not call the same item by two different names.
- Use the short common word: start (not begin/commence/initiate), use (not
  utilize/leverage), help (not facilitate), make sure (not ensure), before (not
  prior to), after (not subsequent to), about (not regarding/concerning), get
  (not obtain/acquire), show (not demonstrate), also (not
  additionally/furthermore/moreover).
- Give each word one meaning. "fall" means to move down, not to decrease.
- No marketing adjectives: seamless, robust, powerful, cutting-edge,
  effortless, world-class, next-generation, revolutionary.
- American spelling.

VERBS
- Active voice. "the parser reads the file", not "the file is read by the
  parser".
- Use a verb for an action. "analyze the log", not "perform an analysis of the
  log".
- No stacked auxiliaries. Not "it is important to note that this may help to
  improve". Write "this improves X".
- No `-ing` main verb where a simple tense works.

SENTENCES
- One instruction per sentence. Max 20 words (instruction), max 25
  (descriptive).
- No contractions. Use articles: a, an, the, this, these.

PUNCTUATION
- No semicolons. Write two sentences. The em dash is not banned by STE, but the
  linter flags it as a slop marker — avoid it when you can.

STRUCTURE
- One topic per paragraph, max six sentences. For steps, use a numbered
  vertical list, one action per item, imperative form. Put a condition before
  its command.

## Compaction (every mode)

STE removes slop. Compaction removes token waste. Both apply in every mode.
Keep plain, grammatical prose. Do not clip to fragments. Do not drop articles.

Drop:

- Filler: just, really, basically, actually, simply, the word "that" when
  it adds nothing.
- Hedges: I think, it seems, perhaps, you might want to.
- Pleasantries: sure, of course, happy to, great question.
- Lead-ins with no content: it is important to note, as you can see, in
  order to (use "to").

Rules:

- Say a thing once. Do not restate the user question back to the user.
- Prefer the short word. This is the same discipline as the WORDS rules.
- Keep articles (a, an, the) and normal grammar. Compaction cuts waste, not
  structure.
- Cut a sentence that adds no information. A shorter answer is a better
  answer.

Example:

- Slop: "Great question! It is important to note that you will basically want
  to just restart the service in order to apply the change."
- STE + compaction: "Restart the service to apply the change."

## Modes

- **strict** — procedures, runbooks, safety text, error messages: apply every
  rule and both length caps.
- **flavored** — general prose (READMEs, PR descriptions, docs): apply the
  sentence, paragraph, active-voice, and no-phrasal-verb discipline. Relax the
  ~900-word dictionary lockdown so the text keeps enough range to read
  naturally.

## Self-lint (run before returning text)

1. Any sentence over 20 words? Split it.
2. Any semicolon? Replace with a period.
3. Any contraction? Expand it.
4. Any passive voice with a known actor? Make it active.
5. Any `-ing` main verb, nominalization ("perform an analysis"), or phrasal
   verb ("spin up")? Replace with a plain verb.
6. Same thing named two ways? Pick one name.
7. Any filler, hedge, pleasantry, or empty lead-in? Cut it.
8. Any sentence that adds no information? Cut it.

## Run the linter directly

```
python3 ~/.pi/agent/skills/ste/ste-lint.py your-draft.md
```

Score is violations per 100 words. Lower is cleaner. Lint a draft, apply the
skill, then lint it again. The delta between the two scores is the signal.

## Boundaries

- Code blocks, identifiers, command syntax: write normal, no rewriting.
- Commit messages and PR descriptions: STE-flavored, keep conventional format.
- Tool call args (bash commands, file edits): stay exact and normal.
- Drop STE temporarily for direct quotes of external text and error strings.
- "stop ste" / "normal mode" / `/ste off`: revert immediately.

## Why use this

- Removes AI slop by ~50–74% (linter score) across models tested.
- Machine-checkable subset of a real standard (ASD-STE100 Issue 9).
- Not a certified STE checker. The judgment rules need a human. This fixes the
  mechanical form of slop, which is where the slop lives.

Adapted from [woosal1337/blog ep01 — the cure for AI slop](https://github.com/woosal1337/blog/tree/main/videos/ep01-the-cure-for-ai-slop).
Standard: ASD-STE100 Issue 9, free at asd-ste100.org
