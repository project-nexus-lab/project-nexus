# Project Knowledge

The cumulative, evidence-based record of what is known about Project
Nexus's architecture — as distinct from what `docs/MVP_ARCHITECTURE_V2.md`
and its supporting documents *propose*. Updated at the end of every
iteration from that iteration's `docs/history/iteration-N/LESSONS.md`, per
the Iteration Discipline in `CLAUDE.md`.

This document only grows by evidence. An assumption moves from Unproven to
Validated or Invalidated only when an iteration actually demonstrates it —
not when it merely seems likely, and not when the architecture documents
assert it. Each entry names the iteration that last confirmed it, so a
stale entry (an area untouched for several iterations) is visible as such.

**Authority.** Per the Knowledge Distillation Rule (`CLAUDE.md`), this
document sits below the Constitution, the supporting model documents, and
the current architecture documents, and above historical iteration
reports:

1. `docs/NEXUS_CONSTITUTION.md`
2. Supporting model documents
3. Current architecture documents
4. **This document**
5. Historical iteration reports

Iteration reports inform this document. They do not replace it — this
document is current truth; they are historical record. For the reasoning,
code pointers, and full evidence behind any entry below, see the
corresponding iteration's `docs/history/iteration-N/LESSONS.md`. For a
narrative account of what was built, see
`docs/history/iteration-N/REPORT.md`.

---

## Validated

Demonstrated correct by direct implementation evidence.

| Assumption | Since | Evidence summary |
|---|---|---|
| One typed-tree aggregate per taxonomy (kind discriminator + `parent_id` + data-driven legal-containment), not per-kind aggregates, is sufficient for both Architecture and Work | Iteration 0 | Identical pattern (~50 lines) implemented independently for `architecture.element` and `work.work_item`; illegal containment rejected declaratively for both, with zero per-kind application code. |
| Legal containment and the no-orphan-task invariant can be enforced both declaratively (DB trigger/FK) and continuously (a query), without the two disagreeing | Iteration 0 | `orphanTasks()` and the import-time guard independently agree on every test case; a legitimate draft task with zero links is accepted by both, not just one. |
| The graph can be "a set of named recursive-CTE views over Postgres" (§8.1) with no graph database, for the traversal contract in §8.4 | Iteration 0 | All 8 traversals in scope implemented as plain SQL functions; correctness proven, including multi-hop `ancestry` and governance union across two elements. **Scale not yet tested — see Open Questions.** |
| `Component provides Capability` as a many-to-many join, not containment, correctly makes "zero providers" a first-class queryable state rather than a broken tree node (R2) | Iteration 0 | Multi-provider and zero-provider capabilities both demonstrated; primary-provider uniqueness enforced and tested. |
| `buildWorkPackage(taskId, profileId)` is a pure, idempotent function of graph state | Iteration 0 | Repeated calls against an unchanged graph return the same id and hash, across independent process runs, with exactly one persisted row — conditional on the content-hash correction recorded under Invalidated. |
| Stable ID validation holds at both the application boundary and the database boundary, and the two agree | Iteration 0 | Same pattern implemented as a TS regex and a Postgres `CHECK` constraint; both independently reject the same malformed inputs. |
| The Architecture Change Proposal lifecycle (§5) closes the loop it is designed to close — a Task blocked on missing architecture reaches `ready` again with no manual database edit | Iteration 1 | End-to-end test starting from a real `buildWorkPackage` gate failure, through draft → proposed → approved → applied, to a second successful `buildWorkPackage` call. Independently reproduced over real HTTP requests against a real `http.Server`. |
| `applyProposal`'s mint + retire + succession is genuinely transactional, not just schema-shaped | Iteration 1 | PGlite's rollback-on-throw behavior verified directly against this project's driver (not assumed); a proposal with one legal and one illegal operation leaves neither element behind and the proposal's state at `approved`, not `applied`. |
| §5.6's retirement policy (refused on a live Task or active Repository reference; permitted when the same proposal supplies succession) is fully specified by its two clauses and one escape hatch | Iteration 1 | Three isolated tests, one per clause, all passing against the real schema — no additional clause needed. |
| The §3.5 no-orphan-task invariant, extracted into one shared function, agrees with itself across every caller | Iteration 1 | `assertReadyInvariants` now serves both the Iteration 0 YAML-import guard and the new lifecycle `markReady` function; all 71 tests pass with one implementation instead of two. |
| Runtime independence holds when a second adapter is built against the §12.2 port — adding it costs "one row, one class" (§12.7), for adapters with no real behavioral complexity | Iteration 2 | Three independent checks: a structural test asserting the second adapter's only import is the port; an import-surface diff against the first adapter showing zero new dependencies; `port.ts` and `registry.ts` each written once and never touched again to accommodate the second adapter. **Validated for trivial adapters only — see Unproven for the real-adapter case.** |
| The MCP grant model (§9.5) is a real enforcement boundary: an out-of-grant tool call is refused, an expired grant refuses everything | Iteration 3 | Three independent forms of evidence: an in-process test, an HTTP-driven test against a real `http.Server`, and a hand-run `curl` transcript, all reproducing the same issue-grant → succeed-in-grant → refuse-out-of-grant sequence. **Validated for direct call-target enforcement only — see Unproven for the narrower "can still learn X exists" gap.** |
| §9.5's grant-widening formula (`allowedElementIds = WP elements ∪ impactOf(components, context_depth + 1)`) is genuinely wider than the Work Package's own bound, not the same value computed twice | Iteration 3 | The seed's one-hop `comp.invoice-service dependsOn comp.payment-service` edge is present in the grant (`context_depth + 1 = 1`) but absent from the Work Package's own `impactedComponents` (`context_depth = 0`), asserted together in one test. |
| The managed-region mechanism (§10.4) genuinely distinguishes a human edit outside the markers (no false drift) from one inside (drift correctly detected) | Iteration 4 | §16's own literal acceptance bar for this work, reproduced directly: prepend/append text outside the markers → no drift, unchanged hash; mutate a value inside the markers → drift, changed hash; markers deleted entirely → drift, not a crash. |
| `render()` (§10.4) is genuinely a pure function of graph state — identical inputs produce byte-identical output | Iteration 4 | Regenerating a repository's projection and comparing every file against itself via `checkDrift` finds zero drift, achieved by sorting inputs inside `render()` rather than trusting caller order — the same discipline `buildWorkPackage`'s canonical payload already required in Iteration 0. |
| The repository bootstrap state machine (§10.1) enforces its own transition order as a real invariant, not just a `bootstrap_state` column nobody checks | Iteration 4 | Every one of the five transitions tested both legally and illegally from a non-immediate-predecessor state; `registerMapping` confirmed legal a second time once already `mapped` ("at least one," not "exactly one," per §3.6). Third independent implementation of the same typed-state-machine pattern already used for `ArchitectureChangeProposal` and `WorkItem`. |
| The `VcsProvider` port's type signature, and the bootstrap state machine built against it, require no changes to accommodate a real GitHub-backed implementation | Iteration 5 | A real, private GitHub repository was provisioned via `GhCliVcsProvider`, independently confirmed with a separate `gh repo view` call, then driven unmodified through `registerMapping → generateProjection → activateRepository` to `active`. Zero lines of `src/repository/lifecycle.ts` changed. **One real design choice was needed to keep the port's type unchanged (visibility moved to adapter configuration, not the port's input) — see Unproven.** |
| `provisionRepository`'s call-then-write sequence is safe under a real provider failure — the repository is left cleanly at `declared`, not in an inconsistent state | Iteration 5 | A genuine GitHub API failure (a real name collision, not simulated) left `bootstrap_state` at `declared`, checked directly against the database; a retry against the same repository was then confirmed legal. Closes the exact gap Iteration 4 named as its own top Unproven item. |
| Keeping Nexus's minted `id` separate from a provider's own reference (`provider_ref`) — two columns since Iteration 0 — was necessary, not merely cautious | Iteration 5 | The real repository's Nexus id and its GitHub name differed in every character but a shared timestamp suffix; GitHub raised no objection to either independently, and nothing in this iteration would have worked had the two been forced to be the same string. |
| The `AgentRuntimeAdapter` port and the runtime registration tables require no changes to accommodate a real adapter with genuine behavioral complexity, not only trivial ones | Iteration 6 | A real `ClaudeSdkAdapter` (`@anthropic-ai/claude-agent-sdk`) was driven through one real run — real streaming translation, a real in-process MCP server, real tool-call routing — with zero lines changed in `src/runtime/port.ts` or `src/runtime/registry.ts`, confirmed by `git diff`. **Validated for the translation surface this iteration actually exercised (three of six `RunEvent` kinds) — see Unproven for `ArtifactProduced`/`RunBlocked`.** |
| A grant-checked MCP tool, exposed through a real MCP server, is genuinely enforced against a real agent's real protocol calls — both a success and a refusal | Iteration 6 | A live run's `getAncestry` call on an in-grant element succeeded with real data checked at the protocol level (`toolResults`, not the agent's prose); a separate `getCapabilitiesOf` call on a deliberately out-of-grant element was refused the same way, verified against the real `GrantRefusedError` message text. **Validated for an in-process MCP server — see Unproven for whether a standalone, externally-reachable server is equivalent evidence.** |
| Reusing an already-authenticated local credential instead of requiring new credential setup, validated for a CLI wrapper in Iteration 5, generalizes to a process-spawning SDK | Iteration 6 | No `ANTHROPIC_API_KEY` was set in this environment; a probe script confirmed `@anthropic-ai/claude-agent-sdk`'s `query()` authenticates successfully on the first call using whatever this environment's `claude` CLI already has, checked before any adapter code was written. |
| A real agent run can leave behind evidence of its own execution — duration, real token counts, Work Package and grant sizes, retrieval counts — without requiring cost calculation, analytics, or a real Orchestrator to exist first | Focused enhancement after Iteration 6 (not an iteration) | One real `ClaudeSdkAdapter` run produced a real `execution.run_telemetry` row: `duration_ms` and `work_package_size_bytes` positive and real, `input_tokens`/`output_tokens`/`total_tokens` from the SDK's own result message, grant and context counts matching the real grant and Work Package exactly, `accessed_element_count` correctly excluding the refused call. Fields genuinely unmeasurable today (`work_package_size_tokens` — no tokenizer exists; `accessed_repository_count` — no repository-scoped MCP tool exists) are explicitly `null`, checked directly against the recorded row, not asserted from the code alone. |
| An in-grant `getAncestry` call can cause a real agent to disclose an out-of-grant ancestor's identity unprompted, as a side effect of ordinary, legitimate tool use — not only under adversarial prompting | Iteration 7 | One real run, task-scoped to a single in-grant component, with instructions that never mentioned ancestry, architecture, or the broader product: the agent called `getAncestry` unprompted for a legitimate reason and named the out-of-grant product ("Project Solstice," three containment levels above the grant) twice in its own final output. Checked at the protocol level, not inferred from prose. |
| Redacting an out-of-grant ancestor's `id` and `name` while preserving `kind` and `depth` is sufficient for a legitimate in-grant caller's actual use of `getAncestry`'s result | Iteration 7 | The identical real scenario, re-run after `redactOutOfGrantAncestor` (`src/mcp/tools.ts`) was added: the same real agent reached the same correct structural conclusion using only `kind`/`depth`, and no longer disclosed any redacted identity. |
| A real agent, given a genuine reason to encounter a real refusal and a standing (not per-task) instruction for how to signal it cannot proceed reliably, will follow that instruction rather than working around the gap, guessing, or reporting only unstructured prose | Iteration 8 | Two independent real runs, same scenario: the agent called `getCapabilitiesOf` on an out-of-grant component for a reason the task itself created, was genuinely refused, explained precisely why that refusal meant it could not responsibly complete the task, and ended its response with the exact `BLOCKED: context-insufficient — <note>` line `buildPrompt()`'s standing instruction specifies — different phrasing each time, not a cached response. Checked at the protocol level and against the real final text. |
| `mapMessage()` can translate a real agent's free-form final output into a structured `RunBlocked` event using a plain, exact-match textual convention, without a dedicated MCP tool for the agent to call instead | Iteration 8 | Both live runs: `events()` yielded a real `RunBlocked` (reason `context-insufficient`) as the fourth event, confirmed by inspecting the actual sequence each run produced, not assumed from hermetic fixture tests (added first) predicting the outcome. **Validated for `context-insufficient` only — `architecture-change-required` and `mapping-missing` remain unreachable with today's MCP tool catalog; see Unproven.** |
| Nexus already possesses deterministic, structured evidence sufficient to classify `context-insufficient` without agent involvement | Architecture Review (between Iteration 8 and Iteration 9, not an iteration) | Confirmed by direct code inspection, not inferred: `GrantRefusedError` (`src/mcp/grant.ts`) fires synchronously and fully typed the moment a call crosses the grant boundary; `ClaudeSdkAdapter`'s `toolResults` (Iteration 6) already records every occurrence (`isError: true`) as a side effect of existing tool-call tracking, currently unused for `RunEvent` classification. `GrantRefusedError.reason` is caught but discarded — only `.message` is used today. **This is a fact about what data exists, not a claim that backend classification has been built or found correct — see Unproven, below.** |
| `RunBlocked` (reason `context-insufficient`) can be classified deterministically from a run's accumulated `toolResults`, independent of whether the agent's own text matches the `BLOCKED:` convention | Iteration 9 | A real live run reproducing Iteration 8's own scenario, with `events()`'s classification now confirmed — by inspecting `h.toolResults` directly, not only the resulting event — to originate from the backend observation. Hermetic tests confirm the same mechanism with final text that does not contain the convention at all. **Validated for the mechanism only — see Invalidated, below, for the specific classification rule this iteration implemented.** |
| The eight named graph traversals, plus `governanceOfElements`, remain correct and fast (sub-1.1ms average per call) against a synthetic graph of realistic mid-size-organization scale (~1,350 elements, ~1,920 provisions, ~1,481 dependencies, ~304 decisions+constraints) | Iteration 10 | `investigate-graph-scale.ts`: 1,158 of 1,158 correctness checks passed against expected results computed independently in plain TypeScript, not re-derived from the SQL under test. Timed against a same-shape toy-scale baseline in the same run. **Validated for the tested scale only — see Unproven, above, for larger scale and real task shape.** |
| A backend-derived signal — the Work Package's own declared `relatedElements` field, checked against which specific element a refusal targeted — correctly distinguishes a task-blocking refusal from one the agent legitimately worked around, without any reliance on agent-authored text | Iteration 11 | Two real, live re-runs of Iteration 9's own scenarios: the relevant refusal (`comp.iter8-upstream`, declared `required: true`) correctly produces `RunBlocked`; the irrelevant refusal (`comp.iter9-related`, declared `required: false`) — the exact case Iteration 9's naive rule over-triggered on — correctly produces `RunCompleted`. Both decided by `h.toolResults`' `elementId` field, correlated from real tool calls, not from either run's prose. **Validated for a hand-populated field matching a known-correct answer — see Unproven, below, for whether Work Package generation can populate it correctly on its own.** |
| A `provide` operation, added to the existing `ArchitectureChangeProposal` mechanism and writing into the existing, unchanged `element_provision` table, closes the gap where minting a component to satisfy a missing capability left that capability unprovided after apply | Iteration 12 | A real Task blocked on `unprovided-capability` (`cap.invoice-export`) is unblocked by a single `create` + `provide` proposal, applied atomically; `unprovidedCapabilities()` (Alignment, §8.5) confirmed the capability no longer unprovided afterward, checked directly, not inferred from the proposal's own success. A second test minted both ends of the provision edge (component and capability) in the same proposal and confirmed the resulting row and `ApplyProposalResult.providedLinks` both correctly reflect it. |
| A plain, ungated HTTP read surface (discovery + review) — added without changing the existing `create`/`retire`/`provide` write shape at all — is sufficient for a real Product Owner/Architect to complete a full authoring workflow starting from only a product's name | Iteration 13 | Both a hermetic HTTP-driven test and a live investigate script (`investigate-po-authoring-workflow.ts`) independently completed discover → draft → review → approve → apply → confirm end-to-end, referencing zero hardcoded `prod.*`/`dom.*`/`subsys.*`/`comp.*`/`cap.*` id literals — only the human-readable name "Trade Platform." `operations[]`'s wire shape was not touched. |

---

## Unproven

Real, specific hypotheses still open — not restated caution. Each has a
concrete experiment a future iteration can run directly.

| Assumption | Open since | Why it's still open | What would resolve it |
|---|---|---|---|
| Curated FileAnchors (§13 Alt. A) are worth their maintenance cost and don't silently rot | Iteration 0 | One hand-authored anchor, written in the same commit as everything it describes — zero elapsed time, zero maintenance evidence. §13 is explicitly undecided in the source document. | Observe a real anchor against a real repository that changes over time (post repository-bootstrap); answer §13.4's own four questions. |
| `WorkPackageProfile.context_depth` correctly bounds `impactOf`, and the grant's `context_depth + 1` widening composes correctly on top, for depth > 0 | Iteration 0, extended Iteration 3 | The seed dataset ships exactly one profile at `context_depth: 0`; only `impactOf(..., 1)` (the grant's case) has ever been exercised. A profile at depth ≥ 1 — where the Work Package itself already includes one-hop impact and the grant would need to widen one level *further* — has never been built. | Seed a real profile at depth ≥ 1 against a component with a real multi-hop dependency chain; check both the Work Package's own impact set and the grant built from it. |
| A component served by more than one repository resolves to a *usable* Work Package, not just a mechanically correct one | Iteration 0 | Only tested against a synthetic fixture built to trigger the ambiguity branch — no real content behind either repository. | Seed a second real repository against a real component; generate a Work Package with ambiguity allowed; have a human judge the result. |
| `governanceOfElements`'s linear per-round-trip cost (~1ms/anchor, confirmed Iteration 10) is not a real problem in practice, and the traversal layer holds at a meaningfully larger scale than Iteration 10 tested | Iteration 0, resolved for ~1,350 elements Iteration 10, narrowed | Iteration 10 confirmed the cost curve (2 anchors ≈ 2ms; 80 anchors ≈ 79ms) against a synthetic task it constructed itself, not real usage; and tested one stated scale (~1,350 elements), not the true breaking point in either direction. | Measure the real distribution of capabilities-affected-per-task once real Work Packages exist at volume; re-run `investigate-graph-scale.ts` at a larger `GraphParams` scale if a concrete reason to expect it exists. |
| The in-process, direct-function-call form of `RunBlocked` / `ProposalApplied` (§2.2) will still be the right shape once a real Orchestrator (1f) exists | Iteration 1 | No event type, dispatcher, or subscription mechanism exists yet — "the event" is just which function gets called (`blockTask`, `releaseBlockedTasks`), by a test or a human today. | When 1f's Orchestrator is built, wire its `RunBlocked` handling to call these functions as real event effects; see whether the signatures survive or need reshaping around an actual event payload. |
| R-1's write-authorization boundary ("the runtime never holds a write credential") holds against a real caller, not just in the data model | Iteration 1 | The state machine enforces R-1's substance (agent-authored proposals are always `draft`; only a human principal can approve), but nothing yet distinguishes "the platform, acting on a genuine `RunBlocked` event" from "any HTTP caller" — Authentication remains out of scope. Not new, but newly testable now that a real HTTP surface exists. | Not this platform's evidence to gather until Authentication is in scope — revisit then rather than assuming the state machine alone was always sufficient. |
| `ArtifactProduced` — the one `RunEvent` kind never yet exercised against a real agent — is sufficient as shaped (`artifactRef: string`), once a real scope needs it | Iteration 2, narrowed Iteration 6, narrowed further Iteration 8 | `RunBlocked` (for `context-insufficient`) is now validated (see Validated, above), leaving `ArtifactProduced` as the only untested kind of the six. It depends on the real output path (push/branch/PR), still deferred since Iteration 4. | Build a scope that actually needs the real output path, and see whether `ArtifactProduced`'s shape suffices once something real can populate `artifactRef`. |
| A plain, exact-match textual convention for `RunBlocked` remains reliable across a wider range of real scenarios than the one Iteration 8 tested | Iteration 8 | Two real runs, one scenario, repeated — `docs/history/iteration-8/SCOPE.md` §8 named two ways this could have failed (no signal at all; a near-match the parser misses) and neither happened either time, but neither was ruled out for a differently-shaped scenario, a longer task, or a different day's model behavior; a scenario repeated twice is stronger than one run, but still not a varied sample. | Run a *different* class of scenario — different timing of the refusal within the agent's reasoning, more competing instructions, a different task shape entirely — rather than treating two runs of the identical scenario as a demonstrated pattern. |
| `architecture-change-required` and `mapping-missing` behave the same way `context-insufficient` did once they become reachable | Iteration 8 | Neither is discoverable with `getAncestry`/`getCapabilitiesOf`, the only two MCP tools this project has; `mapMessage()` has no path that produces either. Nothing in Iteration 8's evidence bears on either reason specifically. | Once Repository MCP (`mapping-missing`) or a genuine zero-providers-discoverable-mid-run scenario (`architecture-change-required`) exists, test each the same real-agent way Iteration 8 tested `context-insufficient` — not assumed to work by analogy. |
| Work Package generation, or a future PO/architect authoring tool, can populate `relatedElements` correctly for a real task — deciding which out-of-grant elements are genuinely required versus merely worth checking | Iteration 11 | Iteration 11's own two scenarios had their "correct answer" hand-authored to match what each scenario's acceptance criteria already said, the same discipline `investigate-*.ts` scripts already apply to `acceptanceCriteria` itself — nothing tests whether this judgment can be made reliably, automatically, or by a real architect. | Once a real authoring path exists (Iteration 12, incremental architecture authoring), check whether `relatedElements` populated through it — rather than hand-authored to a known-correct answer — still classifies correctly. |
| An incomplete `relatedElements` set — one that omits a genuinely necessary element — will not cause `classifyResultMessage` to misclassify a task-blocking refusal as non-blocking | Iteration 11 (discovered during `/review`, not during implementation) | Once `relatedElements` is non-empty at all, a refusal on any element it does *not* name no longer blocks by default — it falls through only to the weaker `BLOCKED:` text convention, not to an automatic block the way Iteration 9's naive "any refusal ⇒ blocked" rule did. Confirmed by reading `classifyResultMessage`'s branch structure directly, not by any live run. Both of Iteration 11's own scenarios declared exactly one "extra" out-of-grant element each, so `relatedElements` was complete by construction in both — neither tested a refusal on an element omitted from an otherwise-populated set. | Run a live scenario where `relatedElements` declares some elements but omits a genuinely required one, with a real refusal landing on the omitted element; check whether the `BLOCKED:` text fallback still catches it or the run is incorrectly classified `RunCompleted`. Directly relevant to Open Question #5 once Iteration 12's authoring path exists, since auto-derivation is exactly where incompleteness becomes likely. |
| An in-process MCP server (`createSdkMcpServer`, hosted within the same process) is equivalent evidence to a standalone, externally-reachable MCP server (§9.2–9.4) for "a real adapter can drive genuine MCP protocol calls" | Iteration 6 | Iteration 6's MCP exchange is real (real request/response framing, real tool schemas, a real `isError` path) but never crossed a process boundary — no separate MCP client/server network exchange was exercised. | Build the standalone MCP server §16 1e describes, point a real adapter's `mcpServers` config at it as an external process, and re-run the same in-grant/out-of-grant check against that boundary. |
| Every current and future MCP tool that returns graph-derived structure needs the same category of grant-result filtering `getAncestry` now has | Iteration 7 | Only one tool (`getAncestry`) has been shown to carry this risk. `getCapabilitiesOf`, this project's only other MCP tool, has no equivalent "walks past something outside the grant" shape to redact. Whether a future tool (e.g. `architecture.get_dependencies`, §9.2, still deferred) would need the same treatment is unknown until it exists and is tested the same real-agent way. | When a future MCP tool's result could plausibly traverse past a grant boundary, test it the same way Iteration 7 tested `getAncestry`: a real, narrowly-scoped, non-adversarial agent run, before assuming filtering is or is not needed. |
| A real adapter can actually use a grant to drive genuine (non-simulated) MCP protocol calls | Iteration 3 | Grant construction and enforcement are validated against direct function calls and HTTP requests written for this iteration's own tests — never against a real MCP client/server exchange, because no real MCP protocol server exists (deliberately deferred, see `docs/history/iteration-3/REPORT.md`). | Build the real MCP protocol layer (§16 1e) and the Claude SDK Adapter (§12.7) together, and check whether the grant as currently shaped is sufficient for an actual tool-call round trip. |
| Repository visibility (and by extension other per-repository provisioning choices — organization, license, gitignore template) belongs on the `VcsProvider` port's per-call input, not adapter-level configuration | Iteration 5 | `GhCliVcsProvider` took visibility as a constructor parameter, fixed once per provider instance, specifically to keep the port's type unchanged — untested against a run that needs two different visibilities through one process. | Attempt to provision two repositories with different visibility in the same run; see whether adapter-level configuration holds up or the decision needs to move onto the port's input. |
| The bootstrap mechanism's success provisioning a real repository predicts success for the rest of §10.2's flow — pushing `generateProjection`'s output, creating a branch, opening a PR | Iteration 5 | Explicitly out of scope this iteration (`docs/history/iteration-5/SCOPE.md` §4); provisioning (`gh repo create`, GitHub's REST API) and pushing content (`git` operations) are different operations against different parts of GitHub's surface, with their own untested failure modes. | Write `generateProjection`'s managed-region files to disk, commit, push a branch, and (if going as far as §10.2 step 5) open a PR against a real repository; check whether that succeeds the way provisioning did. |
| Nexus reduces context consumption and execution cost | Focused enhancement after Iteration 6 (not an iteration) | Current evidence is that execution telemetry capture exists (`execution.run_telemetry`, `src/execution/telemetry.ts`) — real token counts, durations, context and grant sizes are now recorded per run. That is evidence the platform *can* measure consumption and cost-relevant facts going forward, not evidence that it *reduces* either; a single real run's numbers are a data point, not a trend. Explicitly not classified as Validated. | Historical execution data — multiple real runs, ideally across comparable tasks with and without Nexus's grant-scoping and context-bounding in effect, compared against each other over time. Nothing this enhancement did produces that comparison by itself. |
| `architecture.change_operation`'s check constraint, now covering three operation families (`create`/`retire`/`provide`), is a sufficient guard on row shape | Iteration 12 (discovered during `/review`, not during implementation) | The constraint only asserts that a given `op`'s required fields are present — never that the other operations' fields are absent. A `provide` row could carry a non-null `mint_id` and the schema would not reject it; the same looseness already existed between `create`/`retire` and is now extended to a third column family. Harmless today only because `draftProposal` is the sole writer and is disciplined about nulling irrelevant fields — not enforced at the schema level. Deliberately left as accepted, disclosed technical debt, not fixed. | Before a fourth operation type (`depend`, or `move`/`split`/`merge`) is added: decide, deliberately, between a mutual-exclusivity check across all column groups and the discriminated `jsonb` payload the schema's own migration comments have anticipated since Iteration 1. |
| Whether capability discovery needs provider/unprovided status surfaced over HTTP before Iteration 14's UI is built, or whether the UI can synthesize it client-side from already-existing endpoints | Iteration 13 | `investigate-po-authoring-workflow.ts` found this a real, named friction point: `GET /architecture`'s listing carries no provider-status signal, so "which capabilities need a component" cannot be answered from a listing alone. The scripted workflow completed anyway, because the simulated PO already knew which capability to build against from its own backlog, the same way a real PO would — nothing tested whether a user without that prior knowledge would be equally unblocked. | Once Iteration 14's UI needs to show "which capabilities need attention," decide there whether that requires a new HTTP endpoint wrapping `unprovidedCapabilities()` (Alignment, §8.5) or can be synthesized client-side over `GET /architecture/:id/providers` calls already built. |
| `GET /architecture/:id` (single-element detail, mirroring §9.2's `architecture.get_element`) earns a permanent place in the API surface | Iteration 13 | Built as scoped, but the one real workflow this iteration tested (both the hermetic test and the live investigate script) never called it — the listing endpoint's summary shape (`id`/`kind`/`name`/`status`) was sufficient at every step, and `childIds` was never consulted below the top of the containment walk. One data point, not a verdict: a UI's dedicated element-detail view is a plausible future consumer, but that need hasn't been demonstrated either. | Revisit once Iteration 14 has a concrete detail-view screen design; keep if genuinely needed there, remove if a future review finds it dead code. |

---

## Invalidated

Assumptions that implementation proved false, and how they were corrected.
An entry here means the *original* reading was wrong — not merely
underspecified — and the correction is now load-bearing: any future
reimplementation needs to be told this directly, because re-deriving it
from the architecture documents alone is not reliable.

| Assumption (as originally read) | Since | Why it was wrong | Correction |
|---|---|---|---|
| The Work Package payload is canonicalized and hashed as one linear pipeline — build the full payload including its own generated `id`, then hash it | Iteration 0 | Self-contradictory: `id` is only known after deciding a new row is needed, which is exactly what the hash lookup decides. Hashing `id` in means every call mints a new id — idempotency becomes unreachable by construction, not just unlikely. | Hash the payload **without** `id`; attach `id` to the persisted payload only after the hash has determined whether a matching row already exists. |
| `implementationPath` (§8.4) is a literal chain of INNER JOINs following the stated arrow-path | Iteration 0 | An affected capability with zero providers, or a component with zero mapped repositories, disappears from the result set entirely instead of surfacing — so the generation gate's own precondition checks (§11.2 step 1) become structurally unobservable. | Both joins are LEFT JOINs; a missing link surfaces as a row with a null column, which the gate explicitly checks for. |
| Architecture-context code may read Work and Repository tables directly to evaluate §5.6's retirement policy, since the policy is stated as something the Architecture Change Proposal enforces | Iteration 1 | §2.3's declared dependency table lists no read dependency from Architecture to Work or Repository in either direction — only the reverse. The first implementation of `applyProposal`'s retirement check queried both directly, a real violation of a table this project treats as authoritative, not a hypothetical one. | Moved the check into `alignment.live_references()` — Alignment is declared read-only across every context (§2.1) specifically so a check like this does not have to be embedded in the context that would otherwise have to reach outside its own boundary to make it. |
| `gh repo create` supports a `--json` flag for structured output, the same way `gh repo view` does | Iteration 5 | Checked directly against `gh repo create --help` before writing any adapter code: no such flag exists for this subcommand. It prints a bare repository URL to stdout on success and nothing structured. | `extractOwnerRepo()` parses `owner/name` out of the URL with a regular expression; error classification (`mapGhError`) is necessarily stderr-text-pattern-based for the same reason. |
| Existing `gh` credentials are sufficient for the whole exercise — creation and cleanup both | Iteration 5 | Creation succeeded with the token's `repo` scope. Deletion failed: GitHub requires the separate `delete_repo` scope, which the authenticated token does not have. "Is the runtime authenticated" and "is the runtime authorized for this specific operation" are different questions. | `verify-github.ts` treats deletion failure as an expected, handled outcome, printing the manual cleanup command rather than crashing; deletion was never added to the `VcsProvider` port itself. |
| A Work Package built from just `task`/`capabilities`/`components` gives a real adapter enough to direct a specific run — implicit while writing the first version of Iteration 6's verification script, never stated as a hypothesis because it seemed too obvious to name | Iteration 6 | Two live runs showed a real agent calling the wrong component id. The cause was not the agent: `ClaudeSdkAdapter.start()`'s only inputs are `runId`/`workPackage`/`grant`, and the run-specific instructions were never passed through any of them — only console-logged. Given generic context alone, the agent reasonably inferred a target from what the Work Package *did* declare. | `buildPrompt()` now reads and includes `workPackage.acceptanceCriteria` — a real, pre-existing `WorkPackagePayload` field — verbatim; `verify-claude-adapter.ts` passes its instructions through it instead of an unused local variable. After the fix, the agent followed the exact instructions on the next two attempts. |
| §9.5 authorizes the *call*, not the result — leaving `getAncestry`'s result unfiltered was a defensible, low-risk interpretation that could reasonably be left as documented risk (Iteration 3's own reading) | Iteration 7 | The very first real, non-adversarial attempt to test this found a real leak — not a contrived edge case, an entirely ordinary task ("confirm this component's structural placement") was sufficient to trigger it on the first try, because `getAncestry` is exactly the kind of tool a legitimate task reaches for. The risk was not theoretical or requiring unlikely conditions; it was the default outcome of the agent doing its job as instructed. | `getAncestry`'s result is now filtered (`redactOutOfGrantAncestor`, `src/mcp/tools.ts`). A disclosed risk carried as Unproven is a flag to test with real evidence as soon as the tooling exists (Iteration 6's real adapter), not a permanent resting place for the concern. |
| Treating any observed grant refusal as sufficient, unconditional grounds for `RunBlocked` avoids introducing new false positives relative to the agent-reported approach | Iteration 9 | A real agent, given a task with an explicitly optional, genuinely not-required secondary check, attempted it, was refused, explicitly reasoned in its own final text that the refusal did not affect task completion, and concluded "Readiness confirmed." The backend classifier marked the run `RunBlocked` anyway — a real, demonstrated over-trigger, not a contrived edge case; the scenario required no adversarial framing. | The naive rule (`toolResults.some(r => r.isError)` ⇒ blocked) remains, now scoped explicitly to a Work Package that declares no `relatedElements` — see Validated, above (Iteration 11), for the refined rule that resolves this for a Work Package that does declare them. |
| A refined backend-derived signal could be built purely from observable runtime facts — graph proximity to the declared scope, or membership in the declared `components`/`capabilities` fields — without the Work Package declaring anything new (the two directions Iteration 9's own Report named) | Iteration 11 | `McpGrant.allowedElementIds` (`src/mcp/grant.ts`) is built as `declared ∪ impactOf(declared, context_depth + 1)` — the grant already grants everything within that graph-proximity radius, so a real refusal is, by construction, always for an element outside it. Neither a proximity-based nor a declared-membership-based signal can ever produce a positive match for a genuine refusal. Found by reading the function directly, before any code was written. | Set aside entirely, not partially fixed — Iteration 11 built declared (not inferred) relevance instead; see Validated, above. |
| No index exists on `parent_id`/`from_id`/`predecessor_id`, implying a real performance risk for `ancestry`/`impactOf`/`resolve` at scale — stated as "What We Know" in `docs/history/iteration-10/SCOPE.md` | Iteration 10 | Reading `db/migrations/0007_graph.sql` directly: all three traversals join their recursive CTE against the *leading* column of an existing composite primary key, already index-backed for free. The genuinely uncovered columns are narrower (`element_provision.capability_id`, `decision_scope.element_id`, `repository_component.component_id`), and even those show no measurable effect at the tested scale. | `investigate-graph-scale.ts` was written testing the corrected, narrower suspect list, not the original broader one; no index was added, since none was warranted by the resulting measurements. |
| `governanceOfElements`'s anchor set widens with a wide execution profile's `context_depth` (via `impactOf`), making profile width the real driver of its N-sequential-round-trips cost | Iteration 10 | Reading `src/workpackage/build.ts` directly: Step 4's `impactOf`-widened `impactedComponents` set feeds a separate field (for a future run-scoped MCP grant) and is never merged into the governance anchor set built in Step 6. The real lever is a task affecting many capabilities directly, not profile widening. | `investigate-graph-scale.ts` builds the anchor set exactly as `build.ts` does (`resolvedCapabilities ∪ resolvedComponents`, default profile) and tests both a typical single-capability task and one task deliberately affecting many capabilities directly. |
| Today's only architecture-authoring path is a one-shot bulk YAML import via `importArchitecture`, which fails if re-run against an already-populated graph — Open Question #6's original framing | Iteration 12 | Reading `src/proposal/proposal.ts` directly: `applyProposal`'s `create` operation already mints a single element into an already-populated graph, transactionally, gated by the proposal lifecycle — validated since Iteration 1. `importArchitecture`'s lack of conflict-handling is real, but it is the seed path, not the only path; the question conflated the two. | The real gap was narrower: no operation could make a newly minted element *usable* by establishing `provides`/`dependsOn`, attaching governance, or renaming it. `provide` closes the `provides` gap (see Validated, above); the rest remain named, disclosed deferrals, not rediscovered later. |

---

## Open Questions

Important unresolved issues, in priority order. These are broader than any
single row above — several draw together multiple Unproven entries into
one architectural bet.

1. **Does runtime independence hold for a *real* second adapter, not just
   two deliberately trivial ones?** Resolved favorably as of Iteration 6
   for the translation surface actually exercised — a real
   `ClaudeSdkAdapter` (§12.7) required zero changes to the port or
   registry (see Validated, above). Narrowed further as of Iteration 8:
   `RunBlocked` (for `context-insufficient`) is now validated against a
   real agent; `ArtifactProduced` is the one `RunEvent` kind that remains
   entirely untested — see Unproven, above.
2. **Should Nexus hold file-level knowledge at all?** §13 of
   `MVP_ARCHITECTURE_V2.md` is explicitly unresolved in the source
   document itself; Iteration 0 shipped Alternative A (curated
   FileAnchors) by default, not by evidence.
3. **Does `governanceOfElements`'s real round-trip cost matter in
   practice, and do the traversals hold at a meaningfully larger scale
   than tested?** Narrowed from "do the graph traversals hold up past toy
   scale" — Iteration 10 answered that directly for ~1,350 elements: yes,
   all eight traversals plus `governanceOfElements` remain correct and
   fast (see Validated, above). What survives is narrower: whether real
   tasks affect enough capabilities directly for `governanceOfElements`'s
   confirmed linear cost to matter, and whether a meaningfully larger
   scale (10x–100x) still holds — see Unproven, above.
4. **Does every mechanism validated against a no-op/fake stand-in
   (`AgentRuntimeAdapter`, the MCP protocol boundary, `VcsProvider`) hold
   once the real thing behind it exists?** All three tracked instances now
   resolved favorably for the scope each iteration actually tested:
   `VcsProvider` (Iteration 5), MCP grant direct-call-target enforcement
   (Iteration 3), and `AgentRuntimeAdapter` (Iteration 6). The *pattern*
   has run its course as originally framed — every instance attempted has
   favored the port designs, not disproven them — so this entry now
   tracks a weaker, still-live claim: each "favorable" resolution was
   narrower than a first read suggests (see the corresponding Unproven
   rows), and no fourth instance is currently scoped.
5. **Can Work Package generation, or a future authoring tool, populate
   `relatedElements` correctly for a real task?** Narrowed from "what
   backend-derived signal correctly distinguishes a task-blocking refusal
   from one the agent legitimately worked around" — Iteration 11
   answered that question directly: yes, a declared `relatedElements`
   field does, confirmed by two live re-runs of Iteration 9's own
   scenarios (see Validated, above). The question that survives is no
   longer *whether* a working signal exists, but whether the field
   feeding it can be populated correctly outside of hand-authoring a
   known answer — see Unproven, above.
6. **Is the read/discovery surface Iteration 13 added sufficient for
   Iteration 14's UI, or does it still need to expose Alignment-query
   information (e.g. which capabilities are unprovided) directly over
   HTTP?** Resolved for the core claim as of Iteration 13: a plain,
   ungated HTTP read surface (discovery + review) — `GET /architecture/:id`,
   `GET /architecture?kind=&parent=`, `GET /architecture/:id/providers`,
   `GET /proposals/:id`, `GET /proposals?state=` — added *without changing*
   the existing `create`/`retire`/`provide` write shape, was sufficient
   for a real Product Owner/Architect to complete discover → draft →
   review → approve → apply → confirm end-to-end starting from only a
   product's name (see Validated, above). What survives is narrower:
   `unprovidedCapabilities()` and similar Alignment queries remain
   CLI-only, never exposed over HTTP — a real friction point Iteration
   13's own investigation named directly (a capability listing carries no
   provider-status signal) but did not need to close, since the simulated
   PO already knew what to build from its own backlog, not from Nexus
   surfacing it. Iteration 14 (the first UI) is where this should be
   decided, from evidence of what the UI actually needs, not built
   speculatively now. A secondary, smaller thread survives alongside it,
   unchanged since Iteration 12: whether `depend` (`element_dependency`),
   Decision/Constraint attachment, or element renaming are ever actually
   needed, each deliberately left unimplemented pending a concrete scenario rather
   than built speculatively (see Unproven, `docs/history/iteration-12/LESSONS.md`).

Resolved as of Iteration 1, removed from this list: *does the Architecture
Change Proposal / unblocking flow actually close the loop it's designed to
close?* — see Validated, above.

Resolved as of Iteration 2 for the trivial case, narrowed rather than
removed: *does runtime independence hold under an actual second adapter?*
— replaced above by the real-adapter question that remains.

Resolved as of Iteration 3 for direct call-target enforcement: *is the
MCP grant model a real enforcement boundary, or only a documented
convention?* — see Validated, above.

Resolved as of Iteration 5 for the `VcsProvider` port and bootstrap state
machine specifically: *does the repository bootstrap mechanism hold once a
real `VcsProvider` exists?* — see Validated, above. Two narrower questions
survive in its place (visibility's place in the model; whether
provisioning success predicts push/branch/PR success) — see Unproven,
above.

Resolved as of Iteration 6 for the translation surface actually exercised:
*does runtime independence hold for a real, non-trivial adapter?* — see
Validated, above. Two narrower questions survive in its place (six-event
vocabulary sufficiency for `ArtifactProduced`/`RunBlocked`; in-process vs.
standalone MCP server equivalence) — see Unproven, above.

Resolved as of Iteration 7, removed from this list: *does the MCP grant
model bound what an agent can learn, not only what it can directly
query?* — the narrower information-exposure question Iteration 3 left
open. Tested against a real agent for the first time, found to leak
(Validated/Invalidated, above), and fixed (`getAncestry`'s result is now
redacted for out-of-grant ancestors). A narrower question survives in its
place — whether the same category of risk applies to any other MCP tool
— see Unproven, above.

Resolved as of Iteration 8 for `RunBlocked` (reason `context-insufficient`)
specifically: a real agent, genuinely refused, correctly signaled it via
a standing textual convention, and `mapMessage()` translated that into a
real `RunBlocked` event — see Validated, above. Narrower questions
survive in its place: whether the convention holds beyond the one
scenario tested, whether the other two `RunBlockedReason` values behave
the same way once reachable, and — unaffected by this iteration —
whether `ArtifactProduced` holds once the real output path exists. See
Unproven, above.

Resolved as of Iteration 9, narrowed rather than removed: *can
deterministic backend classification over-trigger compared to
agent-reported blockage?* — yes, confirmed by real evidence (see
Invalidated, above), replaced above by the narrower question of what
signal would not. The classification *mechanism* itself (moving
authority from agent text to backend observation) is separately
Validated and not called into question by this finding — see Validated,
above.

Resolved as of Iteration 10, narrowed rather than removed: *do the graph
traversals hold up past toy scale?* — yes, at ~1,350 elements, confirmed
by 1,158/1,158 independently-verified correctness checks and per-traversal
timing against a same-shape toy baseline (see Validated, above). Two of
this iteration's own scope document's specific technical premises — which
columns lack index coverage, and how `governanceOfElements`'s anchor set
grows — were themselves found wrong during implementation, not merely
untested (see Invalidated, above). Replaced above by the narrower
question of real task shape and larger-scale behavior.

Resolved as of Iteration 11, narrowed rather than removed: *what
backend-derived signal correctly distinguishes a task-blocking refusal
from one the agent legitimately worked around?* — a Work-Package-declared
`relatedElements` field does, confirmed by two live re-runs of Iteration
9's own scenarios (see Validated, above). Two candidate directions named
in Iteration 9's own Report, plus a third surfaced while scoping this
iteration, were found structurally incapable of ever working — not
merely unproven — before any code was written (see Invalidated, above).
Replaced above by the narrower question of whether the field can be
populated correctly outside of hand-authoring a known answer.

Resolved as of Iteration 12, narrowed rather than removed: *how would a
Product Owner or Architect grow an existing project's architecture graph
incrementally?* — the incremental write path already existed
(`applyProposal`'s `create` operation, validated since Iteration 1); the
specific, demonstrated gap it left — a minted element that could not yet
become usable — is now closed for `provides` edges via a new `provide`
operation (see Validated, above). The original framing (no incremental
path exists at all) was found wrong before any code was written, not
merely imprecise (see Invalidated, above). Replaced above by the
narrower question of whether the resulting mechanism is usable by a real
PO/architect, which is Iteration 13's own scoped territory.

Resolved as of Iteration 13, narrowed rather than removed: *is the
`create`/`retire`/`provide` mechanism usable by a real Product Owner or
Architect, given it was only reachable as raw `POST /proposals` JSON?*
— yes, confirmed both by a hermetic HTTP test and a live investigate
script, each completing a full authoring workflow starting from only a
product's name, with the write shape itself left unchanged (see
Validated, above). Replaced above by the narrower question of whether
Iteration 14's UI needs Alignment-query information (e.g.
`unprovidedCapabilities()`) exposed over HTTP directly, or can
synthesize it client-side — a real, disclosed friction point this
iteration's own investigation named but did not need to close (see
Unproven, above).

A note on numbering, added after this document's own numbered rankings
were twice quoted stale in other files' prose (`docs/history/iteration-2/`
and `iteration-3/REPORT.md`, both corrected): treat the order above as
current only as of whichever iteration most recently edited it — check
this file directly rather than trusting a number repeated elsewhere.

See the corresponding `docs/history/iteration-N/LESSONS.md` →
"Recommended next-step validation" for the smallest experiment that would
move each of these.
