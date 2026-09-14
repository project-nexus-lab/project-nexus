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
6. **Iteration 15** (closed) — Technology Profiles, governed-configuration
   slice only. Revised by an architecture consolidation pass ahead of
   scoping: **not** a flat Product→profile attachment reusing the
   Decision/governance mechanism (a composite catalog id forced by that
   shape doesn't decompose into queryable facts, and the general
   nearest-ancestor-wins resolution it would borrow has nothing to
   resolve for a single attachment point) — instead, category-scoped
   assignments (`Product × Category → Technology Profile`), resolved by
   reusing the existing `ancestry()` traversal unmodified, with only the
   `backend` category actually populated (`tech.java24-gradle`: language,
   version, build system). The category table exists in full from day
   one so adding `frontend`/`infrastructure`/`data` later is additive,
   not a migration. The prerequisite governance decision was resolved,
   not inherited by default: creating or modifying a profile requires
   citing an existing, `accepted` `architecture.decision` row, checked
   at write time — neither extending `architecture.change_operation`
   (would have been a fourth operation type on a table already flagged
   for a mutual-exclusivity fix, `docs/history/iteration-12/LESSONS.md`)
   nor a dedicated proposal lifecycle (over-engineered for an assignment
   with no cascading side effects). Explicitly excludes component-level
   overrides, portfolio reporting, repository generation actually
   consuming the profile, and frontend/infrastructure/data functionality
   beyond the category table itself (all named future work). See
   `docs/history/iteration-15/`.
7. **Iteration 16** (closed) — a real, governed creation path for
   `architecture.decision`, closing `docs/PROJECT_KNOWLEDGE.md`'s Open
   Question #7: Iteration 15's Technology Profile governance requires
   citing an existing, `accepted` Decision, but nothing governs how a
   Decision row comes to exist — every one to date is a direct insert.
   Extends the existing `ArchitectureChangeProposal` mechanism with a
   fourth operation, `decide` (mirroring `create`'s own shape), rather
   than a second, parallel proposal-and-approval lifecycle built for
   Decisions alone — the same mechanism already validated for exactly
   this purpose (Iteration 12's `provide`), not a new one. This is also
   the exact trigger Iteration 12's own `/review` named for
   `architecture.change_operation`'s disclosed, presence-only check
   constraint (*"before a fourth operation type is added"*,
   `docs/history/iteration-12/LESSONS.md`) — resolved, not deferred
   again: the rewritten `change_operation_check` covers `create`/
   `retire`/`provide` retroactively as well as `decide`, verified
   against every pre-existing test unmodified. Explicitly excludes
   `decision_scope` population (which elements a Decision governs),
   superseding or amending an already-accepted Decision, and any HTTP
   write route. See `docs/history/iteration-16/`.
8. **Iteration 17** (closed) — does provisioning success predict
   push/branch/PR success against a real repository? This project's
   oldest Unproven item, on record since Iteration 5 and untouched
   through eleven iterations since — resolved for a single, first-ever
   bootstrap push: a real branch was pushed and a real PR opened
   against a real, disposable repository, independently verified via
   `gh pr view` to carry exactly the files `generateProjection`
   rendered. Added exactly one new port method,
   `openPullRequestWithChanges`, validated first against
   `NoopVcsProvider` before `GhCliVcsProvider` attempted it for real —
   the same no-op-first sequencing already used four times. Two real
   gaps surfaced by the live run itself, not anticipated correctly in
   advance: a freshly `gh repo create`d repository has no commit history
   to branch from, and a repeat push against an already-bootstrapped
   branch fails as a real push rejection, not a "PR already exists"
   error. No changes to `lifecycle.ts`, `repo.repository`'s schema, or
   `bootstrap_state`'s existing semantics — this iteration produced the
   evidence such a change would need, without making it. See
   `docs/history/iteration-17/`.
9. **Iteration 18** (closed) — `POST /alignment/verify` (§10.5),
   disclosed as cheap in Iteration 4 and never revisited until the
   Iteration 17 Artifact Review re-surfaced it. Composes entirely from
   already-existing functions (`resolve`, `capabilitiesOf`, plus one new
   posted-vs-live mapping comparison) — no new port, no schema change.
   Found, before any alignment logic was written, that the *existing*
   generic HTTP body parser (`src/http/server.ts`) could not parse what
   the *already-generated, already-real* CI workflow actually sends (a
   managed-region-wrapped file, not bare JSON) — fixed, and confirmed
   against the literal artifact: the real `.nexus/repository.json`
   content still live on Iteration 17's own real PR was fetched and
   POSTed to a local server, returning `ok: true`. A real correctness
   bug was also found and fixed during `/review`: a succession chain
   that dead-ends in a retired element was being reported as a mild
   "superseded" warning instead of the failure it actually is.
   Explicitly defers the two staleness-related warn conditions (§10.5):
   the workflow never posts the snapshot file at all, and the
   drift-warning would need raw-body plumbing this iteration doesn't
   yet justify. See `docs/history/iteration-18/`.

## Why this order

Deliberately sequenced bottom-up: refine the one open agent-execution
question first (11), then build the authoring path write path → API →
UI (12 → 13 → 14), each iteration validating the layer below before
building on it — this project's own stated principle, applied
consistently since the reasoning that deferred incremental authoring in
Iteration 10 until graph scale was validated. Technology Profiles (15)
rides Iteration 13's REST surface rather than inventing a new HTTP
layer of its own — this is about the transport, not the underlying
governance mechanism, which Iteration 15's own scoping resolved (see
item 6, above): citing an existing, `accepted` Decision, checked at
write time. Its heavier half — repository generation actually consuming
the profile — stayed deferred behind Repository Bootstrap's own
push/branch/PR question, resolved as of Iteration 17 (see item 8,
above; `docs/PROJECT_KNOWLEDGE.md`, Validated).

Iteration 16 follows immediately, not deferred as future work, because
Iteration 15's own resolution created a dependency it disclosed rather
than hid: Technology Profile governance now rests on Decisions being
`accepted`, but nothing governs how a Decision comes to be `accepted`
in the first place (`docs/PROJECT_KNOWLEDGE.md`, Open Question #7). It
also happens to be the exact scenario Iteration 12's own `/review`
predicted (*"before a fourth operation type is added"* to
`architecture.change_operation`) — closing Open Question #7 and paying
that disclosed debt turn out to be the same piece of work, not two.

Iteration 17 turns to the other still-Unproven question named just
above — push/branch/PR against a real repository — deliberately before
repository generation actually consuming a Technology Profile (Phase 4,
"Future, not yet scoped," below) is attempted. This is the same
bottom-up discipline applied one level down the stack: Phase 4 depends
on this working, so this gets validated in isolation first, the same
way graph scale was validated (Iteration 10) before incremental
authoring was built on top of it, rather than discovering push/branch/PR's
real failure modes for the first time inside a larger feature that also
depends on them.

Iteration 18 follows 17 on the strength of the Iteration 17 Artifact
Review, not because it depends on 17's own mechanism: reading the three
real files Iteration 17 pushed to a real repository surfaced two
concrete candidates (`docs/history/iteration-17/REPORT.md`'s own
follow-on questions), and 18 is the smaller, more contained of the two
— composition of already-existing functions, no new port or schema.
Repository generation actually consuming a Technology Profile (Phase 4,
"Future, not yet scoped," below) — the bigger of the two candidates —
stays queued behind it, not because 18 blocks it, but because closing a
disclosed, thirteen-iteration-old gap cheaply is worth doing before
adding a bigger feature on top of an alignment-check endpoint that
doesn't exist yet.

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
