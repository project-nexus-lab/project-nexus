# Iteration 5 Lessons

Not a status report (`docs/history/iteration-5/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 5 asked the second of three "does a no-op-validated abstraction
survive contact with a real implementation" questions
(`docs/PROJECT_KNOWLEDGE.md`, Open Question #5) and got a clean answer:
yes, for the `VcsProvider` port and the bootstrap state machine both — a
real GitHub repository was provisioned, driven through every remaining
state-machine step unmodified, and a genuine API failure (a name
collision) was caught cleanly with the repository left in a recoverable
state. Iteration 4's own named Unproven question — does
`provisionRepository`'s two-step sequence survive a failure the no-op
provider structurally could not produce — is now answered, directly, with
a real failure rather than a simulated one.

It also produced two honest exceptions, each precise rather than vague:
`docs/history/iteration-5/SCOPE.md`'s own assumption that `gh repo create`
would support structured `--json` output was wrong, caught before any
adapter code was written; and cleanup — creating disposable evidence and
removing it afterward — needs a different OAuth scope than creation does,
which the currently-authenticated credential does not have. Neither
required an architecture change. Both are recorded as what they are,
not smoothed into "everything worked."

---

## Validated

### Assumption

The `VcsProvider` port's type signature, and the bootstrap state machine
built against it in Iteration 4, require no changes to accommodate a real
GitHub-backed implementation.

### Status

VALIDATED

### Evidence

`GhCliVcsProvider implements VcsProvider` with the exact interface
Iteration 4 shipped (`create(input: {name, defaultBranch}):
Promise<{providerRef}>`). `src/repository/lifecycle.ts` was not edited at
all this iteration — checked directly (zero diff on that file), not
claimed from intention. A real, private GitHub repository
(`ketilaa/nexus-iter5-validation-1789041699868`) was provisioned,
independently confirmed via a separate `gh repo view --json` call (not
just trusting the adapter's own return value), and driven through
`registerMapping → generateProjection → activateRepository` to `active`.

### Consequence

The second of three "real X" questions this project has been tracking
since Iteration 2 is now answered for its narrowest, most literal form:
the port interface itself. See Unproven, below, for a related but
genuinely distinct question this does not answer.

---

### Assumption

`provisionRepository`'s two-step sequence (call the provider, then write
`provider_ref` and `bootstrap_state`) is safe when the provider call
fails partway — Iteration 4's own named Unproven question, since
`NoopVcsProvider` cannot fail and had never exercised this.

### Status

VALIDATED

### Evidence

A genuine GitHub API failure (attempting to create a second repository
with a name already in use) was triggered deliberately. The repository's
`bootstrap_state` was checked directly against the database afterward and
found still at `declared` — not silently advanced, not left ambiguous.
A second `provisionRepository` call against the same still-`declared`
repository was then confirmed legal (not refused by
`IllegalRepositoryTransitionError`), meaning a failed provisioning attempt
does not permanently strand a repository.

### Consequence

This closes the specific gap `docs/history/iteration-4/LESSONS.md` named
as its own top Unproven item. The state machine's simplicity — one
`bootstrap_state` column, no intermediate "provisioning-failed" state —
turns out to be sufficient, at least for this one real failure mode. A
failed `create()` call simply never reaches the line that would have
written `provisioned`.

---

### Assumption

Keeping Nexus's minted `id` (`repo.<slug>`) and the real provider's own
reference (`provider_ref`) as two separate columns — a decision made in
Iteration 0's original schema, before any real provider existed to need
it — was necessary, not merely cautious design.

### Status

VALIDATED

### Evidence

The real repository's Nexus id (`repo.iter5-validation-<timestamp>`) and
its GitHub name (`nexus-iter5-validation-<timestamp>`) differ in every
character before the shared timestamp suffix. GitHub raised no objection
to either string on its own, but nothing about this iteration's design
would have worked if `id` and `provider_ref` had been forced to be the
same value at the schema level.

### Consequence

A concrete, positive data point for a specific piece of early design
foresight — worth recording precisely because it is easy to credit
architectural instinct after the fact for something that just happened
not to matter; here it demonstrably did.

---

## Invalidated

### Assumption

`gh repo create` supports a `--json` flag for structured output, the same
way `gh repo view` and several other `gh` subcommands do.

### Status

INVALIDATED

### Evidence

`docs/history/iteration-5/SCOPE.md` §5 stated this directly, reasoning
from `gh repo view`'s known `--json` support to an assumption about
`gh repo create`. Checked directly against `gh repo create --help` before
writing `GhCliVcsProvider`: no `--json` flag exists for this subcommand.
It prints a bare repository URL to stdout on success and nothing
structured.

### Resolution

`extractOwnerRepo()` parses `owner/name` out of the URL with a regular
expression instead. Error classification (`mapGhError`) is necessarily
stderr-text-pattern-based for the same reason — there is no structured
error field to check instead.

### Consequence

A narrow, single-subcommand correction — not evidence against the `gh`
CLI adapter choice generally (§5's comparison against a REST or SDK
adapter reasoned about failure-mode visibility and complexity, not about
which specific flags exist), but a concrete reminder that "another
command in the same CLI supports X" is not evidence that this command
does. Worth generalizing: check the actual interface being used, not a
sibling of it, before relying on a capability.

---

### Assumption

`docs/history/iteration-5/SCOPE.md`'s framing — "Authentication may rely
on existing `gh` credentials" — implied the existing credential would be
sufficient for the whole exercise, creation and cleanup both.

### Status

INVALIDATED

### Evidence

Repository creation succeeded with the currently-authenticated token's
`repo` scope. Repository deletion failed with `HTTP 403: Must have admin
rights to Repository... This API operation needs the "delete_repo"
scope` — checked directly against `gh repo delete --help`'s own
documentation before running anything ("Deletion requires authorization
with the `delete_repo` scope"), then confirmed live. GitHub's own
permission model treats repository creation and repository deletion as
requiring different grants; "existing credentials" was not one uniform
thing.

### Resolution

`verify-github.ts` treats deletion failure as an expected, handled
outcome — it prints the exact manual cleanup command and the `gh auth
refresh` command that would grant the missing scope for next time, rather
than crashing or silently leaving an unexplained repository. The
`VcsProvider` port itself was not changed; deletion was never part of it
(§10.2 does not describe deletion as part of the bootstrap flow).

### Consequence

"Reuse existing credentials" is not a single yes/no fact about an
authenticated session — it is a per-operation fact about scopes, and
different operations against the same provider can need different ones.
Worth carrying forward to any future real-adapter work (the Claude SDK
Adapter, real MCP protocol integration): "is the runtime authenticated"
is a necessary check, not a sufficient one for "is the runtime
authorized for this specific operation."

---

## Unproven

### Assumption

Repository visibility (and, by extension, other real per-repository
provisioning choices — organization ownership, license, gitignore
template) belongs on the `VcsProvider` port's per-call input rather than
as adapter-level configuration.

### Why It Remains Unproven

`GhCliVcsProvider` took the simplest path available for this iteration:
visibility is a constructor parameter, fixed once per provider instance,
not part of `create()`'s input. This made the port's type signature
genuinely unchanged, but it also means provisioning repositories with
different visibility through one running process currently needs
multiple provider instances, not a per-call decision — and nothing has
tested whether that limitation matters in practice, because this
iteration only ever provisioned one repository.

### How To Validate

Attempt to provision two repositories with different visibility
requirements in the same run (or against the same live `VcsProvider`
instance) and see whether adapter-level configuration is actually
workable, or whether the decision needs to move onto the port's input —
which would be a real, if small, port change, unlike anything this
iteration needed.

---

### Assumption

The bootstrap mechanism's success against a real `VcsProvider`'s
*provisioning* step predicts success for the rest of §10.2's flow —
pushing `generateProjection`'s output to the real repository, creating a
real branch, opening a real PR.

### Why It Remains Unproven

Nothing this iteration did touches that path; it was explicitly out of
scope in `docs/history/iteration-5/SCOPE.md` §4, and stays out of scope
here. Provisioning a repository and writing files into it (via `git`
operations, not the GitHub API `gh repo create` uses) are different
operations against different parts of GitHub's surface, with their own
distinct failure modes not exercised by anything in this iteration.

### How To Validate

A future iteration would need to actually write `generateProjection`'s
managed-region files to disk, commit them, push a branch, and — if going
as far as §10.2 step 5 describes — open a PR, then check whether that
succeeds against a real repository the same way provisioning did. Not
designed here.

---

## Biggest Surprise

Not a bug this time, and worth naming precisely because every previous
iteration's "biggest surprise" was one. Iterations 1, 2, and 4 each found
something concrete broken — a real Domain Integrity violation, a
structural test with a regex bug, a test-fixture collision against a real
database constraint — caught by a review pass or the database itself.
This iteration's live run against real GitHub passed every check on the
first attempt, with the single exception (`delete_repo` scope) already
anticipated and handled gracefully by the script's own design before it
ran, not discovered as a surprise afterward.

Worth resisting the temptation to read this as "this iteration was less
rigorous" — the two Invalidated findings above (`--json`, credential
scope) were both caught *before* the live run, by checking `--help`
output directly against assumptions rather than trusting them, the same
discipline that caught real problems in every prior iteration. The
difference this time is that checking early meant nothing broke live, not
that nothing was checked. That is itself worth recording as a distinct,
positive shape of outcome: the "check before trusting" discipline this
project has practiced since Iteration 0 does not only catch bugs after
the fact — applied early enough, in this case it prevented them.

---

## Final Verdict

**What does Project Nexus now know?** That the `VcsProvider` port and the
bootstrap state machine both survive contact with a real GitHub
implementation, unmodified — checked against an actual repository, an
actual API failure, and an actual retry, not simulated versions of any of
the three. That `provisionRepository`'s two-step sequence is safe under
real failure, closing Iteration 4's own named open question. That the
Iteration 0 decision to separate Nexus's own id from a provider's
reference was necessary, demonstrated rather than merely defended. That
"existing credentials are sufficient" is not one fact but several,
scope-by-scope, and that this project's habit of checking a claim against
its actual source (`--help` output, not a sibling command's behavior)
caught both wrong assumptions before they became live failures.

**What does Project Nexus still only believe?** That visibility's current
home — adapter configuration, not port input — is the right one; that
provisioning success predicts anything about pushing real content,
branches, or PRs to a real repository; everything else in
`docs/PROJECT_KNOWLEDGE.md` untouched by this iteration, including the
still-fully-open real Claude SDK Adapter and real MCP protocol questions.

**What architectural bets remain highest risk?** Unchanged from
`docs/history/iteration-5/SCOPE.md` §9's own ranking, written before this
iteration ran: the real Claude SDK Adapter question, open since Iteration
2, remains the single highest-value open experiment in the project,
untouched by anything resolved here.
