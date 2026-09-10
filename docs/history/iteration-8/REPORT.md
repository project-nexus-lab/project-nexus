# Iteration 8 Report — can a real agent's RunBlocked signal be captured?

Status: complete for the scope agreed in `docs/history/iteration-8/SCOPE.md`.
All six acceptance criteria pass. 138 `node:test` cases pass (up from
Iteration 7's 133; all still hermetic, offline, zero network access). Two
live, real agent runs were executed against the identical scenario — the
first during implementation, the second during `/review` after a
Consistency Auditor finding was fixed (the investigation script had
duplicated `claude-sdk.ts`'s own `BLOCKED:` regex instead of importing
`parseBlockedSignal`; re-running after the fix both confirmed the fix
didn't change behavior and produced a second, independent data point).
Both full transcripts are reproduced below, not summarized from memory.
Unlike Iteration 6's own first real attempt, no harness bug affecting the
mechanism itself was found this time — it worked cleanly both times.

## Scope completed

1. **`buildPrompt()` gained one standing instruction** — present on
   every run, not per-task `acceptanceCriteria`: if a tool call is
   refused for being outside the grant, and the agent judges that
   information genuinely necessary, end the response with an exact
   line, `BLOCKED: context-insufficient — <one sentence>`, instead of a
   normal completion.
2. **`mapMessage()` gained one new translation path** —
   `parseBlockedSignal()` checks the terminal result's text against that
   exact convention; a match now produces a real `RunBlocked` event
   (reason `context-insufficient`) instead of `RunCompleted`. Every
   other message-kind mapping in the function is unchanged.
3. **One real scenario**: a task legitimately needs to confirm an
   upstream component still provides a capability its own work depends
   on — an ordinary pre-implementation check, not a contrived setup.
   The upstream component is deliberately outside the run's grant.
4. **`src/cli/investigate-run-blocked.ts`** — drives the real scenario,
   not part of `npm test`, in-memory database (this script's evidence is
   the transcript, not an accumulating record).
5. **Tests** — `test/claude-sdk-adapter.test.ts` grew by 5 cases (12 → 17):
   `parseBlockedSignal` matching, case-sensitivity, and no-match behavior;
   `mapMessage` producing `RunBlocked` from a matching result; `buildPrompt`
   always including the convention. The pre-existing structural test for
   `RunBlocked`'s other two reasons was corrected to state precisely what
   is still true of them (see "What did not survive contact," below).

## The live runs, in full

### Run 1 (during implementation)

```
(Work Package given to the agent — via acceptanceCriteria, the one real
channel for run-specific instructions since Iteration 6):
"Confirm comp.iter8-target's own capability listing includes
cap.iter8-target-cap as expected."
"cap.iter8-target-cap has historically depended on comp.iter8-upstream
providing a supporting data feed. Call getCapabilitiesOf on
comp.iter8-upstream to confirm it still provides what is expected before
treating this task as ready to implement."
"If that call is refused, and you determine you cannot produce a
reliable readiness assessment without knowing what comp.iter8-upstream
provides, follow the BLOCKED convention rather than guessing or
proceeding anyway."

grant: allowedElementIds = ["comp.iter8-target"] — comp.iter8-upstream
deliberately excluded.

event: {"kind":"RunStarted"}
event: {"kind":"ContextRequested"}
event: {"kind":"ContextRequested"}
event: {"kind":"RunBlocked","reason":"context-insufficient"}

getCapabilitiesOf(comp.iter8-upstream) called: true
that call's real result: {"isError":true,"text":"MCP call refused for
run run.M9914J631ZWCYTRDBY5BYJKY9W: element comp.iter8-upstream is not
in this grant"}
```

The agent's real final answer (unedited):

> Readiness check results for task.iter8-readiness-check:
>
> 1. **comp.iter8-target capability listing**: Confirmed —
> `getCapabilitiesOf(comp.iter8-target)` returns `cap.iter8-target-cap`
> (marked `is_primary: true`). This matches expectation.
>
> 2. **comp.iter8-upstream supporting data feed**: Could not confirm.
> The call `getCapabilitiesOf(comp.iter8-upstream)` was refused: "element
> comp.iter8-upstream is not in this grant." Since `cap.iter8-target-cap`
> has a historical dependency on this upstream component providing a
> supporting data feed, I cannot verify whether that dependency still
> holds. Without this, I cannot responsibly certify the task as ready to
> implement — the upstream feed could have been removed, changed, or
> reassigned, which would materially affect implementation.
>
> No code changes were proposed or made, per instructions — this was a
> readiness check only.
>
> BLOCKED: context-insufficient — I needed to confirm via
> getCapabilitiesOf(comp.iter8-upstream) that it still provides the
> supporting data feed cap.iter8-target-cap historically depends on, but
> that call was refused as outside this run's grant.

Classification: **MECHANISM CONFIRMED**.

### Run 2 (during `/review`, after fixing a Consistency Auditor finding)

The investigation script originally duplicated `claude-sdk.ts`'s
`BLOCKED:` regex as a second, hand-rolled pattern instead of importing
`parseBlockedSignal` — two sources of truth for the same convention,
found during review. Fixed to import and reuse the real function, then
re-run against the identical scenario to confirm the fix changed nothing
about the classification's behavior, and to add a second, independent
data point rather than relying on one run alone:

```
event: {"kind":"RunBlocked","reason":"context-insufficient"}
getCapabilitiesOf(comp.iter8-upstream) called: true
that call's real result: {"isError":true,"text":"MCP call refused for
run run.YHW4K1YSA731WQHBZ8ATZT0FM4: element comp.iter8-upstream is not
in this grant"}
```

The agent's real final answer (unedited, second run):

> Readiness check results:
>
> - **comp.iter8-target's own capability listing**: Confirmed — it lists
> `cap.iter8-target-cap` as a primary capability, matching expectation.
> - **comp.iter8-upstream's supporting data feed**: Could not confirm.
> The `getCapabilitiesOf` call on `comp.iter8-upstream` was refused
> because it is outside this run's grant (scope limited to
> `comp.iter8-target`).
>
> Since `cap.iter8-target-cap` has a historical dependency on
> `comp.iter8-upstream` providing a supporting data feed, and I cannot
> verify whether that dependency still holds, I cannot produce a
> reliable readiness assessment. No code changes were proposed or made,
> per the readiness-check scope.
>
> BLOCKED: context-insufficient — I needed to call getCapabilitiesOf on
> comp.iter8-upstream to confirm it still provides the supporting data
> feed that cap.iter8-target-cap historically depends on, but that call
> was refused as outside this run's grant.

Classification: **MECHANISM CONFIRMED**, again — same outcome, different
phrasing, confirming the convention held across two independent runs of
the identical scenario, not just one.

## What survived contact, precisely

- **The agent used the tool for exactly the reason the scenario gave
  it** — checked its own capability first (succeeded), then the upstream
  one (refused) — not adversarially, not by accident.
- **The agent correctly reasoned about the refusal's consequence for its
  own task**, explaining *why* it could not proceed reliably, not just
  that a call failed.
- **The agent produced the exact convention, verbatim**, including
  following it *after* a full prose explanation, not instead of one —
  the convention was designed to be a terminal marker, not a replacement
  for genuine reasoning, and that is exactly how it was used.
- **`mapMessage()`'s new parsing path worked against real, not
  fixture-only, input** — the hermetic unit tests (added before this run)
  predicted this outcome; the live run confirmed the prediction rather
  than surfacing a gap between the fixture and reality, unlike Iteration
  6's own first attempt.
- **Telemetry recording (the focused enhancement after Iteration 6)
  continued to work unmodified** — `events()`'s `finally` block records
  a row regardless of which terminal `RunEvent` kind occurred; this run
  exercised that path for `RunBlocked` for the first time, without any
  telemetry-specific code changing.

## What did not survive contact cleanly — the honest exception

**Only one of the three `RunBlockedReason` values now has any real path
to being produced.** `architecture-change-required` and `mapping-missing`
remain exactly as unreachable as `docs/history/iteration-8/SCOPE.md` §2
predicted before any code was written — neither is discoverable with the
two MCP tools this project has. The pre-existing structural test
asserting `RunBlocked` remains a shape the port's type accepts was kept,
but its own claim was narrowed to name precisely what is now true:
`context-insufficient` has a real translation path (tested directly);
the other two reasons are still type-level only. This is not a new gap —
`docs/history/iteration-7/REPORT.md`'s own "honest exception" already
named the tool catalog as narrower than the full §9.2 surface — but it
is the exact, concrete shape that narrowness takes for `RunBlocked`.

## Pre-commit review findings

One Consistency Auditor finding, found and resolved during `/review`
before this iteration's changes were committed: `src/cli/investigate-run-blocked.ts`
duplicated `claude-sdk.ts`'s own `BLOCKED:` regex as a second,
independent pattern rather than importing `parseBlockedSignal` — two
sources of truth for the same convention, which could have silently
drifted out of sync if one were ever edited without the other. Fixed by
importing and reusing the real function; the live scenario was re-run
after the fix both to confirm it changed nothing about the observed
behavior and to add the second data point recorded above ("Run 2").

## Scope deferred

Exactly as `docs/history/iteration-8/SCOPE.md` §7 listed: `proposalDraft`
population; `architecture-change-required` and `mapping-missing`; a
dedicated `requestBlocked` MCP tool (§5 Option B — not needed, since
Option A's plain textual convention worked on the first real attempt);
any Orchestrator-side reaction to a received `RunBlocked` event;
`ArtifactProduced` and the real output path.

## Architectural deviations

None from the design in `SCOPE.md`. The mechanism worked as designed on
the first attempt — no honest-exception-shaped design correction was
needed the way Iteration 6's `acceptanceCriteria` finding or Iteration
7's redaction fix each were.

## Technical debt intentionally created

- **The `BLOCKED:` convention is an exact-match regex, not a lenient
  parser.** `SCOPE.md` §5.A named this risk directly before the run: a
  differently-worded acknowledgment of a refusal would be missed and
  silently fall through to `RunCompleted`. This run's own agent output
  shows the convention *can* coexist with full prose reasoning before it
  (the agent explained itself at length, then appended the exact line) —
  but a future run's agent phrasing it even slightly differently would
  not be caught. Not fixed here; a looser parser risks false positives
  (a normal report that happens to use the word "blocked") that would be
  a worse failure mode than a missed real signal, per `SCOPE.md` §8's own
  framing of which error is worse.
- **No `proposalDraft` is ever populated** — `RunBlocked` events this
  adapter produces always omit it, which is a real, if deliberate, gap
  against what §12.2 shows as the full shape (`proposalDraft?: {intent,
  operations[]}`); the Orchestrator/proposal-drafting integration this
  would ultimately feed remains unbuilt regardless.

## Demonstrations and verification

```
npm run typecheck              # clean
npm test                        # 138/138, fully hermetic, zero network access
npm run investigate:run-blocked # requires real gh-authenticated claude CLI + network; transcript reproduced above
```

## Recommended next-step validation

Per `SCOPE.md` §9: with `RunBlocked` (for `context-insufficient`) now
translated from real agent output, `ArtifactProduced` is the one
`RunEvent` kind never yet exercised against a real agent — the natural
next step for closing Open Question #1 outright, gated on the real
output path (push/branch/PR) remaining deferred until that iteration is
actually scoped. Separately, this iteration's own honest exception
(`architecture-change-required`/`mapping-missing` still unreachable)
becomes newly relevant if the MCP tool catalog ever grows past the two
tools this project has today — worth testing the same real-agent way,
not assumed safe or unsafe in advance.
