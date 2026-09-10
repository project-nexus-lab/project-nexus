# Iteration 4 Report — repository bootstrap

Status: complete for the scope agreed before starting. 102 `node:test`
cases pass (up from Iteration 3's 93). The §16 acceptance bar for this
work, quoted literally from the source document, is met: *"One repo
bootstrapped, CI green, a hand-edit outside the markers does not trip the
check."*

*(This report does not restate `docs/PROJECT_KNOWLEDGE.md`'s current Open
Question ranking as a number anywhere — see Iteration 3's own report and
lessons for why that pattern kept drifting and was deliberately stopped.)*

## Scope completed

1. **`localSubgraph(component)`** — `src/graph/traversals.ts`. The eighth
   named traversal from §8.4 — present in the source document since v2,
   never called by any of Iterations 0 through 3. Composed from
   already-existing traversals (`capabilitiesOf`, `impactOf` at depth 1),
   the same pattern `governanceOfElements` already established, rather
   than a ninth SQL function for a query this shallow.

2. **The bootstrap state machine** — `src/repository/lifecycle.ts`:
   `declareRepository`, `provisionRepository`, `registerMapping`,
   `generateProjection`, `activateRepository`, enforcing
   `declared → provisioned → mapped → bootstrapped → active` (§10.1) and
   refusing every out-of-order call. `IllegalRepositoryTransitionError` /
   `RepositoryNotFoundError` reuse the exact shape
   `IllegalProposalTransitionError`/`ProposalNotFoundError` and
   `IllegalTaskTransitionError`/`TaskNotFoundError` already established —
   a third reuse of the same pattern, not a new one.

3. **A `VcsProvider` port + `NoopVcsProvider`** — `src/repository/vcs-provider.ts`.
   §10.2 states it directly: *"VcsProvider is a port; GitHub is one
   adapter."* No real GitHub integration — that exclusion has stood since
   Iteration 0 and is not revisited here. Same sequencing as
   `AgentRuntimeAdapter` (Iteration 2: port + no-op adapters before any
   real SDK) and MCP grants (Iteration 3: enforcement logic before a real
   protocol server).

4. **`render()` and the managed-region mechanism** —
   `src/repository/generate.ts`. A pure function producing
   `.nexus/repository.json`, `.nexus/architecture.snapshot.json`, and
   `.github/workflows/nexus-alignment.yml`, each bounded by the exact
   markers §10.4 specifies. `wrapManagedRegion` / `extractManagedRegion` /
   `hashManagedRegion` are the mechanism; `repo.generated_region` (schema
   since Iteration 0, empty until now) stores the hashes.

5. **`checkDrift()`** — `src/repository/lifecycle.ts`. Compares a
   *current* file's managed-region hash against what
   `generateProjection` stored. This is the function the acceptance test
   is actually about.

6. **Tests** — `test/repository.test.ts` (7 cases): the full state
   machine driven start to finish, illegal transitions refused at every
   step, `registerMapping` legal a second time once already `mapped`,
   generation proven deterministic, the literal acceptance-bar test
   (edit outside markers → no drift, edit inside → drift), and a
   malformed-file edge case (markers deleted entirely → drift, not a
   crash). Plus 2 new cases in `test/traversals.test.ts` for
   `localSubgraph`.

## Scope deferred

- **Real GitHub integration.** A real `VcsProvider` adapter — actually
  creating a repository, pushing a branch, opening a PR — is its own
  future iteration, same reasoning as the still-deferred real Claude SDK
  Adapter.
- **`CLAUDE.md` / `AGENTS.md` hint-file generation.** These render from
  `runtime.hint_file_template`, keyed by `adapter_id` — a table with zero
  real rows, because no real adapter with a real template exists.
  Seeding a placeholder template just to exercise the table would be
  building for a need that does not exist yet.
- **The full `POST /alignment/verify` endpoint and rule set (§10.5).**
  Only the managed-region drift comparison is built. Unknown-repo-id,
  broken/superseded-reference, and unprovided-capability-on-mapped-component
  checks all reuse traversal/alignment functions that already exist
  (`resolve`, `unprovidedCapabilities`) and are cheap to wire into an
  actual HTTP endpoint in a follow-on iteration once this one proved the
  harder, novel part — generation and drift — works.
- **Anchor verification, dependency-cycle enforcement, capability
  coverage by tests.** §10.6 already defers these in the source document
  itself.
- **Retrofitting YAML import through this state machine.** See
  "Architectural deviations" — disclosed, not silently left.

## Architectural deviations

None new to this iteration's own design. One pre-existing gap, made
concrete rather than left implicit: `src/import/repository.ts`
(Iteration 0) has, since it was written, bulk-inserted `repo.repository`
rows directly from YAML — bypassing the bootstrap state machine entirely,
even though the schema for that state machine has existed since Iteration
0 and §10.2 states plainly: *"Repositories are never created outside this
flow."* This iteration did not fix that; it built the flow the doc
requires without touching the path that still violates it. Both paths now
coexist: seed data continues to arrive fully-formed at whatever state
`bootstrap_state` defaults to (`declared`, never advanced), while
`declareRepository` and its siblings are the only route that actually
walks the state machine. Left as a named, disclosed inconsistency rather
than silently reconciled, because reconciling it — retrofitting the YAML
import path through five state-machine calls — was not in this
iteration's scope and doing it quickly risked doing it worse than a
dedicated pass would.

## Technical debt intentionally created

- **`declareRepository` does not check "Component exists" as a
  precondition** (§10.2 step 1), even though the source table lists it as
  step 1 of the flow. The schema itself has no repository-to-component
  reference until `registerMapping` (step 4) creates one — `repo.repository`
  has no `component_id` column. The precondition is enforced structurally,
  just later than the doc's own step numbering suggests: `registerMapping`'s
  FK on `component_id` (kind-checked to `'component'`) is what actually
  refuses a nonexistent or wrong-kind component, at step 4, not step 1.
- **No `RepositoryActivated` event handling.** §2.2 lists
  `RepositoryActivated → Work: "Tasks awaiting a repository re-gated"` —
  but no "Task blocked on a missing repository" state exists anywhere in
  this schema to re-gate. Only `blocked_by_proposal_id` exists, tied to
  proposals (§5.4), not repositories. `activateRepository` here is a bare
  state transition with no downstream effect, and none was invented to
  fill a gap this schema does not otherwise have.
- **`nexusBaseUrl` in generated `.nexus/repository.json` defaults to a
  placeholder** (`https://nexus.invalid`) — there is no real deployment
  for it to point at yet.

## Demonstrations and verification

```
npm run typecheck    # clean
npm test              # 102/102
```

The acceptance-bar test in full, from `test/repository.test.ts`:

```
declareRepository → provisionRepository(NoopVcsProvider) → registerMapping → generateProjection
  → [repositoryJsonFile, ...] = generated files, each with a hashed managed region

editedOutside = "// human note\n" + original + "\n// another note"
checkDrift(editedOutside) → drifted: false   (content outside the markers is invisible to the hash)

editedInside = original with "schemaVersion": 2 changed to 999, inside the markers
checkDrift(editedInside) → drifted: true     (the same change, inside the markers, is caught)
```

## Recommended next-step validation

Check `docs/PROJECT_KNOWLEDGE.md`'s Open Questions directly for the
current ranking before scoping Iteration 5 — not restated here. This
iteration adds one candidate to that list: whether the bootstrap
mechanism validated against `NoopVcsProvider` holds once a real
`VcsProvider` (GitHub) is built, the same shape of question Iteration 2
left open for a real `AgentRuntimeAdapter` and Iteration 3 left open for a
real MCP protocol server.
