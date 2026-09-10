---
description: Close out an iteration per the Iteration Discipline (docs/REVIEW_PRINCIPLES.md) — Report, Lessons, Project Knowledge update
argument-hint: <iteration-number>
---

Close iteration $ARGUMENTS per the Iteration Discipline defined in
`docs/REVIEW_PRINCIPLES.md`.

**Read `docs/REVIEW_PRINCIPLES.md` now, in full** — specifically Iteration
Discipline, Project Knowledge Maintenance, and the Knowledge Distillation
Rule. Those sections are the only source of truth for what each document
below must contain; do not restate them here, and do not rely on memory of
a previous close if the document has changed since.

If no iteration number was given, ask which iteration this closes rather
than guessing — do not infer it from `docs/history/` directory names
alone, since a partially-started iteration might already have a directory.

## Before writing anything

Implementation without captured learning is considered incomplete, but so
is captured learning about implementation that was never verified.
Confirm the iteration's changes are actually in a working, tested state
first:

- Run typecheck and the test suite; do not proceed on a claimed status you
  have not just checked yourself.
- If `/review` has not already been run this session against this
  iteration's changes, run it now. `iteration-close` does not re-implement
  the five reviewers — it depends on `/review` having already applied
  them, the same way this project's own domain model prefers composition
  over duplicated logic.
- If `/review` reports findings, resolve them (or get explicit sign-off to
  close anyway with named, accepted debt) before writing the Report —
  closing an iteration is exactly the wrong moment to discover the review
  never happened.

## Report — `docs/history/iteration-N/REPORT.md`

Describe what was implemented: scope completed, scope deferred,
architectural deviations, technical debt intentionally created,
demonstrations and verification, recommended next-step validation. Ground
every claim (test counts, what passes, what was deferred and why) in
something you just checked, not in what the plan said would happen —
`docs/history/iteration-1/REPORT.md`'s "Pre-commit review findings"
section is the concrete example of what happens when this isn't done:
stale counts that drifted from what `npm test` actually reported.

Existing iterations under `docs/history/` are precedent for shape and
tone, not a template to fill in mechanically — read one before writing,
but write this iteration's actual story, including where it genuinely
matches or diverges from the pattern.

## Lessons — `docs/history/iteration-N/LESSONS.md`

Capture evidence. Classify findings as `VALIDATED`, `UNPROVEN`, or
`INVALIDATED`. Focus on assumptions, discoveries, architectural learning,
implementation learning. Avoid roadmap content — this document argues from
evidence toward what is now known, not toward what should happen next.

## Project Knowledge update — `docs/PROJECT_KNOWLEDGE.md`

Update only after Lessons is written, and only from it. This document
must contain exactly `Validated`, `Unproven`, `Invalidated`, and `Open
Questions` — nothing else. It is cumulative and current, not a log:

- move an entry from Unproven to Validated or Invalidated only when this
  iteration's Lessons actually demonstrates it, not when it merely seems
  likely now;
- remove or update an Open Question this iteration resolved, rather than
  leaving a stale one alongside its resolution;
- distill — a row here should be shorter than the Lessons entry it comes
  from, pointing back to `docs/history/iteration-N/LESSONS.md` for full
  reasoning rather than reproducing it.

Iteration reports and lessons inform this document. They never replace
it, and it never grows into a second copy of them.

## Finish

Report back a short summary: what moved in `PROJECT_KNOWLEDGE.md`
(Validated / Invalidated / Open Questions changes), and whether anything
in the Report or Lessons should prompt a follow-up `/review` before the
iteration's changes are committed.
