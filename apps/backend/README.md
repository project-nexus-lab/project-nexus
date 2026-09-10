# Nexus Core

The smallest executable Nexus Core, grown iteration by iteration to
validate the domain model and architectural assumptions in
`docs/MVP_ARCHITECTURE_V2.md`. Not a platform — a walking skeleton, with
each iteration adding one more load-bearing guarantee and proving it
against real evidence rather than asserting it.

This is the backend application (`apps/backend`) inside the Project Nexus
monorepo — the one deployable backend, per the top-level `README.md`. Paths
below (`db/`, `seed/`, `src/`, `test/`) are relative to this directory.
`docs/` is at the repository root, one level up, and applies to the whole
monorepo, not just this app.

This document describes what exists **today**, cumulatively. For what each
iteration added and why, see `docs/history/iteration-N/REPORT.md`; for what
each iteration proved, disproved, or left open, see
`docs/history/iteration-N/LESSONS.md` and the distilled
`docs/PROJECT_KNOWLEDGE.md`.

## 1. Implementation plan (what was built, and why)

*(§1–§9 below describe Iteration 0: schema, import, traversals, Work
Package generation. Iteration 1 — the Architecture Change Proposal
lifecycle and a minimal REST layer — is §10. Iteration 2 — runtime
independence under a second adapter — is §11. Iteration 3 — MCP grant
enforcement — is §12. Iteration 4 — repository bootstrap — is §13.
Iteration 5 — a real GitHub-backed VcsProvider — is §14. Iteration 6 — a
real Claude SDK Adapter — is §15. Iteration 7 — does the MCP grant model
bound what an agent can learn — is §16. Iteration 8 — can a real agent's
RunBlocked signal be captured — is §17. The Execution telemetry section
between §16 and §17 is a focused enhancement done chronologically between
Iterations 6 and 7, not an iteration itself — see its own note on why it
appears where it does.)*

| # | Deliverable | Where |
|---|---|---|
| 1 | Repository structure | this layout, §2 below |
| 2 | Technology stack | §3 below |
| 3 | Database: schema, migrations | `db/migrations/*.sql` |
| 4 | YAML import: Architecture, Work, Repository | `src/import/*`, `seed/*.yaml` |
| 5 | Graph traversals | `db/migrations/0007_graph.sql`, `0008_alignment.sql`, `src/graph/*` |
| 6 | Work Package generation | `src/workpackage/*` |
| 7 | Verification | `test/*.test.ts`, `src/cli/verify.ts` |

Everything in §15 of `MVP_ARCHITECTURE_V2.md` ("Postponed Complexity") is
genuinely absent here: no REST API, no proposal *lifecycle* (the schema
exists; nothing applies a proposal), no MCP servers, no orchestrator, no
runtime adapter, no UI. Iteration 0's own acceptance bar (§16) is: *"One
product tree loads and validates; a capability resolves its providers."*
This goes a little further, because the task also asked for the graph
traversals and Work Package generation that v2's own table places in 1a/1d —
done here against the same schema, so iterations 1a–1d become mostly
plumbing (REST, MCP) around code that already exists and is already tested.

## 2. Repository structure

```
db/migrations/     Plain, numbered SQL files. No ORM, no migration framework —
                    a migration is a .sql file; a tiny runner tracks which
                    ones ran (public.schema_migrations). Favors simplicity.
seed/               Example YAML: architecture.yaml, work.yaml, repository.yaml,
                    execution.yaml. The minimum dataset requested:
                    Task → Capability → Component → Repository.
src/
  db/               PGlite connection + migration runner + the SqlExecutor
                    interface (satisfied by both a plain connection and an
                    open transaction, so every read/write function works
                    identically standalone or inside db.transaction()).
  ids/              Stable ID validation (§6 of MVP_ARCHITECTURE_V2).
  import/           YAML → validated rows → Postgres, one file per bounded
                    context, in the dependency order the model requires.
  graph/            TypeScript wrappers over the named traversals (§8.4) and
                    the Alignment queries in scope (§8.5), including
                    liveReferences — Iteration 1, see §10.4.
  workpackage/       buildWorkPackage(taskId, profileId) (§11) — canonical
                    serialisation, content hashing, insert-only persistence.
  execution/         Execution-owned run telemetry (raw evidence, not
                    analytics) — a focused enhancement after Iteration 6,
                    not an iteration; see "Execution telemetry" below.
  proposal/          Iteration 1: the Architecture Change Proposal lifecycle
                    (§5) — draft, submit, approve, reject, apply.
  work/              Iteration 1: WorkItem lifecycle (§3.5, §5.4) — link a
                    capability, mark ready, block/release on a proposal.
  http/              Iteration 1: a minimal REST layer over the above —
                    a hand-rolled router, no framework dependency.
  runtime/           Iteration 2: the AgentRuntimeAdapter port (§12.2) and
                    two deliberately trivial adapters — see §11 below.
                    Iteration 6: claude-sdk.ts, a real adapter over
                    @anthropic-ai/claude-agent-sdk — see §15 below.
                    Iteration 8: a standing BLOCKED: convention and a
                    real RunBlocked translation path — see §17 below.
  mcp/               Iteration 3: MCP grant construction and enforcement
                    (§9.5) over two grant-checked tool wrappers — see §12
                    below. Iteration 7: getAncestry's result is now
                    filtered against the grant — see §16 below.
  repository/        Iteration 4: the repository bootstrap state machine
                    (§10.1), a VcsProvider port + no-op implementation,
                    and the managed-region generation/drift mechanism
                    (§10.4) — see §13 below. Iteration 5:
                    gh-cli-vcs-provider.ts, a real GitHub-backed
                    VcsProvider — see §14 below.
  cli/              Eight scripts: migrate, import, verify, serve,
                    verify-github (Iteration 5), verify-claude-adapter
                    (Iteration 6), investigate-ancestry-disclosure
                    (Iteration 7), investigate-run-blocked (Iteration 8)
                    — none of the verify-*/investigate-* scripts are
                    part of npm test.
test/               node:test suite — the executable proof for §7/§10/§11/§12/§13/§14/§15/§16/§17 below,
                    plus execution-telemetry.test.ts (see "Execution telemetry" below).
```

`docs/` (authoritative documents) lives at the monorepo root
(`../../docs` from here), not inside this app — it governs
`apps/frontend` and `packages/*` too, not just the backend.

No `src/orchestrator` and no standalone, externally-reachable MCP protocol
server exist yet — both remain deferred. A real `VcsProvider` (GitHub,
§14) and a real Claude SDK Adapter (§15) both now exist, each validated
against a no-op/trivial stand-in first, per the same sequencing this
project has used since Iteration 2. `VcsProvider` covers provisioning
only — pushing content, branches, and PRs remains deferred. The Claude SDK
Adapter's real MCP exchange is in-process (hosted by the SDK's own
transport), not the standalone reachable server §9.2–9.4 describe.
`src/http` is a
thin enabling layer (§10.5, §12.5), not the full §16 1a REST surface;
`src/mcp` is grant enforcement only, not the three-server MCP surface
§9.2–9.4 describe; `src/repository` is the bootstrap state machine and
generation pipeline only, not real VCS provisioning or the full
`POST /alignment/verify` rule set.

## 3. Technology stack

| Choice | Why |
|---|---|
| **TypeScript on Node.js** | One language for schema tooling, import, traversal, and tests; strong typing matches the domain model's own insistence on explicit invariants. |
| **Postgres via PGlite** (`@electric-sql/pglite`) | The Constitution requires Postgres as the system of truth (§7 of the architecture: "one Postgres schema per bounded context"). PGlite *is* Postgres — compiled to WASM, embedded, file-persisted — so every constraint, trigger, and recursive CTE in the schema is real Postgres behaviour, not an approximation. It needs no server process, no Docker daemon, no network port: zero operational infrastructure for iteration 0, which is exactly the MVP's decision rule (§"Decision Rule": cleaner MVP over future flexibility unless v2 requires otherwise). Swapping to a networked Postgres later is a one-line driver change (`pg` instead of `PGlite`, same SQL) — not a redesign. |
| **Plain numbered SQL migrations, no framework** | The schema in §7 of the architecture doc *is* the migration content; a framework (Prisma, Flyway, …) would add a second schema representation to keep in sync with the doc. A directory of `.sql` files plus one 20-line runner has no such duplication. |
| **`yaml` + `zod`** | YAML is the specified import format (deliverable #4). Zod gives the import boundary precise, typed validation with readable errors — proportionate for parsing external data, not speculative infrastructure. |
| **`node:test`, no test framework** | Node 22+ ships a real test runner. Adding Jest/Vitest here would be infrastructure for a need Node already meets. |

Nothing here is a graph database, event bus, CQRS, or microservice split —
all explicitly excluded by the task and by §15's "Deliberately never" list.

## 4. Database (§3 of the task)

`db/migrations/0001`–`0006` implement the relational schema exactly as
specified in `MVP_ARCHITECTURE_V2.md` §7, one file per bounded-context
schema (`architecture`, `work`, `repo`, `execution`, `runtime`), including:

- the composite `(id, kind)` unique key pattern that lets a foreign key
  enforce *kind*, not just existence (§7.2);
- `element_provision` / `element_dependency` replacing v1's containment
  conflation (R2, §4.2);
- `change_proposal` / `change_operation` / `element_succession` — present
  as schema (proposal *application* is out of iteration-0 scope, §5.3);
- the cross-context foreign key table from §7.1, applied literally;
- `execution.work_package` as insert-only (`revoke update, delete … from
  public`), with `unique(task_id, profile_id, content_hash)` carrying the
  idempotency guarantee.

Legal containment (`architecture.element`, `work.work_item`) is enforced by
a trigger reading a small data table (`legal_containment`), matching the
architecture doc's own claim that "the containment *rules* are a table"
(§16 closing note).

`0007_graph.sql` and `0008_alignment.sql` add two schemas of their own,
`graph` and `alignment` — not aggregate-owning contexts, just the "set of
named recursive-CTE views over Postgres" the architecture doc calls for
(§8.1), given real names as SQL functions so they're directly callable
(`select * from graph.ancestry('comp.invoice-service')`) and directly
testable.

**Migration strategy**: `src/db/migrate.ts` reads `db/migrations/*.sql` in
filename order and applies any not already recorded in
`public.schema_migrations`. Re-running `migrate` is always safe. There is
no down-migration — nothing is ever deleted in this model (R-4), and
neither are migrations.

## 5. Domain import (§4 of the task)

`src/import/schema.ts` defines the YAML shape with zod, one schema per
bounded context, deliberately close to the relational tables. `importAll`
runs Architecture → Repository → Execution profiles → Work, in that order,
inside one transaction, because later imports reference IDs minted by
earlier ones (a Task's `affects` needs the Capability to already exist; an
`implementedIn` override needs the Repository to already exist).

`seed/*.yaml` is the minimum dataset requested — Task → Capability →
Component → Repository — built around the exact worked example in
`WORK_PACKAGE_SPEC.md` (`task.invoice-discount-validation` /
`feat.invoice-discounts` / `cap.invoice-discount` / `comp.invoice-service` /
`repo.billing-service`), plus a few deliberate edge cases: an unprovided
capability (`cap.invoice-export`), an unmapped component
(`comp.payment-service`), and a draft task with no capability link
(`task.draft-example`) — so the alignment queries have something to report.

The WorkItem aggregate invariant (§3.5 — a Task may not leave `draft` with
zero `affects` links or zero AcceptanceCriteria) is enforced at import time,
the same boundary a future Work API would enforce it at
(`src/import/work.ts`, `OrphanTaskError` / `MissingAcceptanceCriteriaError`),
backed declaratively by the DB (§7.4) and continuously by `orphanTasks()`.

## 6. Graph traversals (§5 of the task)

All eight named traversals from §8.4 are implemented as SQL functions, with
thin, typed TypeScript wrappers in `src/graph/traversals.ts`:
`ancestry`, `providersOf`, `capabilitiesOf`, `implementationPath`,
`impactOf`, `governanceOf` (plus a `governanceOfElements` helper composing
the Work-Package union-with-nearest-ancestor-wins rule from §11.2 step 6),
and `resolve`. The two Alignment queries explicitly in scope,
`orphanTasks()` and `unprovidedCapabilities()`, are in
`src/graph/alignment.ts`.

`implementationPath` LEFT JOINs at every step deliberately: an affected
capability with no provider, or a provided component with no mapped
repository, must still appear as a row (with nulls) rather than silently
vanish — that's what lets the Work Package gate actually see and reject
those states, instead of the row just disappearing from the join.

## 7. Work Package generation (§6 of the task)

`src/workpackage/build.ts` implements `buildWorkPackage(taskId, profileId)`
following the §11.2 pipeline step by step: gate → resolve succession →
traverse → (bound, computed but not persisted — see §11.3) → anchor → govern
→ frame → canonicalise+hash → persist.

**Determinism**: `src/workpackage/canonicalize.ts` recursively sorts object
keys and — since every array in the payload is a graph-derived ID set where
only membership matters, never order — sorts array elements too, before
computing a sha256 content hash. The hash is computed over the payload
*without* its own `id` (the `id` is only known after a successful insert);
same graph + same task + same profile therefore always yields the same
hash, before any row exists.

**Idempotency**: persistence is `select existing by (task_id, profile_id,
content_hash) → return it; else mint the next wp.<seq>, insert, return it`,
inside one transaction. Calling `buildWorkPackage` twice for an unchanged
graph returns the same `wp.<seq>` both times and inserts exactly one row —
demonstrated in `test/workpackage.test.ts` and `src/cli/verify.ts`.

**Gate failures** are typed (`WorkPackageGateError`, with a `reason` —
`task-not-ready`, `unprovided-capability`, `mapping-missing`,
`ambiguous-repository`, `retired-without-succession`, …). §11.2 notes that a
gate failure caused by *missing architecture* should, in the full design,
trigger drafting an `ArchitectureChangeProposal` (§5.4) instead of a bare
error — that handler is explicitly out of iteration-0 scope; the `reason`
field is what it would switch on when built.

## 8. Verification (§7 of the task)

Two layers, both runnable with no setup (no server, no Docker). From the
**repository root** (installs and runs every workspace member):

```
npm install
npm test              # delegates to this workspace — 138 node:test cases, the authoritative check
npm run verify         # delegates to this workspace — narrated walkthrough, same assertions, human-readable
```

Or from inside this directory (`apps/backend`), for backend-only iteration:

```
npm test
npx tsx src/cli/verify.ts
```

`npm test` proves, against a real (embedded) Postgres, each item the task
asked for:

- **valid IDs accepted / invalid IDs rejected** — `test/ids.test.ts` (pure
  validator) and `test/schema-constraints.test.ts` (the DB check constraint
  as a second, independent guard).
- **legal containment enforced** — `test/schema-constraints.test.ts`: an
  illegal parent/child pair is rejected by the trigger, for both the
  Architecture and Work taxonomies.
- **task-to-capability path resolution works** — `test/traversals.test.ts`:
  `implementationPath` resolves the full Task→Capability→Component→
  Repository chain from the seed data, and is empty (not erroring) for a
  task with no `affects` link.
- **work package generation works** — `test/workpackage.test.ts`: the
  generated payload matches `WORK_PACKAGE_SPEC.md`'s own worked example
  field-for-field, two calls are idempotent (`created: false` the second
  time, identical hash, exactly one row in `execution.work_package`), and
  every gate failure path (unprovided capability, missing mapping,
  ambiguous repository without a primary, a retired element with no
  successor) is exercised and asserted by `reason`.

To run against persisted storage instead of an in-memory database (what
`npm test` uses) — from the repository root:

```
npm run migrate -- .nexus-data/db
npm run import  -- seed .nexus-data/db
```

or from inside this directory:

```
npx tsx src/cli/migrate.ts .nexus-data/db
npx tsx src/cli/import.ts  seed .nexus-data/db
```

## 9. Remaining iteration-0-adjacent tasks

Everything the task listed as Iteration 0 scope is implemented and passing.
What's deliberately still open, per `MVP_ARCHITECTURE_V2.md` §16, is
iteration 1 work, not iteration 0 debt:

- **1a** — REST endpoints over Architecture/Work/Repository; a `resolve`
  endpoint. The traversal *functions* this would call already exist and are
  tested.
- **1b** — the proposal *lifecycle*: drafting on `RunBlocked`, human
  approval, transactional application (mint/retire/succession),
  `ProposalApplied` handlers. The schema for this is already in place
  (`architecture.change_proposal`, `change_operation`,
  `element_succession`) and untouched by anything above it.
- **1c–1f** — repository bootstrap, MCP servers, the Orchestrator, and the
  Claude SDK Adapter. None of this iteration's code assumes their absence
  in a way that would need rework — Execution is already a downstream
  context that reads Architecture/Work/Repository only by ID (§2.3).

Two smaller, genuinely open items worth flagging rather than silently
deferring:
- `graph.governance_of`'s "nearest-ancestor-wins" rule is applied in
  `governanceOfElements` (TypeScript), not in SQL — reasonable for one
  profile with `context_depth = 0`, but worth revisiting if a wider profile
  makes the unioned ancestor sets large enough that doing the dedup in SQL
  matters for performance.
- §13 (file-level context) is still genuinely undecided in the source
  document; this implementation ships Alternative A (curated
  `file_anchor` rows) because that's what v2 says the MVP proceeds with,
  not because the question is settled.

## 10. Iteration 1: the Architecture Change Proposal lifecycle

Full detail in `docs/history/iteration-1/REPORT.md` and `LESSONS.md`. This
section is the current, cumulative summary.

### 10.1 What this validates

`docs/PROJECT_KNOWLEDGE.md`'s highest-ranked Open Question at the time
(Iteration 1): does §5's proposal lifecycle actually close the loop it
exists to close — a Task blocked on missing architecture reaching `ready`
again without a manual database edit? `test/proposal.test.ts`'s
end-to-end test proves it does, against the exact scenario §5.1 describes
(a gate failure from `buildWorkPackage`, not a synthetic one). Long since
resolved and moved to Validated in `docs/PROJECT_KNOWLEDGE.md` — this
section describes what Iteration 1 set out to prove, not a current
ranking.

### 10.2 `src/proposal/proposal.ts`

`draftProposal`, `submitProposal`, `approveProposal`, `rejectProposal`,
`applyProposal` — the full `draft → proposed → approved → applied |
rejected` state machine (§5.2). `applyProposal` mints, retires, and writes
succession in one transaction (§3.2, §5.4); PGlite's rollback-on-throw
behaviour is verified directly (not assumed) before being relied on — see
`docs/history/iteration-1/LESSONS.md`.

`move`, `split`, and `merge` are out of scope, exactly as §5.3 already
scopes them to iteration 2 — validating the proposal *model* needs only
`create` and `retire`, which is all the schema has ever allowed.

### 10.3 `src/work/lifecycle.ts`

The rest of the WorkItem lifecycle §5.4 needs: `blockTask` (Task →
`blocked`, naming the proposal — standing in for what an Orchestrator would
trigger automatically on `RunBlocked`, §12.2, deferred to 1f),
`releaseBlockedTasks` (the `ProposalApplied → Work` handler, §2.2),
`linkCapability` and `markReady` ("Task links the new capability, returns
to ready"). `assertReadyInvariants` (§3.5) is extracted here and now shared
by both this lifecycle API and the Iteration 0 YAML import guard — one
invariant, one place, two callers.

### 10.4 A boundary violation this iteration created, then caught and fixed

`applyProposal`'s retirement check (§5.6) needs to know about non-terminal
Tasks and active Repositories. The first implementation queried
`work.work_item_capability` and `repo.repository_component` directly from
`src/proposal/proposal.ts` — Architecture-context code reading Work and
Repository tables. §2.3's declared dependency table gives Architecture no
read dependency on either (only the reverse: Work → Architecture,
Repository → Architecture). Moved to `alignment.live_references()`
(`db/migrations/0009_alignment_live_references.sql`,
`src/graph/alignment.ts#liveReferences`) — Alignment is the one context
declared read-only across all others (§2.1) for exactly this kind of
cross-context check. `applyProposal` now asks Alignment, not Work or
Repository directly. See `docs/history/iteration-1/LESSONS.md` for why this
counts as a real Domain Integrity finding rather than a style preference.

### 10.5 `src/http` — an enabling layer, not §16's full 1a

A hand-rolled router (`src/http/router.ts`, no framework dependency) wires
a dozen thin routes over the functions above: Work Package generation,
the proposal lifecycle, and Task block/link/ready. `npm run serve` starts
it. Every error class already defined in `src/proposal` and `src/work` is
mapped to an HTTP status once, centrally
(`src/http/errors.ts#statusForError`) — route handlers never choose a
status code themselves.

```
npm run serve -- .nexus-data/db   # from the repository root; PORT env var, default 3000
```

Deliberately not built: authentication (excluded platform-wide since
Iteration 0, not newly deferred here — see the Constitution Reviewer note
in `docs/history/iteration-1/REPORT.md` about what this means for R-1
today), an AcceptanceCriterion-authoring endpoint, and the rest of §16 1a's
surface (`resolve`, `governanceOf` as HTTP, pagination). Each is additive
over what exists, not a redesign of it.

## 11. Iteration 2: runtime independence under a second adapter

Full detail in `docs/history/iteration-2/REPORT.md` and `LESSONS.md`.

### 11.1 What this validates

`docs/PROJECT_KNOWLEDGE.md`'s #1-ranked Open Question at the time:
does adding a *second* `AgentRuntimeAdapter` against the §12.2 port cost
only "one row, one class" (§12.7), or does the port itself have to grow?
Answered with three independent checks, not an inference from a passing
test suite — see `test/runtime.test.ts`'s last case and
`docs/history/iteration-2/REPORT.md` § "The actual answer to the Open
Question."

### 11.2 `src/runtime/`

`port.ts` — the `AgentRuntimeAdapter` interface (§12.2) and the full
six-event `RunEvent` vocabulary, unchanged since v2 added `RunBlocked`.
`adapters/noop-a.ts` and `adapters/noop-b.ts` — two deliberately trivial
adapters; B's file is the actual experiment (its imports are statically
checked to be the port and nothing else). `registry.ts` — `registerAdapter`
and `listAdaptersForRole`, writing for the first time to
`runtime.adapter_registration` and `adapter_role_support`, tables that
have existed empty since Iteration 0.
`db/migrations/0010_runtime_role_vocabulary.sql` seeds the full §4.4 role
vocabulary (six roles) as data — the first write to `runtime.agent_role`
too.

Both adapters are permanently trivial by design and are not a starting
point for the eventual Claude SDK Adapter (§12.7) — see "Technical debt
intentionally created" in the Iteration 2 report.

### 11.3 What this does not answer

The validated claim is scoped to adapters with no real behavioral
complexity. Whether the same near-zero marginal cost holds for a *real*
adapter — one that has to express streaming, tool-call translation, or
vendor-specific configuration through the port — remains an open question
in `docs/PROJECT_KNOWLEDGE.md` (check that document directly for its
current ranking, not this sentence), not resolved here on purpose.

## 12. Iteration 3: MCP grant enforcement

Full detail in `docs/history/iteration-3/REPORT.md` and `LESSONS.md`.

### 12.1 What this validates

Whether the MCP grant model (§9.5) is a real enforcement boundary or only
a documented formula. Answered with three independent forms of evidence —
an in-process test, an HTTP-driven test, and a hand-run `curl`
transcript — not an inference from a passing suite. See
`docs/history/iteration-3/REPORT.md` § "The actual answer to the Open
Question."

### 12.2 `src/mcp/`

`grant.ts` — `buildGrant(db, workPackage, runId)` implements §9.5's
formula exactly (`allowedElementIds` = the Work Package's own capabilities
and components, unioned with `impactOf(components, context_depth + 1)` —
one level wider than the Work Package's own bound), and `assertInGrant`
enforces it, including expiry. `McpGrant` itself was moved here from
`src/runtime/port.ts`, its Iteration 2 placeholder home, now that
something actually constructs and enforces one — checked directly against
§2.3's declared dependency table, not assumed safe (`Runtime Integration →
Execution` is the legal direction; `src/mcp/` has zero imports from
`src/runtime/`).

`tools.ts` — two grant-checked wrappers, `getAncestry` and
`getCapabilitiesOf`, over the already-tested functions in
`src/graph/traversals.ts`. Not the other five Architecture MCP tools
(§9.2), not Work MCP (§9.3), not Repository MCP (§9.4).

### 12.3 A disclosed interpretive choice, not an oversight

The grant check applies to a tool call's *target* only. `getAncestry` on
an in-grant element still returns the full ancestry chain, including
ancestors that are not themselves individually in the grant — §9.5 does
not say whether a grant should also filter a tool's *result*, and this
project reads it as authorizing the call, not the result. `test/mcp.test.ts`
asserts this explicitly. The corresponding gap this leaves — an agent can
still *learn* an out-of-grant id exists via an in-grant call's result,
even though it cannot query that id directly — is recorded as its own
open question in `docs/PROJECT_KNOWLEDGE.md`, not glossed over.

### 12.4 `POST /grants`, `POST /mcp/architecture/*`

Enabling layer, same status as §10.5 and §11: makes the refusal
demonstrable by hand (`npm run serve`, then `curl`), not the full §16 1e
MCP surface — no real MCP protocol, no Work MCP, no Repository MCP, no
Orchestrator to dispatch a real `ExecutionRun` and issue a grant
automatically. `runId` is supplied by the caller, the same stand-in
pattern Iteration 1 used before any Orchestrator existed.

## 13. Iteration 4: repository bootstrap

Full detail in `docs/history/iteration-4/REPORT.md` and `LESSONS.md`.

### 13.1 What this validates

§16's own literal acceptance bar for this slice of work: *"One repo
bootstrapped, CI green, a hand-edit outside the markers does not trip the
check."* `test/repository.test.ts` reproduces exactly that — edit outside
the managed-region markers, no drift; edit inside, drift detected;
markers deleted entirely, drift rather than a crash.

### 13.2 `src/repository/`

`lifecycle.ts` — the bootstrap state machine (§10.1):
`declareRepository → provisionRepository → registerMapping →
generateProjection → activateRepository`, each refusing an out-of-order
call. The third independent implementation of the same typed-state-machine
pattern already used for `ArchitectureChangeProposal` (Iteration 1) and
`WorkItem` (also Iteration 1) — reused, not reinvented, down to the error
class shapes.

`vcs-provider.ts` — the `VcsProvider` port (§10.2: *"VcsProvider is a
port; GitHub is one adapter"*) plus `NoopVcsProvider`. Same sequencing
this project used for `AgentRuntimeAdapter` (Iteration 2) and MCP grant
enforcement (Iteration 3): validate the mechanism against a fake
implementation before any real integration exists.

`generate.ts` — `render()` (§10.4), a pure function producing
`.nexus/repository.json`, `.nexus/architecture.snapshot.json`, and
`.github/workflows/nexus-alignment.yml`, each bounded by the exact
`<!-- nexus:begin generated -->` / `<!-- nexus:end generated -->` markers
the source document specifies. `repo.generated_region` (schema since
Iteration 0, empty until now) stores the hash of each file's managed
region only — never the whole file — which is what makes an edit outside
the markers invisible to drift detection and an edit inside it, not.

`localSubgraph` (`src/graph/traversals.ts`) — the eighth and last of
§8.4's named traversals, present in the source document since v2 and
unused by every iteration until this one needed it for
`.nexus/architecture.snapshot.json`.

### 13.3 A disclosed, pre-existing gap made concrete, not created

`src/import/repository.ts` (Iteration 0) has always bulk-inserted
`repo.repository` rows directly from YAML, bypassing this state machine
entirely — true since Iteration 0, simply nothing to be inconsistent
*with* until this iteration built the flow §10.2 requires. Not
reconciled here; see `docs/history/iteration-4/REPORT.md` §
"Architectural deviations" for why retrofitting the import path was left
for a dedicated pass rather than done quickly alongside this one.

### 13.4 Deliberately not built

`CLAUDE.md`/`AGENTS.md` generation (needs a real `runtime.hint_file_template`
row, which needs a real adapter, which does not exist); the full
`POST /alignment/verify` endpoint and rule set beyond the managed-region
comparison (§10.5 — the rest reuses traversal/alignment functions that
already exist and is cheap to wire up once needed); anchor verification,
dependency-cycle enforcement, capability coverage by tests (§10.6, already
deferred in the source document itself); real GitHub provisioning, branch
creation, or PR opening — the first of those three, real GitHub
provisioning, is now done; see §14.

## 14. Iteration 5: a real GitHub-backed VcsProvider

Full detail in `docs/history/iteration-5/SCOPE.md`, `REPORT.md`, and
`LESSONS.md`.

### 14.1 What this validates

The second of `docs/PROJECT_KNOWLEDGE.md`'s three tracked "does a
mechanism validated against a no-op stand-in hold once the real thing
exists" questions (Open Question 5 — check that document directly for its
current ranking, not this sentence): does the `VcsProvider` port and the
Iteration 4 bootstrap state machine hold once driven against real GitHub?
Answered by provisioning a real, private repository, driving it
unmodified through every remaining bootstrap step, and deliberately
triggering a genuine API failure (a name collision) — not simulated. See
`docs/history/iteration-5/REPORT.md` § "The live validation run, in full."

### 14.2 `src/repository/gh-cli-vcs-provider.ts`

`GhCliVcsProvider implements VcsProvider`, shelling out to `gh repo
create` via `child_process.execFile` — no new npm dependency. `mapGhError`
classifies failures (`not-installed`, `not-authenticated`, `name-taken`,
`network`, `unknown`) from `gh`'s stderr text, since `gh repo create` has
no `--json` flag (checked against `gh repo create --help` before writing
any adapter code — `docs/history/iteration-5/SCOPE.md`'s own assumption
otherwise was wrong). `extractOwnerRepo` parses `owner/name` out of the
plain URL `gh repo create` prints on success.

Repository visibility (`"private" | "public"`) is a constructor parameter
on `GhCliVcsProvider`, not part of `create()`'s per-call input — the
port's type is unchanged, but the decision moved to a place the port does
not model. Disclosed as a real, undecided design choice, not a settled
one — see `docs/PROJECT_KNOWLEDGE.md` Unproven.

### 14.3 `src/cli/verify-github.ts` — not part of `npm test`

Requires real `gh` authentication and real network access, so it is
deliberately excluded from the hermetic `npm test` suite this project has
kept offline since Iteration 0:

```
npm run verify:github   # from the repository root; requires gh auth login
```

It seeds a minimal architecture, drives `declareRepository →
provisionRepository(GhCliVcsProvider) → registerMapping →
generateProjection → activateRepository` against a real, uniquely-named,
private repository, independently confirms the result with a separate
`gh repo view` call, deliberately triggers a name collision to exercise
the failure path, and attempts cleanup via `deleteRepository` — not part
of the `VcsProvider` port itself, since §10.2 does not describe deletion
as part of the bootstrap flow.

### 14.4 A disclosed exception, not a silent gap

Automated cleanup requires the `delete_repo` OAuth scope, distinct from
the `repo` scope that repository creation needs; the credential used this
iteration did not have it. `verify-github.ts` handles this as an expected,
handled outcome — printing the manual cleanup command — rather than
crashing or leaving an unexplained repository unexplained. See
`docs/PROJECT_KNOWLEDGE.md` Invalidated for why "existing credentials are
sufficient" was the wrong frame.

### 14.5 Deliberately not built

Pushing `generateProjection`'s output to the real repository, creating a
real branch, or opening a real PR (§10.2 steps beyond provisioning) — a
distinct, larger, undesigned claim, explicitly out of scope for this
iteration. Multi-visibility provisioning through one running process. Any
GitHub App, OAuth flow, or enterprise authentication work — not justified
by any constitutional principle raised so far.

## 15. Iteration 6: a real Claude SDK Adapter

Full detail in `docs/history/iteration-6/SCOPE.md`, `REPORT.md`, and
`LESSONS.md`.

### 15.1 What this validates

The third and last of `docs/PROJECT_KNOWLEDGE.md`'s three tracked "does a
mechanism validated against a no-op stand-in hold once the real thing
exists" instances (Open Question 5 — check that document directly for its
current framing, not this sentence): does the `AgentRuntimeAdapter` port
(§12.2), validated in Iteration 2 against two trivial adapters, hold once
driven by a real agent with real behavioral complexity? Answered by
driving a real Claude agent through one real run — real streaming
translation, a real in-process MCP server, real grant-checked tool
calls — with zero changes to `src/runtime/port.ts` or
`src/runtime/registry.ts`, confirmed directly, not by intention. See
`docs/history/iteration-6/REPORT.md` § "The live validation run, in full."

### 15.2 `src/runtime/adapters/claude-sdk.ts`

`ClaudeSdkAdapter implements AgentRuntimeAdapter`, using
`@anthropic-ai/claude-agent-sdk`'s `query()` with all built-in tools
disabled (`tools: []`) and only a real, in-process MCP server
(`createSdkMcpServer`/`tool()`) exposing `src/mcp/tools.ts`'s existing,
unchanged grant-checked `getAncestry`/`getCapabilitiesOf` wrappers.
`mapMessage()` translates the SDK's real streaming output onto the six
`RunEvent` kinds — a Nexus MCP tool call → `ContextRequested`, a clean
result → `RunCompleted`, an error result → `RunFailed`. Most of what the
SDK actually emits has no `RunEvent` counterpart and is silently absorbed
— disclosed precisely in the file's own comments, not glossed over.

Needs a `SqlExecutor` at construction, a private MCP-server-construction
method, and a handle carrying four fields (`query`, `lastResultText`,
`toolCalls`, `toolResults`) where the two no-op adapters' handles carried
one (`runId`) — "one row, one class" (§12.7) holds at the level of files
touched outside the adapter itself (zero), not at the level of what the
adapter needs to be internally. See `docs/PROJECT_KNOWLEDGE.md` Validated
for the precise claim, stated without rounding either direction.

### 15.3 `src/cli/verify-claude-adapter.ts` — not part of `npm test`

Spawns a real agent run with real, small API cost, so it is deliberately
excluded from the hermetic suite, the same reason `verify-github.ts` is:

```
npm run verify:claude-adapter   # from the repository root; requires an authenticated claude CLI
```

It seeds a minimal real architecture, constructs a real grant naming one
in-grant component and excluding another, drives `ClaudeSdkAdapter`
against them, and checks — against the protocol-level `toolCalls`/
`toolResults` record, not the agent's own prose summary — that an
in-grant call succeeds with real data and an out-of-grant call is refused
as a typed `GrantRefusedError`, both through the real MCP exchange the SDK
actually uses.

### 15.4 A bug in this iteration's own harness, not in the agent

The first two live runs looked like evidence that a real agent ignores
literal instructions. It was not: `ClaudeSdkAdapter.start()`'s only inputs
are `runId`/`workPackage`/`grant`, and the verification script's specific
instructions were built into a local variable that was only ever
`console.log`ged, never passed to the adapter. `buildPrompt()` now reads
`workPackage.acceptanceCriteria` — a real, pre-existing
`WorkPackagePayload` field — and the script passes its instructions
through that field instead. See `docs/PROJECT_KNOWLEDGE.md` Invalidated
and `docs/history/iteration-6/LESSONS.md` "Biggest Surprise" for why this
is recorded as a finding about this project's own harness, not about
agent reliability in general.

### 15.5 Deliberately not built

A real Orchestrator (§12.4); `RunBlocked` wired to real proposal-drafting;
the standalone, externally-reachable MCP server §9.2–9.4 describe (this
iteration's MCP server is real but in-process); the other five
Architecture MCP tools and all of Work/Repository MCP; the output path
(§12.5 — branch push and PR); any role other than `role.implementer`;
adapter-selection or multi-adapter dispatch logic.

## 16. Iteration 7: does the MCP grant model bound what an agent can learn?

Full detail in `docs/history/iteration-7/SCOPE.md`, `REPORT.md`, and
`LESSONS.md`.

### 16.1 What this validates

At the start of this iteration, `docs/PROJECT_KNOWLEDGE.md`'s oldest open
item, open since Iteration 3: does §9.5's "bounds agent blast radius
provably" claim hold for what an agent can *learn* through an in-grant
call's own result, not only for what it can directly query? (Now
resolved and removed from that document's Open Questions — check it
directly for the current list, not this sentence.) Iteration 3 left
`getAncestry`'s result unfiltered as a disclosed, deliberate reading of
§9.5 — this iteration tested that reading against a real agent for the
first time (only possible once Iteration 6's real adapter existed) and
found it did not hold: one real, non-adversarial run disclosed an
out-of-grant product codename unprompted. See
`docs/history/iteration-7/REPORT.md` § "The first live run, in full."

### 16.2 `src/mcp/tools.ts#redactOutOfGrantAncestor`

`getAncestry`'s result is now filtered: any ancestor row whose `id` is
not itself in `grant.allowedElementIds` has its `id` and `name` replaced
with a depth-scoped placeholder (`[redacted:depth=N]`, `"[redacted]"`),
while `kind` and `depth` are preserved. The grant-agnostic traversal
layer (`src/graph/traversals.ts#ancestry`, used elsewhere by e.g.
`governanceOf`) is untouched — the filtering lives entirely in the MCP
tool wrapper, the same layer that already does the call-target grant
check. Confirmed against the identical real scenario, re-run after the
fix: the same real agent reached the same correct structural conclusion
using only `kind`/`depth`, and no longer disclosed any redacted
identity.

### 16.3 `src/cli/investigate-ancestry-disclosure.ts` — not part of `npm test`

Deliberately not named `verify-*`: its Phase A outcome was not known in
advance.

```
npm run investigate:grant-disclosure   # requires an authenticated claude CLI
```

Seeds a real architecture where an in-grant leaf's containment chain
passes through three out-of-grant ancestors (the outermost a realistic
unannounced-initiative-shaped product codename), then drives one real
`ClaudeSdkAdapter` run with a task that never mentions ancestry,
architecture, or product context — only a genuine, ordinary
pre-implementation structural check. Classifies the result against the
protocol-level `toolCalls`/`toolResults` record, not the agent's prose.

### 16.4 Deliberately not built

A general-purpose grant-result-filtering framework applying uniformly to
every MCP tool (only `getAncestry` has been shown to carry this risk —
see `docs/PROJECT_KNOWLEDGE.md` Unproven); the adversarial-prompting
scenario named in `SCOPE.md` §5.B; any change to `assertInGrant` or the
grant-widening formula, both already validated and untouched.

## 17. Iteration 8: can a real agent's RunBlocked signal be captured?

Full detail in `docs/history/iteration-8/SCOPE.md`, `REPORT.md`, and
`LESSONS.md`.

### 17.1 What this validates

The narrower half of `docs/PROJECT_KNOWLEDGE.md`'s current Open Question
#1: does the six-event `RunEvent` vocabulary hold for `RunBlocked`, the
one kind (besides `ArtifactProduced`) Iteration 6's real adapter never
produced from anything real? Answered by driving one real run where a
real agent hit a real, legitimate refusal and correctly signaled it —
`events()` translated that into a genuine `RunBlocked` event on the
first live attempt, no correction needed afterward. See
`docs/history/iteration-8/REPORT.md` § "The live run, in full."

### 17.2 `src/runtime/adapters/claude-sdk.ts` — two small, targeted additions

`buildPrompt()` now always includes one standing instruction (not a
per-task `acceptanceCriteria` item): if a tool call is refused for being
outside the grant, and the agent judges that information genuinely
necessary, end the response with an exact line, `BLOCKED:
context-insufficient — <one sentence>`. `mapMessage()` gained one new
parsing path (`parseBlockedSignal()`) that checks the terminal result
against that exact convention and emits a real `RunBlocked` event
(reason `context-insufficient`) instead of `RunCompleted` when it
matches. Every other message-kind mapping is unchanged. `proposalDraft`
is never populated — deliberately out of scope, a separate, larger
parsing and design problem.

Only `context-insufficient` has a real translation path.
`architecture-change-required` and `mapping-missing` remain type-level
only — neither is discoverable with the two MCP tools this project has
(`getAncestry`, `getCapabilitiesOf`); see `docs/PROJECT_KNOWLEDGE.md`
Unproven.

### 17.3 `src/cli/investigate-run-blocked.ts` — not part of `npm test`

Deliberately not named `verify-*`: the outcome was not known in advance.

```
npm run investigate:run-blocked   # requires an authenticated claude CLI
```

Seeds a task with a genuine, ordinary reason to check a related
component's capabilities before treating implementation as ready — the
related component is deliberately outside the run's grant. Classifies
the result against the protocol-level `toolCalls`/`toolResults` record
and the real event sequence `events()` produced, not the agent's prose
alone — using `claude-sdk.ts`'s own `parseBlockedSignal()`, not a second
regex (a real duplication found and fixed during `/review`; see
`docs/history/iteration-8/REPORT.md`, "Pre-commit review findings").

### 17.4 A deliberately fragile mechanism, chosen on purpose

The `BLOCKED:` convention is an exact-match regex, not a lenient parser
— named as a real risk in `SCOPE.md` §5.A before the run, not discovered
afterward. A looser parser was rejected specifically because it risks a
worse failure mode (an ordinary report misclassified as blocked) than
the one it would guard against (a real signal phrased slightly
differently and missed). The live run's own agent output shows the
convention coexisting with full prose reasoning before it — the marker
is a terminal signal, not a replacement for genuine explanation.

### 17.5 Deliberately not built

`proposalDraft` population; `architecture-change-required` and
`mapping-missing` (see 17.2); a dedicated `requestBlocked` MCP tool
(named as an alternative, not needed — the simpler mechanism worked);
any Orchestrator-side reaction to a received `RunBlocked` event;
`ArtifactProduced` and the real output path — the one `RunEvent` kind
that remains entirely untested against a real agent.

## Execution telemetry

**Not an iteration**, and — despite appearing after Iteration 7 in this
document's section order — done chronologically between Iterations 6
and 7, not after both; this section stays here rather than being
inserted mid-document so Iteration 7's own numbered §16 subsections
read as one continuous unit. A focused enhancement to close a specific
gap: real agent runs were producing real evidence
(token counts, durations, what was actually retrieved) with nowhere to
record it, and `execution.execution_run`'s own `started_at`/`ended_at`
columns had sat unwritten since Iteration 0. The goal is evidence
preservation, not analytics — no dashboards, no aggregation, no cost
calculation.

### What was reviewed before anything was built

Per the request that prompted this work, the existing implementation was
reviewed first, not guessed at: `@anthropic-ai/claude-agent-sdk` exports
no token-counting utility (checked directly against its type
definitions), so a Work Package's real token count is not measurable
today — only its real byte size is. No repository-scoped MCP tool exists
(only `getAncestry`/`getCapabilitiesOf`, both element-scoped), so
`accessedRepositoryCount` is not measurable today either. Both fields
exist in the schema and hold `null`, documented precisely, not estimated
or omitted.

### `src/execution/telemetry.ts` and `execution.run_telemetry`

A new table, insert-only, in the `execution` schema — deliberately
separate from `execution.execution_run`/`run_event` (which model a full
Orchestrator-driven state machine this enhancement does not build).
Execution owns the table and the writer function
(`recordRunTelemetry`); Runtime Integration populates it —
`ClaudeSdkAdapter` gathers real facts only it has access to (SDK token
counts, real timestamps) and calls the Execution-owned function, never
the reverse. Nothing in `src/execution/telemetry.ts` imports from
`src/runtime/`; every field is a plain string, number, `Date`, or `null`
— no Claude-specific shape crosses into the schema or this module.

`ClaudeSdkAdapter.events()` records exactly one row per run, from a
`finally` block wrapping its message loop — fires on normal completion
*and* on an in-process exception, so a run that dies mid-stream still
leaves behind whatever was known up to that point. A hard process kill
that skips `finally` entirely is the one case this cannot protect
against; not claimed otherwise. A telemetry write failure is logged, not
thrown — it must never mask or replace evidence of what the run itself
actually did.

### Demonstrated against a real run

`npm run verify:claude-adapter` now also prints and checks the real
`execution.run_telemetry` row its own run produces:

```
duration_ms: 8489              (real, positive)
work_package_size_bytes: 654   (real, positive)
input_tokens / output_tokens / total_tokens: 6 / 514 / 520   (from the real SDK result)
grant_element_count / grant_repository_count: 1 / 0          (the real grant)
accessed_element_count: 1      (the refused call does not count as accessed)
work_package_size_tokens: null (no tokenizer exists)
accessed_repository_count: null (no repository-scoped MCP tool exists)
```

`test/execution-telemetry.test.ts` (8 hermetic cases) covers the pure
context/grant-deriving functions, a full insert/select round trip against
the real schema, a run that never reaches a terminal result still leaving
a row, the `run.<ulid>` id check constraint, and confirms no cost-related
column exists on the table at all.

### What this does, and does not, tell us

`docs/PROJECT_KNOWLEDGE.md` records the capability itself as Validated —
a real run can leave behind real evidence of what it cost and touched.
It explicitly does **not** validate the larger claim this enhancement was
building toward being able to test: that Nexus *reduces* context
consumption or execution cost. That remains Unproven, deliberately —
one run's numbers are a data point, not a trend; validating the larger
claim needs historical execution data this enhancement only makes it
possible to start collecting.
