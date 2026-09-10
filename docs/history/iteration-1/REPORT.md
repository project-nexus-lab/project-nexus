# Iteration 1 Report — the Architecture Change Proposal lifecycle

Status: complete for the scope agreed before starting (see "Scope
deferred" below — deferral was deliberate, not a shortfall), including two
fixes from a pre-commit review pass (see "Pre-commit review findings").
77 `node:test` cases pass (up from Iteration 0's 44; 71 before the
pre-commit fixes added 6 more); the primary target — closing the loop
§5.1 describes — is demonstrated end to end, in-process and over HTTP.

## Scope completed

Per the scope agreed at the start of this iteration: the Architecture
Change Proposal lifecycle (§5) as the primary target, plus the minimal
enabling work it needed to be reachable and testable as something other
than a script.

1. **Stable ID generation for `acp.<ulid>`** — `src/ids/ids.ts#generateUlid`.
   A self-contained Crockford-base32 generator over `node:crypto`, not a new
   dependency: nothing here needs true ULID's timestamp-ordering property,
   only its *shape*, which the schema's check constraint already enforces.

2. **The Proposal aggregate** — `src/proposal/proposal.ts`. The full
   `draft → proposed → approved → applied | rejected` state machine (§5.2);
   `applyProposal` mints, retires, and writes succession in one transaction
   (§3.2, §5.4); the §5.6 retirement policy (refuse retiring an element with
   a live inbound reference unless the same proposal supplies succession).
   `move`, `split`, `merge` are out of scope — not newly deferred, but the
   same deferral §5.3 already states; validating the model needs only
   `create` and `retire`.

3. **The rest of the WorkItem lifecycle** — `src/work/lifecycle.ts`.
   `blockTask`, `releaseBlockedTasks` (the `ProposalApplied → Work`
   handler, §2.2), `linkCapability`, `markReady`. `assertReadyInvariants`
   (§3.5) was extracted from Iteration 0's YAML-import guard so the same
   invariant is checked once, by both callers, rather than re-implemented
   for the lifecycle API.

4. **A cross-context read that Architecture is not allowed to make** —
   discovered while building item 2, not designed in advance. See
   "Architectural deviations" below;
   `db/migrations/0009_alignment_live_references.sql`,
   `src/graph/alignment.ts#liveReferences`.

5. **A minimal REST layer** — `src/http/` (router, error-to-status mapping,
   route table), `src/cli/serve.ts`, `npm run serve`. A dozen routes, every
   one a thin wrapper over an already-tested function. Not §16's full 1a
   surface — see "Scope deferred."

6. **Tests** — `test/proposal.test.ts` (10 cases: validation, the full
   state machine including the dedicated reject-from-approved case, both
   halves of the retirement policy plus the succession escape hatch,
   transactional rollback proven by actually triggering it, and the full
   end-to-end scenario), `test/lifecycle.test.ts` (11 cases, including the
   three added by the pre-commit review's Finding 1 fix),
   `test/http.test.ts` (10 cases, real HTTP requests against a real
   `http.Server`, not a mocked router, including the two added by the same
   fix), plus 2 new `generateUlid` cases. 77 total (see "Pre-commit review
   findings" for the 6 added after the number first reached 71 — 3 in
   `lifecycle.test.ts`, 2 in `http.test.ts`, 1 in `proposal.test.ts`).

## Scope deferred

Agreed before starting, not discovered as a shortfall partway through:

- **Runtime independence under a second adapter, MCP grant enforcement,
  repository bootstrap, multi-repository ambiguity in a real scenario** —
  each its own focused validation target for a future iteration (see
  `docs/PROJECT_KNOWLEDGE.md` → Open Questions), deliberately not bundled
  into this one so this iteration's Lessons stay about one thing.
- **§16's full 1a REST surface** — `resolve`, `governanceOf` as HTTP,
  pagination, and endpoints over data this iteration's scope never needed
  to touch (e.g. Decision/Constraint authoring). What exists is exactly
  enough to reach and test the proposal lifecycle from outside the process.
- **AcceptanceCriterion authoring** — no HTTP endpoint. `test/http.test.ts`
  seeds one directly via SQL where a test needs it, with a comment
  explaining why; this is disclosed test debt (see below), not silent gap.
- **`ProposalApplied → Repository: Repository declared for each minted
  Component flagged requiresRepository`** (§2.2, §5.4) — the
  `requires_repository` column exists on `change_operation` and is accepted
  by `draftProposal`, but nothing reads it yet. Declaring a repository with
  no bootstrap pipeline (§10, also out of scope) to ever provision it would
  be a dead-end stub; better to defer the whole thing together than build
  half of it now.
- **Auto-drafting a proposal from a `WorkPackageGateError`** — the
  end-to-end test drives `draftProposal` with a hand-authored intent and
  operations, standing in for what `RunBlocked`'s `proposalDraft` (§12.2)
  would eventually carry. Actually inferring *what* architecture change
  would fix a given gate failure is an orchestration/agent-runtime concern,
  explicitly out of scope (1f).

## Architectural deviations

One, substantive, caught before it shipped rather than after:

**Architecture read Work and Repository directly, which §2.3 does not
allow.** `applyProposal`'s retirement check (§5.6) needs to know whether a
non-terminal Task or an active Repository still references the element
being retired. The first implementation queried `work.work_item_capability`
/ `work.work_item` and `repo.repository_component` / `repo.repository`
directly from `src/proposal/proposal.ts`. Re-checking against §2.3's
declared dependency table while writing this report's Domain Integrity
review: Architecture has **no** declared read dependency on Work or
Repository anywhere in the model — only the reverse (`Work →
Architecture`, `Repository → Architecture`). This is not a matter of
degree; the table lists six declared directions and this was not one of
them.

Fixed by moving the two queries into a new Alignment function,
`alignment.live_references()`
(`db/migrations/0009_alignment_live_references.sql`), wrapped by
`src/graph/alignment.ts#liveReferences`, and having `applyProposal` call
that instead. Alignment is declared read-only across every context
specifically so a check like this one does not have to be embedded in the
context that would otherwise have to reach outside its own boundary to
make it (§2.1: "Alignment owns no state: named queries plus one verify
endpoint"). This also means `alignment.live_references()` is, in effect,
the concrete first implementation of what a general `danglingReferences()`
or `unmappedComponents()` query (§8.5, both still unbuilt) would need
anyway — deferred scope, but the pattern now exists.

All 71 tests, including the retirement-policy tests that exercise exactly
this code path, still pass after the fix — the correction changed *where*
the read happens, not what it computes.

## Pre-commit review findings

A pre-commit review pass (per `docs/REVIEW_PRINCIPLES.md`'s Change
Acceptance Rule) found two issues neither `npm test` nor the sections
above had surfaced. Both are recorded here because the review itself
found that "no architectural findings exist only in code or tests" had
been violated — recording them only in the fix commit would repeat that
exact mistake.

### Finding 1 (fixed): `blockTask` did not validate the proposal's state

`blockTask(taskId, proposalId)` accepted any `proposalId` that existed,
with no check on its `state`. Blocking a Task against a proposal that was
already `applied` (or `rejected`) left the Task permanently stuck in
`blocked`: `releaseBlockedTasks` only ever runs from inside
`applyProposal`, and `applyProposal` refuses to run a second time on a
proposal it already applied. The function's own doc comment additionally
overstated what protected against this, claiming the foreign key on
`blocked_by_proposal_id` enforced "a real, non-terminal proposal" — a
foreign key can only enforce that the referenced row *exists*, never a
condition on one of its columns, so the "non-terminal" half of that claim
was simply false.

**Fixed.** `blockTask` now fetches the proposal's state before blocking
and throws a new `ProposalNotBlockableError` (`src/work/lifecycle.ts`),
carrying a structured `reason: "not-found" | "terminal"` (mirroring
`WorkPackageGateError`'s existing shape), for either case. The doc comment
is corrected to state precisely what the FK does and does not cover.
Reading `architecture.change_proposal` from this Work-context function
remains architecturally legal — `Work → Architecture` is a declared
direction in §2.3, unlike the reverse read this iteration corrected
elsewhere (previous section).

**Tests added:** `test/lifecycle.test.ts` — refuses a nonexistent
proposal, an already-`applied` proposal, and an already-`rejected`
proposal, each asserting the Task's status is left untouched by the
refused call. `test/http.test.ts` — confirms the same two cases map to
404 and 409 respectively over real HTTP, since the error-to-status mapping
in `src/http/errors.ts` was also updated and had no coverage of its own
yet.

### Finding 2 (kept, now documented): `rejectProposal`'s allowed source states

§5.2 states the proposal state machine as one line: `draft → proposed →
approved → applied | rejected`. Read strictly as a linear chain ending in
a branch, this says rejection happens *from* `approved` — but the
implementation only ever allowed it from `draft` or `proposed`, refusing
it once `approved`. This is a genuine ambiguity in the source document,
not a bug; **the implementation's behaviour is unchanged** — only its
documentation.

The chosen reading: rejection is a pre-approval review outcome (declining
a proposal before it carries a recorded human approval), not an
alternative to applying one that has already been approved. Once
`approved`, a proposal has exactly one legal next state, `applied` — §5
describes no scenario for withdrawing an already-approved proposal, and
allowing it would mean a recorded `approved_by` could later be discarded
with no trace of why. This is the more conservative of the two readings
(fewer legal transitions out of a state carrying a human decision, not
more), which is why it was chosen where the document itself does not say.

Documented in three places, each pointing at the others: the doc comment
on `rejectProposal` (`src/proposal/proposal.ts`), this section, and the
dedicated test `test/proposal.test.ts` → *"rejectProposal is legal from
draft and proposed, but not from approved (§5.2, an ambiguous line — see
REPORT.md Finding 2)"*, which exercises all three transitions (draft →
rejected, proposed → rejected, approved → refused) explicitly rather than
as an aside inside a broader test.

## Technical debt intentionally created

- **The `RunBlocked` domain event is a direct function call, not a
  message.** §2.2 describes "an in-process domain event"; there is no
  event bus, no event type, no dispatcher — `blockTask` and
  `releaseBlockedTasks` are called directly by whatever code needs the
  effect (a test, or eventually an Orchestrator). This is the same
  simplification Iteration 0 already made for other in-process effects, and
  is disclosed here rather than left to look more decoupled than it is.
- **No authentication distinguishes "the platform" from "any HTTP
  caller."** R-1 states a draft proposal "is written by the platform in
  response to a reported `RunBlocked` event — the runtime never holds a
  write credential." The *data model* enforces R-1's substance (an agent
  can only ever produce a `draft`; only a human principal can approve;
  application is the only thing that mutates truth) — but nothing stops an
  arbitrary HTTP caller from POSTing `/proposals` with `authoredBy:
  "run:whatever"` today, because Authentication has been out of scope,
  consistently, since Iteration 0. Not a new gap this iteration introduced;
  worth naming precisely now that there is an HTTP surface for the first
  time, so it is not silently assumed solved.
- **`test/http.test.ts` seeds an AcceptanceCriterion via direct SQL**
  because no authoring endpoint exists — see "Scope deferred."

## Demonstrations and verification

```
npm test              # 77/77, includes the full end-to-end scenario below
npm run serve -- .nexus-data/db   # real server, smoke-tested manually against persisted storage
```

The end-to-end scenario (`test/proposal.test.ts`, also independently
exercised over real HTTP in `test/http.test.ts`), matching §5.4's flow
step for step:

1. A Task, `ready`, affects an *existing* capability with zero providers.
   `buildWorkPackage` refuses it: `WorkPackageGateError`, reason
   `unprovided-capability`. ("generation gate refuses: required capability
   does not exist" — here, exists but is unprovided; the schema-supported
   half of that clause.)
2. A proposal is drafted (`authoredBy: 'run:demo-agent'`) to mint a
   component providing the missing capability. ("draft
   ArchitectureChangeProposal created... in response to a reported
   RunBlocked event.")
3. The Task is blocked, naming the proposal.
4. The proposal is submitted and approved by a human principal.
5. `applyProposal` mints the component, transactionally, and — in the same
   transaction — releases the blocked Task back to `draft`. ("application,
   in one transaction... `ProposalApplied` → blocked Tasks released for
   re-gating.")
6. The new component is wired to provide the capability, and mapped to a
   repository (standing in for what a real proposal + repository bootstrap
   would eventually automate — see "Scope deferred").
7. The Task moves `draft → ready`. ("Task links the new capability, returns
   to ready" — the capability link already existed from step 1; only the
   status transition remained.)
8. `buildWorkPackage` is called again for the same Task: succeeds. ("Work
   Package generated.")

Every step above is a real function call against a real (embedded)
Postgres, asserted in a test — not narrated.

## Recommended next-step validation

Per `docs/REVIEW_PRINCIPLES.md`'s bias toward evidence over features, in
priority order (unchanged from the previous iteration's recommendation,
since none of them were addressed by this iteration on purpose):

1. **Runtime independence under an actual second adapter** — two no-op
   adapters against the §12.2 port; confirm the second needs zero changes
   to any core schema.
2. **MCP grant boundary enforcement** — one tool, one grant, one refused
   out-of-grant call. `applyProposal`'s use of `liveReferences` (§10.4 of
   `apps/backend/README.md`) is now a second real example of a
   cross-context, read-only Alignment query — worth reusing that pattern
   for the grant check rather than inventing a new one.
3. **Repository bootstrap (§10)** — now additionally motivated by this
   iteration's deferred `requiresRepository` handler, which has nowhere
   useful to write to until this exists.
4. **Multi-repository ambiguity in a real scenario.**
