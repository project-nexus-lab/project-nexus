# Project Nexus Roadmap

This document is planning, not architecture. It is not one of the
authoritative documents `CLAUDE.md` lists, carries no design authority,
and must never be read as a source of requirements, schemas, or domain
rules — that is what `docs/MVP_ARCHITECTURE_V2.md` and its supporting
model documents are for. Its authority is lower than
`docs/PROJECT_KNOWLEDGE.md`; it exists only to record, in one place, what
this project intends to do next and why, so that intent survives across
sessions instead of living only in conversation.

This document only records sequencing and intent. It is not evidence —
`docs/PROJECT_KNOWLEDGE.md` (Validated / Unproven / Invalidated / Open
Questions) is the evidence record, and this roadmap must never restate
findings that belong there. Re-evaluate this roadmap after every
iteration closes, against that iteration's actual `LESSONS.md` — not by
following it blindly.

---

## Current sequence

1. **Iteration 11** (closed) — Refined `RunBlocked` classifier: a
   Work-Package-declared `relatedElements` field, not agent text or
   graph proximity, correctly distinguishes a task-blocking refusal from
   one an agent legitimately worked around. See
   `docs/history/iteration-11/`.
2. **Iteration 12** (closed) — Incremental architecture authoring.
   Scoping found the write path already existed (`applyProposal`'s
   `create` operation, since Iteration 1); the real, narrower gap was
   that a minted element couldn't yet become *usable* — closed for
   `Component provides Capability` via a new `provide` operation. See
   `docs/history/iteration-12/`.
3. **Iteration 13** — Architecture/PO authoring API, building on
   Iteration 12's incremental write path.
4. **Iteration 14** — First architecture UI, building on Iteration 13's
   API. `apps/frontend` is still an empty placeholder as of Iteration 10.
5. **Iteration 15** — Technology Profiles, governed-configuration slice
   only: a `tech.*` catalog entry (language, runtime, build system,
   framework, testing profile, CI profile, containerization profile)
   attached to a Product, created/modified only via an ADR-gated
   proposal (reusing the already-validated Decision/governance
   mechanism), selected without an ADR. Ships with exactly one seeded
   profile (`tech.java24-spring`) to prove the catalog shape is
   extensible without redesign — not a multi-language template library.
   Explicitly excludes component-level overrides, portfolio reporting,
   and repository generation actually consuming the profile (all named
   future work). See `docs/PROJECT_KNOWLEDGE.md` Open Question #7.

## Why this order

Deliberately sequenced bottom-up: refine the one open agent-execution
question first (11), then build the authoring path write path → API →
UI (12 → 13 → 14), each iteration validating the layer below before
building on it — this project's own stated principle, applied
consistently since the reasoning that deferred incremental authoring in
Iteration 10 until graph scale was validated. Technology Profiles (15)
rides Iteration 13's authoring API rather than getting a bespoke write
mechanism of its own, and its heavier half — repository generation
actually consuming the profile — stays deferred behind Repository
Bootstrap's own still-Unproven push/branch/PR-at-scale question (see
`docs/PROJECT_KNOWLEDGE.md`, Unproven).

## Future, not yet scoped

- Repository generation consuming a Technology Profile to emit real
  language/build/CI/container scaffolding (Iteration 15's own deferred
  "Phase 4").
- Component-level Technology Profile overrides ("Phase 2") and
  portfolio-wide reporting over profiles ("Phase 3").
- `move` / `split` / `merge` architecture operations (`MVP_ARCHITECTURE_V2.md`
  §5.3, explicitly iteration-2-or-later since the document's own
  numbering, not this roadmap's).
- A second `AgentRuntimeAdapter` beyond the Claude SDK adapter.

## Maintenance

Update this file whenever the sequence changes — when an iteration
closes and the next step is confirmed or revised, or when a new
candidate iteration is scoped (`docs/history/iteration-N/SCOPE.md`).
Keep entries short; the reasoning behind a specific placement belongs in
that iteration's own `SCOPE.md`, not duplicated here.
