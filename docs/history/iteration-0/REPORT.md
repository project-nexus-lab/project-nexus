# Iteration 0 Report — Nexus Core

Status: complete. All seven deliverables listed in the Iteration 0 task are
implemented, tested, and passing (44 `node:test` cases, `npm test`; a
narrated equivalent at `npx tsx src/cli/verify.ts`). This report documents
what exists, what was deliberately left out, and what implementation
surfaced that the architecture documents don't fully resolve.

---

## 1. What was implemented

| Deliverable | Location | Notes |
|---|---|---|
| PostgreSQL schema | `db/migrations/0001`–`0006` | Full §7 schema (`architecture`, `work`, `repo`, `execution`, `runtime`), applied to an embedded, wire-compatible Postgres (PGlite) — same SQL a networked Postgres would run. |
| Stable ID validation | `src/ids/ids.ts` + check constraints in every migration | Enforced at two independent layers: the import boundary (fails fast with a precise error) and the database (the ultimate guard, §7.2). |
| Architecture YAML import | `src/import/architecture.ts` | Products, domains, subsystems, components, capabilities, `provides`, `dependsOn`, decisions + scope, constraints + scope. |
| Work YAML import | `src/import/work.ts` | Initiatives, epics, features, tasks, acceptance criteria, `affects`, `implementedIn` overrides. Enforces the §3.5 no-orphan-task / no-zero-AC invariant at write time. |
| Repository YAML import | `src/import/repository.ts` | Repositories, `implements` mappings, curated `fileAnchor` rows (§13 Alternative A). |
| Core graph traversals | `db/migrations/0007_graph.sql`, `0008_alignment.sql`, `src/graph/*` | All 6 traversals requested, plus `providersOf`, `impactOf`, `resolve` needed internally by Work Package generation. Demonstrated in §3 below. |
| Work Package generation | `src/workpackage/build.ts`, `canonicalize.ts` | `buildWorkPackage(taskId, profileId)`: gate → resolve succession → traverse → bound → anchor → govern → frame → canonicalise+hash → persist (§11.2, step by step). Deterministic and idempotent, demonstrated in §5. |

Also present, because the schema deliverable ("implement the V2 schema")
is unconditional: the `architecture.change_proposal` / `change_operation` /
`element_succession` tables, and the entire `runtime` schema. No code path
writes to them in iteration 0 — see §2.

---

## 2. What was deferred

Strictly per the task's exclusion list and `MVP_ARCHITECTURE_V2.md` §15/§16.
Nothing below is missing by oversight; each has a schema already in place
where the architecture calls for one, and iteration-0 code never assumed
its absence in a way that would need rework.

| Deferred | Why it's safe | Where the schema already waits |
|---|---|---|
| Web UI | explicitly excluded | — |
| Authentication | explicitly excluded | — |
| GitHub integration | explicitly excluded | — |
| Repository bootstrap (§10) | explicitly excluded | `repo.repository.bootstrap_state`, `repo.generated_region` |
| MCP servers (§9) | explicitly excluded | traversal functions they'd wrap already exist and are tested |
| Agent orchestration (§12) | explicitly excluded | `execution.execution_run`, `execution.run_event` |
| Claude SDK / runtime adapters | explicitly excluded | entire `runtime` schema, unused |
| Alignment workflows / proposal **lifecycle** | explicitly excluded ("architecture proposals beyond schema support") | `architecture.change_proposal`, `change_operation`, `element_succession` — schema only, nothing drafts, approves, or applies one |
| Six of eight §8.5 Alignment queries — `unmappedComponents`, `danglingReferences`, `dependencyCycles`, `unknownAdapters`, `staleWorkItemReferences`, `repositoryProjectionDrift` | task named only `orphanTasks()` and `unprovidedCapabilities()` | `mapping-missing` in the Work Package gate covers the *build-time* case `unmappedComponents()` would report continuously |
| REST APIs over Architecture/Work/Repository (§16 iteration 1a) | not requested | traversal + import functions this would wrap already exist |

---

## 3. Demonstration of all required traversals

Run against the seed dataset (§4). Output captured verbatim from
`npx tsx src/cli/verify.ts`.

### `ancestry(element)`

```
ancestry(db, "comp.invoice-service")
→ ["comp.invoice-service", "subsys.invoice", "dom.billing", "prod.trade-platform"]
  (depths 0, 1, 2, 3 — element itself, then CONTAINS* outward to the root)
```

### `capabilitiesOf(component)`

```
capabilitiesOf(db, "comp.invoice-service")
→ [
    { "capability_id": "cap.invoice-discount", "is_primary": true },
    { "capability_id": "cap.create-invoice",   "is_primary": true }
  ]
```

### `implementationPath(task)`

```
implementationPath(db, "task.invoice-discount-validation")
→ [{
    "capability_id":        "cap.invoice-discount",
    "component_id":         "comp.invoice-service",
    "provider_is_primary":  true,
    "repository_id":        "repo.billing-service",
    "repo_is_primary":      true
  }]
```

The full Task → Capability → Component → Repository chain resolves in one
call. For `task.draft-example` (no `affects` link) it correctly returns
`[]` rather than erroring.

### `governanceOf(element)` / the Work Package union form

```
governanceOf(db, "comp.invoice-service")
→ [
    { "decision_id": "adr.discount-strategy-v1", "constraint_id": null, "via_element_id": "comp.invoice-service", "depth": 0 },
    { "decision_id": null, "constraint_id": "con.backward-compatible", "via_element_id": "comp.invoice-service", "depth": 0 }
  ]

governanceOfElements(db, ["cap.invoice-discount", "comp.invoice-service"])
→ { "decisions": ["adr.discount-strategy-v1"], "constraints": ["con.backward-compatible"] }
```

The union form (used by Work Package generation, §11.2 step 6) reaches the
same governance twice — once via the capability's ancestry, once via the
component's — and correctly de-duplicates to one entry each.

### `orphanTasks()`

```
orphanTasks(db)
→ [{ "task_id": "task.draft-example", "title": "Exploratory spike, not yet scoped to a capability", "status": "draft" }]
```

`task.invoice-discount-validation` (has an `affects` link) is correctly
**not** reported.

### `unprovidedCapabilities()`

```
unprovidedCapabilities(db)
→ [{ "capability_id": "cap.invoice-export", "name": "Export Invoice" }]
```

`cap.invoice-discount` and `cap.create-invoice` (both provided by
`comp.invoice-service`) are correctly **not** reported.

---

## 4. Example seed data

The minimum dataset requested — Task → Capability → Component → Repository
— built around the exact worked example in `WORK_PACKAGE_SPEC.md`, plus
three deliberate edge cases used by the traversal demos above.

**`seed/architecture.yaml`** (excerpt — full file at that path):

```yaml
products:
  - id: prod.trade-platform
    name: Trade Platform
domains:
  - id: dom.billing
    parent: prod.trade-platform
    name: Billing
subsystems:
  - id: subsys.invoice
    parent: dom.billing
    name: Invoice
components:
  - id: comp.invoice-service
    parent: subsys.invoice
    name: Invoice Service
  - id: comp.payment-service        # deliberately left unmapped to any repository
    parent: subsys.invoice
    name: Payment Service
capabilities:
  - id: cap.invoice-discount
    parent: subsys.invoice
    name: Apply Invoice Discount
  - id: cap.create-invoice
    parent: subsys.invoice
    name: Create Invoice
  - id: cap.invoice-export          # deliberately has no provider
    parent: subsys.invoice
    name: Export Invoice
provides:
  - component: comp.invoice-service
    capability: cap.invoice-discount
    primary: true
  - component: comp.invoice-service
    capability: cap.create-invoice
    primary: true
dependsOn:
  - from: comp.invoice-service
    to: comp.payment-service
decisions:
  - id: adr.discount-strategy-v1
    title: Discount Strategy v1
    statement: >
      Discounts are applied as a percentage reduction computed at invoice
      creation time, not retroactively against issued invoices.
    governs: [comp.invoice-service]
constraints:
  - id: con.backward-compatible
    title: Backward Compatible
    statement: Changes must not alter the response shape of existing invoice APIs.
    appliesTo: [comp.invoice-service]
```

**`seed/work.yaml`**:

```yaml
initiatives:
  - id: init.q1-billing
    title: Q1 Billing Improvements
epics:
  - id: epic.invoice-discounts
    parent: init.q1-billing
    title: Invoice Discounts
features:
  - id: feat.invoice-discounts
    parent: epic.invoice-discounts
    title: Invoice Discount Support
tasks:
  - id: task.invoice-discount-validation
    parent: feat.invoice-discounts
    title: Validate invoice discount calculation
    status: ready
    affects: [cap.invoice-discount]
    acceptanceCriteria:
      - id: ac.discount-applied
        statement: A valid discount code reduces the invoice total by the configured percentage.
      - id: ac.existing-behaviour-unchanged
        statement: Invoices without a discount code are unaffected.
  - id: task.draft-example             # legitimate draft, zero affects links
    parent: feat.invoice-discounts
    title: Exploratory spike, not yet scoped to a capability
    status: draft
```

**`seed/repository.yaml`**:

```yaml
repositories:
  - id: repo.billing-service
    name: billing-service
    provider: github
    providerRef: acme/billing-service
    defaultBranch: main
    implements:
      - component: comp.invoice-service
        primary: true
    fileAnchors:
      - element: comp.invoice-service
        pathGlob: InvoiceService.java
```

Importing this dataset produces:

```
architecture: { elements: 8, provides: 2, dependsOn: 1, decisions: 1, constraints: 1 }
repository:   { repositories: 1, mappings: 1 }
execution:    { profiles: 1 }
work:         { workItems: 5, acceptanceCriteria: 2, affects: 1 }
```

---

## 5. Example generated Work Package

```
buildWorkPackage(db, "task.invoice-discount-validation", "wpp.implementation")
```

produces:

```json
{
  "id": "wp.1",
  "schemaVersion": 2,
  "profile": "wpp.implementation",
  "task": "task.invoice-discount-validation",
  "feature": "feat.invoice-discounts",
  "capabilities": ["cap.invoice-discount"],
  "components": ["comp.invoice-service"],
  "repositories": ["repo.billing-service"],
  "files": ["InvoiceService.java"],
  "constraints": ["con.backward-compatible"],
  "acceptanceCriteria": ["ac.discount-applied", "ac.existing-behaviour-unchanged"],
  "decisions": ["adr.discount-strategy-v1"]
}
```

— field-for-field identical to `WORK_PACKAGE_SPEC.md`'s own worked example
(the display form `WP-123` there corresponds to the internal ID `wp.1`
here; §6.1 defines `wp.<seq>` as the canonical form and `WP-<seq>` as the
display form).

**Content hash**: `c91ad33a7cb0d8337a78ac1bb6e7c68e28711158007c1fc9a48e2b224b6983f4`
— identical across repeated invocations, including across separate process
runs against a freshly-imported database (verified by running `verify.ts`
twice, independently, above).

**Determinism and idempotency, demonstrated**:

```
wp1 = buildWorkPackage(task, profile)   → created: true,  id: "wp.1"
wp2 = buildWorkPackage(task, profile)   → created: false, id: "wp.1"  (same row returned)
wp1.contentHash === wp2.contentHash     → true
select count(*) from execution.work_package where task_id = task  → 1
```

Two calls, one row. The hash is computed over the payload *excluding* its
own `id` (see §6.2) — that's what makes returning the *same* `id` on the
second call possible at all.

**Gate rejection, demonstrated**: `buildWorkPackage(db, "task.draft-example", "wpp.implementation")`
throws `WorkPackageGateError` with `reason: "task-not-ready"` — the task is
`draft`, not `ready`. `test/workpackage.test.ts` additionally exercises and
asserts every other gate-failure `reason`: `unprovided-capability`,
`mapping-missing`, `ambiguous-repository`, `retired-without-succession`.

---

## 6. Architectural deviations discovered during implementation

Nothing here contradicts `NEXUS_CONSTITUTION.md` or `MVP_ARCHITECTURE_V2.md`.
These are places where the v2 document under-specifies a mechanism it
otherwise requires, discovered only by actually building the mechanism.
Flagged per the task's instruction: *"Do not perform further architecture
redesign unless implementation exposes a contradiction."* None of these
rise to a contradiction — they're gaps the document's own invariants
require closing one specific way.

### 6.1 The content hash must exclude the WorkPackage's own `id`

§11.1 states: *"Same graph + same task + same profile ⇒ same content hash
⇒ the existing immutable package is returned."* §11.3 lists `id` as the
first field of the canonical payload, without saying whether it's part of
the hashed content.

If it were, idempotency would be impossible by construction: `id`
(`wp.<seq>`) is only known *after* a new sequence value is minted, so every
call would mint a new id, produce a new hash, and defeat the "return the
existing package" half of §11.1 entirely — the very first Work Package
built would never idempotently match itself.

**Resolution**: `contentHash()` (`src/workpackage/canonicalize.ts`) runs
over the payload *without* `id`; `id` is attached only to the persisted
`payload` jsonb after the hash has already determined whether a row exists.
This is the only reading under which §11.1 and §11.3 are both true at once.

### 6.2 `implementationPath` must use LEFT JOINs, not the literal arrow-path INNER JOINs

§8.4 states the traversal as `Task→AFFECTS→Capability←PROVIDES←Component←IMPLEMENTS←Repository`
— read literally, a chain of INNER JOINs. But §11.2 step 1 requires the
gate to *detect and reject* "every affected capability has ≥1 provider"
and (implicitly, via §4.3 step 3) a component with zero mapped
repositories. An INNER-JOIN implementation makes both cases silently
invisible: a capability with zero providers simply produces zero rows and
vanishes from the result set, rather than surfacing as something to reject.
The gate's own precondition can't be checked against data the traversal
already discarded.

**Resolution**: both joins in `graph.implementation_path`
(`db/migrations/0007_graph.sql`) are LEFT JOINs. An unprovided capability
now appears as a row with `component_id: null`; a component with no mapped
repository appears with `repository_id: null`. The gate in
`buildWorkPackage` filters these explicitly and raises the correctly-typed
error, instead of the traversal function silently deciding the answer for
it.

### 6.3 "Primary provider, unless `include_all_providers`" needs a defined fallback when no provider is primary

The schema (`element_provision_primary_uq`) enforces *at most* one primary
provider per capability — never *at least* one. §11.2 step 3 says
"providing components (primary only, unless `include_all_providers`)". Taken
literally, a capability with two non-primary providers and
`include_all_providers: false` would resolve to *zero* components — even
though the gate already confirmed the capability has ≥1 provider and let
the build proceed.

**Resolution**: `buildWorkPackage` falls back to the full provider set for
a capability when none of its providers is flagged primary, rather than
silently dropping the capability from the generated payload. Comment at
`src/workpackage/build.ts` (`selectedComponentIds` loop).

### 6.4 `unprovidedCapabilities()` should filter by `status = 'active'`

§8.5 defines the query narrowly: "Capability with no provider." Applied
literally to every capability regardless of status, a `deprecated` or
`retired` capability that has correctly lost its providers as part of its
own retirement would be reported as an alignment problem — indistinguishable
from an actively-maintained capability nobody ever implemented.

**Resolution**: `alignment.unprovided_capabilities()` adds
`and e.status = 'active'`. This doesn't change what the query is *for*, only
excludes a state category the architecture already treats as terminal
(§3.1: `active → deprecated → retired`) from a query about active gaps.

### 6.5 Two data tables the document's own DDL implies but doesn't spell out

- `work.legal_containment` — §7.4's DDL comment reads *"trigger enforces
  legal containment by kind"*, mirroring §7.3's pattern exactly, but only
  §7.3 (`architecture.legal_containment`) shows the actual table and seed
  rows. A trigger enforcing a data-driven rule needs the data; `work.legal_containment`
  was added, seeded with the three legal work-containment pairs, mirroring
  the architecture-schema pattern rather than hard-coding the rule in
  PL/pgSQL (consistent with §16's closing note: "the containment *rules*
  are a table").
- ID check constraints beyond `architecture.element` — §7.3 shows the full
  regex check constraint for `architecture.element.id` (covering all five
  architecture-kind prefixes in one pattern), but the DDL for
  `work.work_item`, `repo.repository`, `architecture.decision`,
  `architecture.constraint_def`, `execution.work_package_profile`,
  `execution.work_package`, and `execution.execution_run` shows each `id`
  column as plain `text primary key`, unconstrained. Since §6.1 gives an
  unambiguous prefix for every one of these, and the task explicitly asks
  for "stable ID validation" as a deliverable (not just at the import
  boundary), each of those columns got the corresponding check constraint
  in the migrations here. This is additive, not corrective — it doesn't
  reject anything the literal DDL would have accepted through the *import*
  path (the application layer already validates first), but it closes the
  gap for anything that reaches the database by another route.

### 6.6 `impactOf` (§11.2 step 4, "Bound") was initially a no-op — caught while preparing this report

The first implementation of `buildWorkPackage` documented step 4 in a
comment but never called `graph.impact_of`. It cost nothing in the seed
data (the one profile ships `context_depth: 0`, for which `impactOf` is
always empty by definition), so every test still passed — the gap was
invisible from the outside. It was only caught by re-reading the pipeline
against §11.2 line by line while writing this report, which is itself worth
recording: **a test suite built against `context_depth = 0` cannot catch
`context_depth > 0` regressions**, because the profile that would exercise
that code path doesn't exist in the seed. Fixed in
`src/workpackage/build.ts` (now genuinely calls `impactOf` per resolved
component and unions the result into `WorkPackageResult.impactedComponents`,
kept out of the persisted payload per §11.3) and covered by two new tests —
one at `context_depth: 0` (asserting the empty case is real, not accidental)
and one at `context_depth: 1` (asserting `comp.payment-service` is actually
surfaced via the seed's `comp.invoice-service dependsOn comp.payment-service`
edge).

---

## 7. Recommended Iteration 1 scope

Per `MVP_ARCHITECTURE_V2.md` §16, iteration 1 splits into six pieces
(1a–1f). Recommendation: **do them in that order**, because each is a thin
layer over something iteration 0 already built and tested — the risk this
early is doing them out of order and rebuilding a layer twice.

1. **1a — REST endpoints + `resolve` traversal wired up.** Lowest risk: it's
   an HTTP layer over `src/import/*` and `src/graph/*`, which already exist,
   are typed, and are tested. `resolve()` already exists (§8.2 needed for
   succession); this just exposes it. Acceptance per §16: `implementationPath`
   returns correct multi-provider results over HTTP — already true
   in-process, so this is genuinely just plumbing.

2. **1b — Proposal lifecycle.** The schema (`change_proposal`,
   `change_operation`, `element_succession`) has sat untouched through all
   of iteration 0; this is where it starts earning its place. Recommend
   building this *before* repository bootstrap (1c) and MCP (1e), because
   §5.4's unblocking flow is the mechanism that makes the rest of the
   platform's core promise ("no orphan tasks, ever, even when architecture
   is missing") actually true under delivery pressure — without it, 1c–1f
   are demoing a platform that still has the exact hole §5.1 describes.

3. **1c — Repository bootstrap + managed regions + `POST /alignment/verify`.**
   Depends on 1b only for the `ProposalApplied → Repository declared` event
   path (§2.2); the bootstrap state machine itself (§10.1) doesn't. Can run
   in parallel with 1b if resourced separately.

4. **1d — Work Package persistence via the Context Builder as a service.**
   Already done as a pure function (`buildWorkPackage`) — 1d is now "wrap it
   in an endpoint/queue trigger," not "build it." Genuinely low-risk given
   iteration 0's coverage.

5. **1e — Three MCP servers with run-scoped grants (§9.5).** This is where
   `impactOf` (§6.6 above) stops being a value nobody reads: the grant
   formula is literally `WP elements ∪ impactOf(components, context_depth + 1)`,
   and `impactedComponents` on `WorkPackageResult` was shaped with exactly
   this consumer in mind.

6. **1f — Orchestrator + Claude SDK Adapter + `RunBlocked` handling.**
   Last, as the architecture document itself insists (its own acceptance
   criterion: *"iteration 1f closes without a change to §2–§8"*). Nothing
   in iteration 0 needs revisiting for this to be true so far.

**One item worth scoping explicitly into 1a-or-earlier rather than letting
it drift**: `unmappedComponents()`, `danglingReferences()`, and
`dependencyCycles()` (§8.5) were out of iteration-0's requested scope, but
`dependencyCycles()` in particular gates a real invariant
(`element_dependency` has no cycle-prevention today — only no-self-dependency).
Recommend adding it in 1a alongside `resolve()`, since it's the same shape
of read-only traversal work and closes a gap before `impactOf` gets a real
consumer in 1e that could otherwise walk an undetected cycle.
