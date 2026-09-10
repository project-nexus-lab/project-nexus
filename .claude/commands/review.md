---
description: Apply Project Nexus's five reviewer lenses (docs/REVIEW_PRINCIPLES.md) to a change
argument-hint: [scope — default: uncommitted changes]
---

Apply the review process defined in `docs/REVIEW_PRINCIPLES.md` to: $ARGUMENTS

If no scope was given, default to the current uncommitted changes
(`git status` / `git diff`). If given a commit SHA, a range, an iteration
number, or a path, review that instead.

This is a distinct, Nexus-specific check — not the general-purpose
`code-review` skill. That skill looks for bugs, reuse, and simplification
in isolation. This command asks a narrower, project-specific question:
does this change respect Project Nexus's own Constitution, domain model,
simplicity bar, evidence discipline, and internal consistency, as those
are defined for *this* project. Run both when a change is significant;
they check different things and neither substitutes for the other.

**Read `docs/REVIEW_PRINCIPLES.md` now, in full, before doing anything
else.** It is the only source of truth for what each reviewer protects,
what questions it asks, and what output format it expects — do not rely
on memory of a previous run, and do not restate its content back as if
summarizing it were the review. If the document has changed since you
last read it (a new reviewer, a reworded question), the review must use
the current version.

Then, for the scope above:

1. Read every file the scope actually touches — do not review a diff
   without reading the full surrounding file for anything non-trivial;
   a change can look correct in isolation and still be wrong in context.
2. Apply each reviewer from `docs/REVIEW_PRINCIPLES.md`'s Review Framework
   in turn, in the order they're defined there. For each: ask its actual
   questions against the actual change, don't pattern-match against past
   reviews. Produce its own `Expected output format` exactly as that
   document specifies.
3. Apply the Architecture Critic perspective (also defined in that
   document) if the change touches architecture, schema, or bounded-context
   boundaries — one deep flaw, argued fully, over a list of minor notes.
4. For the Consistency Auditor specifically: verify claims rather than
   trust them — if a doc or comment states a test count, a behavior, or a
   file's contents, check it against the actual file or by actually running
   the command, the way you would verify anything else. Do not accept a
   claim as consistent just because it reads plausibly.
5. If verification requires running something (typecheck, tests, a
   script), run it — do not report a status you have not actually checked
   this pass.

Finish with the overall verdict per the Change Acceptance Rule: `PASS`, or
`PRE-COMMIT FINDINGS` (or the more specific per-reviewer term such as
`CONSISTENCY FINDINGS` if only one reviewer produced findings) with
concrete, actionable corrections — not vague concern. A finding is not
resolved by noting it; per the Change Acceptance Rule, explicitly state
what is known, what is believed, and what has not been tested.
