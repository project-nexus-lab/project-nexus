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
3. **Iteration 13** (closed) — Architecture/PO authoring API. A plain,
   ungated HTTP read surface (list/get elements, get a capability's
   providers, list/get proposals) — added without changing the existing
   `create`/`retire`/`provide` write shape at all — let a simulated
   PO/Architect complete discover → draft → review → approve → apply →
   confirm end-to-end, starting from only a product's name. One endpoint
   not originally planned (`/architecture/:id/providers`) turned out
   indispensable; one that was planned (`GET /architecture/:id`) went
   unused. See `docs/history/iteration-13/`.
4. **Iteration 14a** (closed) — Can `relatedElements` be populated
   correctly, and by which mechanism? Resolved Open Question #5's core
   claim: a plain, human-declared table
   (`work.work_item_related_element`), read by `buildWorkPackage()` for
   the first time, reproduces Iteration 9/11's own known-correct values
   exactly and leaves their validated classification unchanged, confirmed
   by two live runs. Automatic derivation from graph structure was ruled
   out on direct evidence (neither reusable scenario carries a graph edge
   distinguishing required from optional — both are structurally
   identical to each other). One thread survives, carried forward from
   Iteration 11's own `/review`, unrelated to this iteration's own
   findings: whether an *incomplete* declared set can still cause silent
   misclassification — untested by design, since both reused scenarios
   are complete by construction. See `docs/history/iteration-14a/`.
5. **Iteration 14** (closed) — First architecture UI: one screen, React
   + Vite + TypeScript, talking to Iteration 13's discovery API through
   a dev-time proxy (no CORS change to the backend). A real, driven
   browser session reproduced Iteration 13's own acceptance bar
   visually — reached `cap.invoice-export` from nothing but the name
   "Trade Platform," saw "No provider" on screen, and the screen's own
   visible call log showed exactly 5 real `GET` calls. Both of Iteration
   13's open questions answered from that evidence: `GET /architecture/:id`
   was not needed (a second independent real workflow to find it
   unused, not removed on two data points); provider status needed no
   new endpoint — client-side, per-capability fetching was sufficient at
   this project's own seeded scale (untested at real scale). No proposal
   UI, no writes, no auth. See `docs/history/iteration-14/`.
6. **Iteration 15** — Technology Profiles, governed-configuration slice
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

Iteration 14a was inserted ahead of 14, not appended after it, on a
roadmap-reconciliation pass: Open Question #5 (`relatedElements`
population) had its stated precondition satisfied since Iteration 12
but was never revisited while attention moved to fresher findings — a
recency bias this project's own review discipline exists to catch, not
a deliberate deferral. It doesn't depend on Iteration 14's UI, it bears
on `RunBlocked` classification correctness (a higher architectural-risk
question than UI ergonomics), and folding it into 14 instead would blur
Execution-context work into an Architecture-UI iteration — so it gets
its own slot, sequenced first.

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

## Standing awareness — not scheduled

Deliberately kept last and outside the numbered sequence above: recorded
so it isn't forgotten, not because it's next. No design work, ADR, or
iteration is scoped against it until it's explicitly pulled forward.

**Security & Authorization Model**

- **Status**: Planned (parked).
- **Goal**: introduce identity and authorization without requiring
  architectural redesign.
- **Requirements**: every action attributable; every approval
  attributable; every proposal attributable; authorization enforced at
  system boundaries; core domain model remains identity-provider
  agnostic.
- **Why it's real, not speculative**: `docs/PROJECT_KNOWLEDGE.md`'s
  Unproven table already carries a directly related entry since
  Iteration 1 — R-1's write-authorization boundary ("the runtime never
  holds a write credential") holds in the data model, but nothing today
  distinguishes "the platform, acting on a genuine `RunBlocked` event"
  from "any HTTP caller," and `approveProposal`'s `human:<id>` /
  `authoredBy`'s `run:<id>` principal strings are unauthenticated —
  attributable in *shape* only, not in *enforcement*. `MVP_ARCHITECTURE_V2.md`
  §15 separately postpones RBAC/multi-tenancy for the same
  reason ("humans need it once teams multiply"). This item is the
  broader umbrella both already point at.
- **A fact worth recording, not acted on**: Iteration 13 added a plain
  read surface that lets anyone reach the HTTP port enumerate the
  *entire* architecture graph and list every proposal — including its
  `authoredBy`/`approvedBy` attribution strings — from zero prior
  knowledge (`docs/history/iteration-13/`). Every route before that
  iteration required already knowing an id; discovery-by-listing is a
  materially larger exposed surface than "as ungated as the existing
  `/ancestry` route" fully captures. Not a reason to act now — this item
  stays parked — but whoever eventually scopes this should know the
  surface it needs to cover already grew once since this item was first
  written.
- **Why parked rather than scoped**: no current iteration needs it yet —
  today's callers are this project's own test suite, CLI scripts, and
  (since Iteration 14) a real but single-user, locally-run frontend
  screen — not a real multi-user deployment. Constitutionally
  compatible on its face (an identity-provider-agnostic core mirrors
  the Runtime Integration ACL's existing agent-runtime-agnostic
  pattern, §4.4 `MVP_ARCHITECTURE_V2.md`), but that compatibility
  hasn't been checked against a real design — reserved for whenever
  this surfaces for real, not designed speculatively now.

## Maintenance

Update this file whenever the sequence changes — when an iteration
closes and the next step is confirmed or revised, or when a new
candidate iteration is scoped (`docs/history/iteration-N/SCOPE.md`).
Keep entries short; the reasoning behind a specific placement belongs in
that iteration's own `SCOPE.md`, not duplicated here.
