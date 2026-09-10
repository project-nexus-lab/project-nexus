# MVP Architecture — Design Review

Date: 2026-09-10
Reviews: `MVP_ARCHITECTURE.md` (proposed)
Verdict: **sound skeleton, one deadlock, one misplaced join point**

Two findings are structural and should be resolved before any schema is
created. The rest are corrections, and four are concrete defects in the
document as written.

---

## Summary of verdicts

| Q | Question | Verdict |
|---|---|---|
| 1 | Should Capability be contained beneath Component? | **No.** Change it. |
| 2 | Should cross-context FKs exist? | **Yes — some.** The blanket ban was wrong. |
| 3 | Is AgentRole core domain? | **No.** Profile is; Role is not. |
| 4 | How does architecture evolve from a Task? | **Unspecified — this is a deadlock.** |
| 5 | Which assumptions will break? | Six named, ranked by probability. |

---

## 1. Capability containment

### The proposal

`MVP_ARCHITECTURE.md` §3.2 puts `capability` beneath `component` in the legal
containment table, and §5.1 stores that link in `element.parent_id`.

### Why that is wrong

**It makes the join point of the entire graph depend on the churniest layer of
the taxonomy.**

Capability is where Work meets Architecture (`Task affects Capability`). Its
identity therefore has to be at least as stable as the work that references
it. But Components are precisely the elements that get split, merged, replaced
and rewritten. Under the proposal, every one of those refactors either
reparents a Capability or orphans it.

Four concrete consequences:

1. **Governance silently changes under refactor.** Constraints and Decisions
   inherit down `CONTAINS` (§6.5). Move a Capability to a different Component
   and its resolved governance set changes — which means the same Task, with
   the same graph otherwise, produces a different Work Package. That breaks
   the determinism claim in §9.1 for reasons unrelated to the task.
2. **Component retirement structurally orphans Capabilities.** A capability
   whose only provider is retired becomes a broken tree node, not a
   meaningful state.
3. **Multi-provider capabilities are inexpressible.** A capability delivered
   by an API component plus a worker component is ordinary. So is the
   transitional state during a migration, where two components provide the
   same capability by design. `WORK_PACKAGE_SPEC.md` already declares
   `components:` and `repositories:` as **arrays** — the spec anticipated
   fan-out that the containment model forbids.
4. **`parent_id` means two different things.** For four kinds it is
   `CONTAINS`; for `capability` it is `PROVIDES`. §6.3 declares them as
   distinct edge types while §5.1 stores them in one column. Any traversal
   over `parent_id` — `ancestry`, `impactOf` — walks a PROVIDES edge as
   though it were containment. **This is a correctness defect, not a
   modelling preference.**

### The source documents do not require the proposal's reading

`NEXUS_CONSTITUTION.md` writes the taxonomy as a chain, but its own Graph
Model section writes the relation as `Component provides Capability` —
*provides*, not *contains*. The proposal collapsed those two into one link.
The Constitution supports the separation.

### Recommendation

Separate containment from provision.

```
Product   contains  Domain
Domain    contains  Subsystem
Subsystem contains  Component      (structure)
Subsystem contains  Capability     (behaviour)
Component provides  Capability     (many-to-many, mutable)
```

| Option | Assessment |
|---|---|
| A — Component contains Capability | rejected, see above |
| **B — Subsystem contains, Component provides** | **recommended** |
| C — Domain contains, Component provides | fallback if Subsystems prove churny |
| D — Capability has no containment parent | rejected: breaks `ancestry`, breaks governance inheritance |

The decisive test: *does splitting a Component change a Capability's place in
the tree?* Under A, yes. Under B, only a `provides` edge moves.

### Consequential changes

- New table `architecture.element_provision (component_id, capability_id, is_primary)`,
  with a partial unique index on `(capability_id) where is_primary` so the
  ordinary single-provider case stays single-valued and deterministic.
- `element.parent_id` now means `CONTAINS` only. Legal containment gains
  `(subsystem, capability)` and loses `(component, capability)`.
- Governance for a Work Package becomes
  `ancestry(capability) ∪ ancestry(each providing component)`. §9.2 step 4
  already iterates resolved elements, so the pipeline is unchanged.
- §8.5's alignment check "a mapped component has no capabilities" becomes
  "provides no capabilities".
- New alignment query `unprovidedCapabilities()` — capabilities with zero
  providers. This is the payoff: what was an integrity violation under A
  becomes a first-class, meaningful finding.

### Cost of deferring

High and rising. Once Tasks and immutable Work Packages reference capability
IDs, moving the containment link is a migration across the join point of the
whole graph. Do this before iteration 0.

---

## 2. Cross-context foreign keys

### The proposal

§5.2 omits all cross-schema FKs, with the stated rationale that Work should
depend on Architecture "through published IDs only", keeping contexts
"independently deployable".

### Why that is wrong

**It pays an integrity cost now for an option that §11 explicitly
postpones.** The MVP is one Postgres instance, one deployable; the event bus
and any service split are deferred to iteration 2. So the benefit is
hypothetical while the cost is immediate — and the cost lands on the single
strongest rule in the Constitution: *no orphan tasks*.

Without an FK, `work_item_capability.capability_id = 'cap.typo'` inserts
cleanly and stays wrong until an asynchronous Alignment query notices. The
Constitution requires CI to fail on broken capability links, but CI governs
*repositories*. A dangling reference inside the system of truth is a strictly
worse failure than a dangling reference in a projection, and the proposal
guards the projection while leaving the source unguarded.

### But a blanket "add FKs everywhere" is also wrong

Three references must **not** be FKs:

- `execution.work_package.task_id` and every ID inside `payload` — a Work
  Package is an immutable historical record. When `task.foo` is retired,
  `WP-123` must still resolve as a fact about the past. An FK would either
  block retirement or cascade-corrupt the audit trail.
- `execution.execution_run.adapter_id` → `runtime.adapter_registration` — an
  FK here would make the core schema structurally depend on the runtime
  schema. That is the exact coupling the Constitution forbids, expressed in
  DDL.

### Recommendation

Adopt an explicit rule.

> A cross-context foreign key is **required** when all three hold:
> 1. the reference is **live** (a current invariant), not **historical**;
> 2. it points along the declared dependency direction
>    (Work→Architecture, Repository→Architecture, Execution→upstream);
> 3. both schemas are in one deployable.
>
> It is **forbidden**, unconditionally, across the Runtime Integration
> boundary.
>
> Every cross-context reference that is *not* an FK must be compensated by a
> named Alignment query.

Applied:

| Reference | FK? | Reason |
|---|---|---|
| `work.work_item_capability.capability_id` | **yes** | live, bears the no-orphan-task invariant |
| `repo.repository_component.component_id` | **yes** | live, bears the mapping invariant |
| `repo.file_anchor.element_id` | **yes** | live |
| `architecture.decision_scope.element_id` | yes (same schema) | live |
| `execution.work_package.task_id` | **no** | historical; must survive retirement |
| IDs inside `work_package.payload` | **no** | historical, immutable |
| `execution.execution_run.adapter_id` | **no** | crosses the ACL |

### Enforce kind, not just existence

An FK to `element(id)` does not stop a Task from affecting a `subsystem`. Add
a composite key and reference it:

```sql
alter table architecture.element
  add constraint element_id_kind_uq unique (id, kind);

create table work.work_item_capability (
  work_item_id    text not null references work.work_item(id),
  capability_id   text not null,
  capability_kind text not null default 'capability'
                    check (capability_kind = 'capability'),
  primary key (work_item_id, capability_id),
  foreign key (capability_id, capability_kind)
    references architecture.element (id, kind)
);
```

Plain columns, fully declarative, no trigger. The same pattern replaces the
two `kind`-checking triggers in §5.1.

### Cost of deferring

Low to add later, but the damage accrues in the meantime as bad rows. Do it in
iteration 0 — it is a few lines.

---

## 3. AgentRole in the core domain

### The proposal

§3.4 declares the six `role.*` identifiers "core domain identifiers" and calls
this "the single most important seam for runtime independence". §5.4 puts
`agent_role` in the `execution` schema with an FK from `execution_run`.

### Why that is overstated

Ask what the core domain *does* with a role. In the proposal, exactly one
thing: §10.3 step 2, "selects an enabled adapter that declares support for the
role." Adapter selection is a Runtime Integration concern. The role table has
no core invariant and no core behaviour.

Worse, §10.5 retires five of the six roles into other mechanisms — the
validation gate, MCP, file anchors, the alignment check. What survives is one
row whose only consumer is dispatch.

And the Constitution's own division of labour cuts against it: the platform
owns "knowledge, architecture, governance, workflow, context construction";
runtimes own "reasoning, code generation, implementation execution." *Role* is
a decomposition of reasoning and execution — the runtime side of the line the
Constitution drew.

The reading that `AGENT_RUNTIME_MODEL.md` actually supports is narrower:
roles belong to Nexus in the sense of *not belonging to a vendor*. That is a
requirement on the ACL's vocabulary, not a claim that Role is a core
aggregate.

### What is genuinely core

`WorkPackageProfile` (`wpp.*`). It determines *what context gets constructed* —
traversal shape, depth, governance resolution. Context construction is
explicitly platform-owned. It has behaviour and invariants.

The tell that one of the two is redundant: in the MVP, profile and role are
1:1 (`wpp.implementation` / `role.implementer`). The one carrying the domain
behaviour is the profile.

### Recommendation

- Move `agent_role` from the `execution` schema to `runtime`.
- Promote `execution.work_package_profile` to a real table; `wpp.*` becomes a
  core authored ID.
- `execution_run` drops `role_id`. The profile is already implied by the
  referenced Work Package; the role becomes an opaque `adapter_role_ref`
  alongside `adapter_id`, interpreted only by the adapter.
- Keep the neutral `role.*` vocabulary — in Runtime Integration, where it
  belongs.

### The real argument for doing this

A core `agent_role` table is a **leak attractor**. It is where
`max_turns`, `subagent_type` and `model` will appear in six months, each
individually reasonable, collectively a vendor concept in the core model. Move
the table now and there is nowhere for those columns to land.

Low implementation cost. Ranked below 1 and 2 because it is boundary hygiene
rather than a correctness or deadlock issue — but it is in the published
language, so it gets cheaper the sooner it moves.

---

## 4. Architecture evolution driven by a Task

### This is the most serious problem in the document

`MVP_ARCHITECTURE.md` has **no path** for a Task that requires new
architecture. Trace it:

- §2.4 — a Task may not leave `draft` with zero Capability links.
- §9.2 step 1 — the Work Package gate fails closed if the Task is not `ready`.
- Constitution — Capabilities may only originate in Nexus.
- §10.4 — agents never write to Nexus.
- §7.6 — MCP write tools are postponed to iteration 2.
- §11 — architecture evolution is not listed at all, in either column.

So "implement invoice discounts, which needs a new `comp.discount-engine`"
has nowhere to go. That is not an edge case; it is the ordinary case in real
delivery.

**And the workaround is the exact violation the platform exists to prevent.**
Under delivery pressure, the component gets created in the repository and
registered in Nexus later — architecture originating in a projection. An
unspecified evolution path is not a gap in coverage; it is an active incentive
to breach the Constitution.

### Recommendation: architecture change is itself governed work

Introduce `ArchitectureChangeProposal` as an aggregate root in the
Architecture context.

```
ArchitectureChangeProposal
  id            acp.<ulid>
  intent        text
  originTaskId  task.*            (nullable)
  state         draft → proposed → approved → applied | rejected
  operations    ordered list of ArchitectureOperation
```

```
ArchitectureOperation
  op        create | retire | split | merge | move
  targets   element IDs
  mints     new element IDs, kinds, parents
```

Properties that make this the right shape:

- **A proposal is the architectural analogue of a pull request.** GitHub
  governs code merge; Nexus governs architecture merge. The symmetry is the
  design insight — the platform already has a review-and-approve model, it
  just was not applied to its own state.
- Approval is human. Application is transactional: it mints IDs, sets
  statuses, and writes succession edges in one commit.
- A proposal has **no effect until approved**, which is why authoring it is
  safe to open up later without touching the authorisation model.

### Unblocking flow

```
Task authored
→ gate fails: required capability does not exist
→ ArchitectureChangeProposal authored (human in MVP)
→ human approves in Nexus
→ elements minted; repository bootstrap (§8) enqueued if a new Component needs one
→ Task links to the new capability
→ Task → ready
→ Work Package generated
```

Note the ordering constraint this exposes: when a proposal mints a Component
that needs a Repository, §8 bootstrap must complete before the implementation
Task can produce a resolvable Work Package. Proposal application should
enqueue bootstrap rather than leaving it to a human to remember.

### Operations: what belongs in the MVP

| Op | MVP | Note |
|---|---|---|
| create | **yes** | unavoidable; without it the deadlock stands |
| retire | **yes** | needed for any real change |
| move | no | reparenting; iteration 2 |
| split | no | iteration 2 |
| merge | no | iteration 2 |
| rename | n/a | `name` is mutable; §4 makes rename a non-event — a genuine win of the ID strategy |

### Defect: succession must be a table, not a column

§5.1 has `superseded_by text references element(id)` — a single column. A
split is 1→N and a merge is N→1, so a column cannot express either.

```sql
create table architecture.element_succession (
  predecessor_id text not null references architecture.element(id),
  successor_id   text not null references architecture.element(id),
  proposal_id    text not null references architecture.change_proposal(id),
  primary key (predecessor_id, successor_id)
);
```

**Do this in iteration 0 even if every split/merge operation is deferred.**
Retire-plus-create is already a 1:1 succession, and converting a column to a
table after live references exist across an immutable Work Package history is
the expensive kind of migration.

Succession also needs to be traversable, so retrieval can resolve a
historical ID forward:

- new named traversal `resolve(id) → active successor set`
- `danglingReferences()` (§6.4) must consult it, so a superseded reference is
  reported as *superseded*, not as *broken*

### Defect: the five-event vocabulary is incomplete

§10.2 fixes exactly five runtime-neutral events. A run that discovers mid-flight
that architecture must change has only `RunFailed` available, which is wrong:
"blocked on platform-owned state" is a different outcome from "failed", and it
is the outcome that should produce a proposal.

Add a sixth:

```
RunBlocked { reason: architecture-change-required | mapping-missing | context-insufficient,
             proposalDraft?: ArchitectureChangeProposal }
```

Runtime-neutral, and it closes the loop: a blocked run becomes a draft
proposal instead of a silent workaround in a repository.

### Retirement policy

State it explicitly, because it is the invariant approval must check:

> Retiring an element is refused when live inbound references exist from
> non-terminal Work Items or `active` Repositories, unless the same proposal
> supplies a succession edge.

---

## 5. Assumptions most likely to be wrong

Ranked by my own estimate of probability, with severity assessed separately —
the two do not correlate, and the cheap-to-be-wrong ones are cheap by design.

### 5.1 "Depth-0 traversal keeps Work Packages small enough" — *very likely wrong, low severity*

§9.2 step 6 includes only directly implementing components. The first real
task will need the *contract* of a dependency: you cannot implement against
`comp.invoice-service` without the interface of the `comp.tax-calculator` it
depends on.

Cheap because the mitigations are already in place — `profile` is in the
payload, and §7.5 grants MCP access to `impactOf(depth 1)` so the agent can
fetch what the package omitted.

**But §7.5 and §9.2 look accidentally inconsistent** (grant depth 1, package
depth 0). It is the right split — minimum to start, deterministic expansion on
demand — and the document should say so, and move depth into
`work_package_profile.context_depth` so widening is configuration rather than
a code change.

### 5.2 "Curated FileAnchors are enough" — *likely wrong, and wrong in an instructive direction*

The failure will not be that globs are too coarse. It will be that **nobody
maintains them.** Hand-curated path globs rot within weeks; agents will ignore
`files:` and search the repository instead.

The interesting part is that the correct response is probably *not* to build
the file graph. It is to delete `FileAnchor` and let the runtime locate code
within its repo-scoped grant — because **a file path in Nexus is Nexus knowing
an implementation detail**, which is a projection leaking upward into the
system of truth. The Constitution assigns source code to repositories.

This puts a genuine tension in the source documents: `WORK_PACKAGE_SPEC.md`
mandates a `files:` field, and the Constitution says Nexus must not own
implementation detail. My recommendation is to derive `files` at dispatch time
from the repository rather than store it in Nexus — but that is an amendment
to an authoritative document and therefore **your decision, not mine.** Flagged
rather than changed.

### 5.3 "Regenerate-and-diff gives drift detection for free" — *likely wrong, easily fixed*

§8.4 is elegant until the first human edits a generated file — and `CLAUDE.md`
will be edited. From then on the diff is permanently noisy and the check gets
ignored, which is worse than not having it.

Fix: managed regions with explicit markers, and hash only the managed region.
Outside the markers, humans own the file.

### 5.4 "One profile is enough" — *wrong soon, by design*

Review and audit profiles will be wanted quickly. Already anticipated; the
field exists.

### 5.5 "Agents never write to Nexus" — *holds for code, breaks for knowledge*

The first thing you will want written back is not architecture but
*observation*: "this component actually depends on that one." The Knowledge
Maintainer role exists in `AGENT_RUNTIME_MODEL.md` for that reason.

The escape valve should be an append-only `Observation` stream — proposals,
not facts — which is the **same pattern as recommendation 4**. Unify them into
one principle worth stating in the Constitution:

> Every agent write into Nexus is a proposal. Nothing an agent produces
> becomes platform truth without human approval.

That is a stronger and simpler rule than the ad-hoc "no writes, except later,
except for these tools" the document currently implies.

### 5.6 "Legal containment as data absorbs taxonomy change" — *partly wrong, claim overstated*

§3.2 says "this table is data, not code. New taxonomy levels are a data
migration." Only half true. The containment *rules* are data, but the *kind
vocabulary* is baked into the `CHECK` on `element.kind`, the ID prefix table
(§4.1), and the names of the traversals (§6.4). Adding a level touches all
three.

Concrete prediction: the first pressure will be wanting a Component inside a
Component — a component hierarchy — and the current `CHECK` forbids it.
Recommend softening the claim in §3.2 rather than pre-building for it.

### What I would defend under pressure

Not everything here is a concession.

- **Immutable Work Package with no status column.** Lifecycle derived from
  runs, identity from content hash. This is the best decision in the document
  and it should not be traded away for reporting convenience.
- **No graph database.** Recursive CTEs over a few thousand nodes will be fine
  well past iteration 3. The node/edge/traversal schema is what makes the
  eventual swap a substitution. Resist early adoption.
- **PR-only output path.** Removes agent write authorisation, graph
  concurrency control and rollback from the MVP in one stroke. Hold this line
  even under recommendation 5.5 — proposals, not writes.
- **Run-scoped graph grants instead of RBAC.** Authorisation as a property of
  the graph rather than a role table is both simpler and a tighter bound on
  agent blast radius. It will need supplementing for *humans* once there is
  more than one team, which is a postponement, not a flaw.
- **One typed-tree aggregate for Work.** The four work kinds genuinely share
  one lifecycle. Splitting them would be ceremony. (The same argument does
  *not* rescue Architecture, because §1 shows Capability's link is a different
  relation, not merely a different kind.)

---

## Ranked recommendations

| # | Change | From Q | Why now | Cost |
|---|---|---|---|---|
| **R1** | Add `ArchitectureChangeProposal` with `create` + `retire`; wire the Task-blocked flow | 4 | Resolves a deadlock whose only workaround breaches the Constitution | medium |
| **R2** | Capability contained by Subsystem, provided by Component (many-to-many) | 1 | Fixes the `parent_id` conflation defect; retrofitting after Work Packages reference capabilities is a migration across the graph's join point | medium |
| **R3** | `element_succession` as a table, not `superseded_by` as a column | 4 | Near-free now; column→table across immutable history later is the expensive kind | low |
| **R4** | Cross-context FKs per the three-part rule; composite `(id, kind)` FKs to enforce kind | 2 | The no-orphan-task invariant is currently unguarded in the system of truth | low |
| **R5** | Add `RunBlocked` as a sixth runtime-neutral event | 4 | Without it, a blocked run degrades to a repository-side workaround | low |
| **R6** | Move `agent_role` to the `runtime` schema; promote `work_package_profile` to core | 3 | Closes a leak attractor before it acquires vendor columns | low |
| **R7** | Adopt "every agent write is a proposal" as a constitutional principle | 5.5 | Unifies R1 and the knowledge-writeback path into one rule | low |
| **R8** | Managed regions in generated files; hash only the managed region | 5.3 | Prevents the alignment check from becoming noise and being ignored | low |
| **R9** | Move traversal depth into `work_package_profile.context_depth`; document the depth-0/depth-1 split as intentional | 5.1 | Turns a likely-wrong constant into configuration | low |
| **R10** | Add relational table for `Task implementedIn Repository` | — | Declared in §3.3 and §6.3, absent from §5.2 — a plain omission | trivial |
| **R11** | Soften the "containment is just data" claim in §3.2 | 5.6 | It is half true as written | trivial |
| **R12** | Derive `files` at dispatch instead of storing anchors | 5.2 | **Requires amending `WORK_PACKAGE_SPEC.md` — your decision** | medium |

R1–R6 belong in iteration 0, before any DDL is written. R7 and R12 are
decisions about authoritative documents and are yours to make.

---

## Defects in the document as written

Independent of the five questions, four things are simply wrong or missing:

1. §5.1 — `element.parent_id` stores both `CONTAINS` and `PROVIDES`; traversals
   over it walk a provision edge as containment. (R2)
2. §5.1 — `superseded_by` as a single column cannot express split or merge. (R3)
3. §5.2 — `Task implementedIn Repository` appears in §3.3 and §6.3 but has no
   table, so §9.2's repository resolution is ambiguous when a Component has two
   repositories, with no way to disambiguate. (R10)
4. §10.2 — the closed five-event vocabulary has no representation for "blocked
   on platform state". (R5)

And one that R2 creates: §8.5's check "a mapped component has no capabilities"
must become "provides no capabilities", plus a new
`unprovidedCapabilities()` alignment query.
