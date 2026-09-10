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
lifecycle and a minimal REST layer — is §10.)*

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
  proposal/          Iteration 1: the Architecture Change Proposal lifecycle
                    (§5) — draft, submit, approve, reject, apply.
  work/              Iteration 1: WorkItem lifecycle (§3.5, §5.4) — link a
                    capability, mark ready, block/release on a proposal.
  http/              Iteration 1: a minimal REST layer over the above —
                    a hand-rolled router, no framework dependency.
  cli/              Four scripts: migrate, import, verify, serve.
test/               node:test suite — the executable proof for §7/§10 below.
```

`docs/` (authoritative documents) lives at the monorepo root
(`../../docs` from here), not inside this app — it governs
`apps/frontend` and `packages/*` too, not just the backend.

No `src/mcp`, no `src/orchestrator`, no runtime adapter — those are 1e/1f.
`src/http` is a thin enabling layer for the proposal lifecycle (§10.5), not
the full §16 1a REST surface.

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
npm test              # delegates to this workspace — 77 node:test cases, the authoritative check
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

`docs/PROJECT_KNOWLEDGE.md`'s highest-ranked Open Question: does §5's
proposal lifecycle actually close the loop it exists to close — a Task
blocked on missing architecture reaching `ready` again without a manual
database edit? `test/proposal.test.ts`'s end-to-end test proves it does,
against the exact scenario §5.1 describes (a gate failure from
`buildWorkPackage`, not a synthetic one).

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
