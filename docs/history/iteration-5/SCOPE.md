# Iteration 5 Scope — Real GitHub-backed VcsProvider

This is a scope document, not a report. Nothing described here has been
built. Per `docs/REVIEW_PRINCIPLES.md`'s Change Acceptance Rule, the five
reviewers were applied to the scope decision itself before it was
finalized — their findings are woven into §4 and §5 below rather than
listed separately, since none of them produced a standalone finding large
enough to warrant its own section; each is named at the point it shaped a
decision.

---

# 1. Question Under Test

**Does the `VcsProvider` port (§10.2), validated in Iteration 4 against
`NoopVcsProvider`, correctly abstract over a real Git hosting provider —
without requiring the port interface or the bootstrap state machine
(`src/repository/lifecycle.ts`) to change — and does it correctly surface
the failure modes a real provider produces that a no-op provider
structurally cannot (name collisions, authentication failure, network
failure, partial-step failure)?**

Deliberately not stated as "add GitHub support" or "let Nexus create real
repositories." Those are features. The claim under test is narrower and
harder to satisfy: that the *abstraction boundary* drawn in Iteration 4 —
one `create()` method, one result shape, errors the state machine can
react to — was drawn in the right place, evidenced by a real
implementation needing to add nothing to it. This is the second of three
instances of `docs/PROJECT_KNOWLEDGE.md`'s Open Question #5 ("does every
no-op-validated mechanism survive contact with the real thing") to be
tested; the first (`AgentRuntimeAdapter`, Iteration 2) remains open, this
one is next, `AgentRuntimeAdapter`'s real case and a real MCP protocol
server remain for later iterations not designed here.

---

# 2. What We Know

From `docs/PROJECT_KNOWLEDGE.md` (Validated) and
`docs/history/iteration-4/{REPORT,LESSONS}.md`:

- The bootstrap state machine (`declared → provisioned → mapped →
  bootstrapped → active`) enforces its own transition order as a real,
  tested invariant — the third independent implementation of the same
  typed-state-machine pattern already proven for `ArchitectureChangeProposal`
  and `WorkItem`.
- `render()` is a genuinely pure function of graph state, and the
  managed-region mechanism correctly distinguishes an edit outside the
  markers from one inside — §16's own acceptance bar for this area,
  directly reproduced.
- The "port + no-op stand-in, validate before real integration" sequencing
  has succeeded exactly this way twice already: `AgentRuntimeAdapter`
  (Iteration 2 — validated for trivial adapters, real-adapter case still
  open) and MCP grant enforcement (Iteration 3 — validated for
  direct-call-target enforcement, real-protocol case still open). This is
  the third application of the same sequencing, not a new idea.
- The `VcsProvider` port itself is small and precisely bounded: one
  method, `create(input: {name, defaultBranch}): Promise<{providerRef}>`.
  `provisionRepository` is the only caller.
- The schema already separates Nexus's own minted `id` (`repo.<slug>`,
  format-checked) from `provider_ref` (free text, "owner/name, null until
  provisioned") — two different columns, since Iteration 0's original
  migration. This was foresight, not something Iteration 4 added: the
  schema already assumed a real provider's naming would not necessarily
  match Nexus's own slug convention, years before this iteration needed
  to know that.
- `docs/history/iteration-4/LESSONS.md` names the exact gap this iteration
  exists to close: `NoopVcsProvider.create()` cannot fail partway through
  a step, so the state machine has never been driven against a provider
  that can.

---

# 3. What We Only Believe

Concrete, specific, each with a stated reason it is not yet known:

1. **That `{name, defaultBranch}` is a sufficient `create()` input to
   provision a real repository.** A real `gh repo create` call needs at
   least a visibility flag (public/private) the port does not currently
   carry; whether that is the *only* missing field, or a sign the input
   shape needs to grow further, is unknown until attempted.
2. **That `provisionRepository`'s two-step sequence — call the provider,
   then write `provider_ref` and `bootstrap_state` — is safe against a
   crash or failure between those two steps.** `NoopVcsProvider` cannot
   fail, so this has never been exercised. A real provider can succeed at
   creating the repository and still have the local process fail before
   the database write commits, leaving a real GitHub repository with no
   Nexus record of it.
3. **That GitHub's own repository-naming rules accept `repo.<slug>`-derived
   names without modification.** Untested — GitHub repository names have
   their own constraints (character set, length) that have never been
   checked against what this project's `id`/`name` fields can produce.
4. **That reusing `gh`'s already-stored credentials is sufficient** — that
   no credential state needs to exist inside Nexus at all. Believed
   because the user's own stated constraints assume it, not because it has
   been checked against this project's actual invocation pattern
   (`child_process`, not an interactive terminal `gh` was authenticated
   from).
5. **That a `providerRef` shaped as a bare string (`"owner/name"`) is
   sufficient** for whatever a future iteration eventually does with it
   (pushing a branch, opening a PR) — untested, since nothing yet consumes
   `provider_ref` past storing it.

---

# 4. Recommended Iteration 5 Scope

**One real `VcsProvider` implementation, exercising exactly the one port
method that exists, against one real, disposable GitHub repository.**

1. `GhCliVcsProvider implements VcsProvider` — `src/repository/vcs-provider.ts`
   (or a sibling file in the same module; not a new bounded context).
   Shells out to `gh repo create` (Node's `child_process`, no new npm
   dependency — see §5). Parses `gh`'s own `--json` structured output
   rather than free text, to keep parsing simple and reasonably resilient
   to `gh` version drift.
2. **Real error mapping**, not a passthrough of whatever `child_process`
   throws. At minimum: name-already-exists, `gh` not authenticated, `gh`
   not installed, network failure — each mapped to a distinguishable,
   typed condition the caller (and a test) can assert on. This is the
   actual point of the iteration; the happy path alone would not test the
   claim under §1.
3. **Drive the existing state machine, unmodified, against this
   provider** for exactly one real repository: `declareRepository →
   provisionRepository(GhCliVcsProvider) → registerMapping →
   generateProjection → activateRepository`. `registerMapping`,
   `generateProjection`, and `activateRepository` do not call
   `VcsProvider` at all (confirmed by re-reading `lifecycle.ts` — only
   `provisionRepository` does) and are expected to need zero changes;
   this is stated as a testable claim, not assumed.
4. **One deliberately-triggered failure**, exercising point 2 of §3 above
   directly: attempt to provision a repository whose name is guaranteed to
   collide (create it twice, or against a name already used), and assert
   the repository's `bootstrap_state` is *still* `declared` afterward —
   not silently advanced, not left ambiguous.
5. **Cleanup.** The real repository created for this validation is deleted
   (`gh repo delete`) after the run. Nothing permanent is left on the
   developer's GitHub account — this is architectural validation, not a
   fixture to keep around, per the user's own stated framing.
6. **Kept outside the normal `npm test` run.** Every test in this
   project's suite to date is hermetic — no network, no external
   credentials, PGlite only. A test that requires real `gh` auth and
   creates a real external resource breaking that property for the whole
   suite would be a bigger, uninvited change than this iteration's actual
   question warrants (Simplicity Reviewer: this is solving a problem
   `npm test`'s existing design doesn't have). Scoped instead as a
   separate, explicitly-invoked script (e.g. `npm run verify:github`, not
   wired into `npm test`), consistent with `src/cli/verify.ts` already
   being a narrated, separately-run demonstration rather than part of the
   automated suite.

**Not in scope:** pushing `generateProjection`'s output to the real
repository, creating a real branch, opening a real PR. §10.2 step 5's "PR
opened" was already deferred in Iteration 4 and stays deferred here — that
is a different, larger claim ("does the full pipeline survive contact
with a real repo") than this iteration's narrower one ("does the
provisioning step, and the port around it, survive contact"). Domain
Integrity Reviewer: conflating the two would blur what evidence actually
answers §1.

---

# 5. Proposed VcsProvider Design

### A. `gh` CLI adapter (shell out via `child_process`)

- **Learning value: high.** Exercises real process invocation, real
  GitHub-side validation and error responses, and forces the error-mapping
  design that is the actual point of this iteration. Directly uses the
  credential reuse the user's constraints already grant.
- **Implementation complexity: low.** No new npm dependency. `gh`'s
  `--json` flag gives structured, parseable output for most commands,
  avoiding hand-rolled text parsing.
- **Architectural risk: low–medium.** Depends on an external binary being
  installed and authenticated — an operational precondition already
  assumed by the user's constraints ("GitHub already available," "gh CLI
  may be used"), not a new code dependency. Output-shape drift across `gh`
  versions is a real but bounded risk, and itself becomes evidence (see
  §8) rather than a blocker.
- **Constitutional alignment: high.** `docs/NEXUS_CONSTITUTION.md`:
  "GitHub → Review and merge governance"; Nexus asks GitHub to do one
  thing and owns none of GitHub's own concerns (auth, API versioning).
  Matches exactly how `AgentRuntimeAdapter` isolates vendor-specific code
  to one small adapter (§12.7's "the only runtime-aware code in the
  system").

### B. GitHub REST API adapter (direct HTTPS calls)

- **Learning value: medium.** Tests a different failure surface (HTTP
  status codes, JSON error bodies) but produces conceptually similar
  evidence to A for this iteration's actual question. Lower net-new
  learning, since this project's own `src/http/` layer already exercises
  "call an HTTP API, map its errors" as a pattern.
- **Implementation complexity: medium.** Still needs a credential —
  either a separately-managed token (breaking "rely on existing gh
  credentials") or shelling out to `gh auth token` anyway, which means
  depending on `gh` *and* hand-rolling HTTP calls: two integration points
  where option A needs one.
- **Architectural risk: medium.** GitHub's REST error schema must be
  learned and handled directly; more surface area than a single CLI
  command's exit code and JSON output.
- **Constitutional alignment: medium.** Not a violation of anything, but
  solves a harder version of this iteration's problem than the user's own
  stated constraints call for.

### C. GitHub SDK adapter (e.g. Octokit)

- **Learning value: low–medium, and arguably counter-productive here.** A
  mature SDK abstracts away exactly the raw failure-mode detail (HTTP
  errors, retries) this iteration exists to observe — using it risks
  testing "does Octokit work" (already well-established) rather than
  "does this project's own port design survive reality."
- **Implementation complexity: medium.** A new dependency, plus its own
  token-based auth model — the same credential problem as B.
  Disproportionate for exercising a single `create-repository` call.
- **Architectural risk: low technically, medium for this project's own
  discipline** — a new external dependency for one API call is exactly
  the kind of thing `CLAUDE.md`'s Simplicity Reviewer exists to question
  ("is this solving a current problem or a hypothetical future one?").
- **Constitutional alignment: medium.** Not disqualifying, but works
  against "prefer simplicity over completeness" and "prefer direct
  evidence over architectural elegance," both explicitly asked for.

### Recommendation: **A, the `gh` CLI adapter.**

Highest learning value per unit of complexity; zero new dependencies;
directly uses the credential path the user's own constraints sanction;
keeps the adapter itself small enough (spawn a process, parse `--json`
output, map errors) that the *state machine* — not the adapter — stays
the center of what is being tested. Evidence Reviewer: this is also the
option most likely to actually produce a clean failure-mode signal rather
than one buried inside an SDK's own retry/abstraction logic — the failure
modes are exactly what §1 asks about.

---

# 6. Acceptance Criteria

Success or failure must be stated precisely enough that "did the
abstraction survive contact" has one answer, not an impression:

1. **`VcsProvider` (`src/repository/vcs-provider.ts`) requires zero
   interface changes.** If it does need a change (e.g. a `visibility`
   field), that is not a failure of this iteration — it is the answer to
   §1, and must be recorded as precisely as a pass: what changed, why,
   and what in `NoopVcsProvider`'s original design didn't anticipate it.
2. **`src/repository/lifecycle.ts` requires zero changes.**
   `declareRepository`, `registerMapping`, `generateProjection`,
   `activateRepository` are driven against `GhCliVcsProvider` with no
   edits to their code — only `provisionRepository`'s injected provider
   changes.
3. **One real repository is provisioned successfully** —
   `bootstrap_state` reaches `provisioned`, `provider_ref` holds a real
   `owner/name`, verified by an independent `gh repo view` call, not only
   by Nexus's own database row.
4. **One deliberately-triggered failure is caught as a typed, distinguishable
   condition**, not an unhandled exception, and leaves `bootstrap_state`
   at `declared` — verified by querying the database directly after the
   failed call, not inferred from the call simply having thrown.
5. **The real repository is deleted after the run**, verified by a
   `gh repo view` call failing afterward — cleanup is part of the
   acceptance bar, not an afterthought.
6. **No change to `npm test`'s hermetic, offline property.** The new
   real-GitHub test path is confirmed to run only when explicitly invoked,
   and `npm test` is confirmed to still pass with zero network access.

If (1) or (2) requires a change, Iteration 5 is still complete and still
successful *as an experiment* — the acceptance bar is about producing a
precise answer, not about the answer being "yes."

---

# 7. Explicit Deferrals

- **GitHub App support** — not required. A GitHub App exists to support
  multi-installation, webhook-driven, permission-scoped access; nothing
  about testing one port's `create()` method needs that. No constitutional
  principle requires it either — the Constitution's "GitHub → Review and
  merge governance" is satisfied by the CLI path.
- **OAuth flows** — not required. `gh` already owns its own OAuth-derived
  credential storage; Nexus does not need to implement, store, or
  understand an OAuth flow to reuse it. Constitutionally preferable:
  Nexus owning no credential state at all is the *more* aligned choice,
  not a shortcut around one.
- **Multi-user support** — not required. The user's stated assumption
  (single developer) is load-bearing here: nothing in the port or state
  machine models "whose credentials" today, and this iteration does not
  need to introduce that concept to answer §1.
- **Permission management** — not required. Repository-level GitHub
  permissions (push access, branch protection) are unrelated to whether
  Nexus can provision a repository at all; RBAC is already deferred
  platform-wide (§15) and this iteration does not reopen that.
- **Real CI integration** — not required. `.github/workflows/nexus-alignment.yml`
  is already generated (Iteration 4) but never pushed or executed; making
  it actually run is a distinct, larger claim (does the alignment-verify
  endpoint work against a live webhook) that this iteration's scope
  explicitly excludes (§4: no push, no branch, no PR).
- **Real PR review workflows** — not required, for the same reason: no
  branch is pushed, no PR exists yet to review.
- **Repository synchronization** — not required. Keeping Nexus and a live
  repository in sync over time is the FileAnchor-maintenance-over-real-time
  question already open since Iteration 0; it needs elapsed time no matter
  what is built now, and this iteration's single create-then-delete cycle
  does not produce that evidence regardless.
- **Advanced repository templates** — not required. `gh repo create`
  supports `--template`, but using one is unrelated to testing
  provisioning and error-handling; a bare repository is sufficient
  evidence for §1.

---

# 8. Evidence Plan

**What would validate the abstraction:** all six acceptance criteria in
§6 pass as stated — zero port changes, zero state-machine changes, a real
repository successfully provisioned and verified, a real failure cleanly
caught and left in a recoverable state, cleanup confirmed, hermetic
`npm test` unaffected.

**What would invalidate the abstraction** (each is a specific, checkable
outcome, not a vague "something goes wrong"):

- The port's `create()` input needs a new required field (most likely:
  visibility) to make a real repository at all — meaning
  `VcsProviderCreateInput` as shaped in Iteration 4 was incomplete, not
  merely unused-by-the-no-op-case.
- A failed `provisionRepository` call leaves inconsistent state — either a
  real GitHub repository exists with no matching Nexus row, or Nexus
  advances `bootstrap_state` past `declared` despite the provider call
  failing. Either means the two-step "call provider, then write" sequence
  is not safe as currently written and needs a real transactional or
  compensating fix, not just better error messages.
- `gh`'s structured output changes shape in a way the adapter cannot
  parse — evidence that a CLI's output contract is less stable than
  assumed, worth recording even though it says more about `gh` than about
  this project's own design.

**What would require an architecture change, not just an iteration-5 code
fix:**

- If GitHub's repository-naming rules reject what this project's `id`/`name`
  fields can produce, and no simple transformation resolves it, that is a
  finding about the `repo.<slug>` authored-ID convention meeting an
  external system's constraints for the first time — the first time any
  ID in this project has had to satisfy a naming rule it doesn't itself
  own. Worth recording precisely even if a workaround (deriving
  `provider_ref`'s name differently from `id`) resolves it without
  touching the ID scheme itself.
- If provisioning cannot be made safely resumable after a partial failure
  without introducing a new intermediate state (e.g. a
  `provisioning-failed` value, or a compensating "did GitHub actually
  create this" reconciliation step), that is a real schema-level
  question, not an adapter-level one — the state machine's five values
  may turn out not to be enough.

---

# 9. Iteration Risk Assessment

Ranked by evidence value of resolving each next, not by size of the
feature gap:

1. **Runtime independence for a real adapter (Claude SDK, §12.7) remains
   fully open** — the oldest of the three "real X" questions (since
   Iteration 2), and the one most directly tied to the Constitution's own
   top-line principle (Agent Independence). Resolving Iteration 5 does not
   move this at all; it remains the single highest-value open experiment
   in the project regardless of Iteration 5's outcome.
2. **Whether `provisionRepository`'s two-step sequence is safe under
   partial failure is currently a hypothesis Iteration 5 is specifically
   designed to test — but if it invalidates, the fix is unscoped.** A
   "yes it needs a transactional/compensating mechanism" finding from §8
   would itself become the next highest risk, larger than anything else
   on this list, and is not designed here per the constraint against
   designing Iteration 6.
3. **The disclosed YAML-import-bypasses-the-state-machine tension
   (Iteration 4) grows sharper, not smaller, once real repositories can
   exist.** Once it's possible for a Nexus row to correspond to nothing
   real (import path) *or* for real provisioning to leave inconsistent
   state (risk #2), the two gaps compound: there would be two independent
   ways for Nexus's repository records to disagree with reality, not one.
4. **MCP grant enforcement against a real protocol server remains open**
   (Iteration 3), unaffected by Iteration 5 either way — included for
   completeness of the "real X" pattern, ranked below 1–3 because nothing
   about repository bootstrap touches it.
5. **Repository-resolution ambiguity and FileAnchor maintenance-over-time
   remain blocked on elapsed time and real usage**, not on any decision
   Iteration 5 or a near-future iteration could make faster. Lowest
   ranked not because they matter least architecturally, but because no
   amount of additional building moves them — they need to be *observed*,
   not implemented.
