# Iteration 11 Report — does declared relevance distinguish a task-blocking refusal from an irrelevant one?

Status: complete for the scope agreed in `docs/history/iteration-11/SCOPE.md`,
with a clean, validating result — both of Iteration 9's own real scenarios
now classify correctly under the new rule, with zero agent-text parsing.
151 `node:test` cases pass (up from Iteration 10's 142, plus 9 new cases
this iteration; all still hermetic, offline, zero network access). Three
live runs were executed this iteration — one confirming the
relevant-refusal scenario, two attempting the irrelevant-refusal scenario
— and all three transcripts are reproduced below.

## Scope completed

1. **`relatedElements` added to the Work Package payload**, documented
   in `docs/WORK_PACKAGE_SPEC.md`'s Schema section — optional,
   `Array<{ elementId: string; required: boolean }>`, disclosed there as
   not yet populated by `buildWorkPackage()` (hand-populated only, the
   same discipline `investigate-*.ts` scripts already apply to
   `acceptanceCriteria`).
2. **`classifyResultMessage` extended, not replaced.** When
   `relatedElements` is declared, a refusal is authoritative for
   `RunBlocked` only if its own `elementId` (correlated in `events()`
   from `toolCalls`, never from agent text) matches a declared
   `required: true` entry. When `relatedElements` is empty — every Work
   Package before this iteration, and every existing test fixture —
   behavior is unchanged: Iteration 9's own unconditional "any refusal ⇒
   blocked" rule still applies exactly as before.
3. **`toolResults` entries now carry `elementId`**, populated in
   `events()` by correlating each `tool_result` block's `tool_use_id`
   back to the matching `toolCalls` entry's own input — the same
   correlation pattern `recordTelemetry`'s `accessedElementIds` already
   established in Iteration 6, applied here to classification instead of
   telemetry.
4. **Hermetic tests** — `test/claude-sdk-adapter.test.ts` grew from 21 to
   30 cases: the declared-relevance path for a required match, a
   declared-optional non-match, an undeclared element, the BLOCKED: text
   fallback still working underneath the new rule, byte-for-byte
   reproduction of Iteration 9's own rule when `relatedElements` is
   omitted, and `parseRelatedElements` itself (well-formed input,
   malformed/absent input degrading to an empty list, `required`
   defaulting to `false`).
5. **Both of Iteration 9's own real scenarios re-run live**, this time
   with `relatedElements` populated — not new scenarios, the same two
   already on record, per Iteration 9's own Lessons ("two full real
   scenarios already on record to validate any candidate rule against").

## The three live runs, in full

### Run 1 — the relevant-refusal scenario, re-confirmed under the new rule

```
event: {"kind":"RunStarted"}
event: {"kind":"ContextRequested"}
event: {"kind":"ContextRequested"}
event: {"kind":"RunBlocked","reason":"context-insufficient"}

getCapabilitiesOf(comp.iter8-upstream) called: true
that call's real result: {"toolUseId":"toolu_01BT7BMeUcfzqgYfjDnEs7xE","isError":true,
"text":"MCP call refused for run run.MR6CQVPH8PQP5CTV0DPXJG89BW: element
comp.iter8-upstream is not in this grant","elementId":"comp.iter8-upstream"}

declared relatedElements: [{"elementId":"comp.iter8-upstream","required":true}]
required-related refusal observed: true
```

The agent's real final answer (unedited, excerpt):

> **comp.iter8-upstream supporting data feed**: Could not verify. The
> call was refused because `comp.iter8-upstream` is outside this run's
> grant... Per the acceptance criteria, confirming the upstream
> capability is a required condition before this task can be treated as
> ready to implement — it is not something I can safely assume or guess.
>
> BLOCKED: context-insufficient — I needed to confirm via
> getCapabilitiesOf(comp.iter8-upstream) that it still provides the
> supporting data feed cap.iter8-target-cap historically depends on, but
> that call was refused as outside this run's grant.

Classification: **MECHANISM CONFIRMED, DECLARED-RELEVANCE PATH.** The
refused element's own id matched the declared `required: true` entry,
and `events()` emitted `RunBlocked` from that alone — the agent's text
also matched the `BLOCKED:` convention this time, but is not what decided
the outcome. Reproduces Iteration 9's own validated relevant-refusal
result under the new, narrower rule.

### Run 2 — the irrelevant-refusal scenario, first attempt

Same real prompt Iteration 9's own Run 3 used. This time the agent did
not attempt the optional check at all — real event sequence
`["RunStarted", "ContextRequested", "RunCompleted"]`. Classification:
**NO OPPORTUNITY** — the same real, honest, non-adversarial outcome
Iteration 9's own Run 2 first produced with a more explicit "skip if you
like" framing; this time it recurred with the framing that previously
did produce the over-trigger condition (Run 3), a reminder that a real
model's behavior on an identical prompt is not perfectly repeatable, not
a scenario-design flaw to fix.

### Run 3 — the irrelevant-refusal scenario, second attempt

```
event: {"kind":"RunStarted"}
event: {"kind":"ContextRequested"}
event: {"kind":"ContextRequested"}
event: {"kind":"RunCompleted"}

getCapabilitiesOf(comp.iter9-related) attempted: true
that call's real result: refused — "element comp.iter9-related is not in this grant"

declared relatedElements: [{"elementId":"comp.iter9-related","required":false}]
required-related refusal observed: false
```

The agent's real final answer (unedited, excerpt):

> **Secondary check (optional good practice) — not accessible**
>
> As suggested, I also attempted to check `comp.iter9-related` for extra
> confidence... That call was refused because `comp.iter9-related` is
> outside this run's grant. Per the acceptance criteria, this check is
> not required and does not affect the outcome of this task, so no
> further action was taken on it.
>
> **Conclusion:** `comp.iter9-target` is confirmed ready with respect to
> `cap.iter9-target-cap`. No code changes proposed or made — this was a
> readiness check only.

Classification: **OVER-TRIGGER AVOIDED.** This is the exact condition
Iteration 9's own Run 3 produced `RunBlocked` for. Under the new rule,
`events()` correctly produced `RunCompleted` — the declared-relevance
check found no `required` match (the refused element was declared
optional), and the agent's own text never matched the `BLOCKED:`
convention either (it wasn't consulted for this decision, and would not
have mattered if it had been). Zero text-parsing at any point in this
classification.

## What survived contact, precisely

- **`relatedElements`, hand-populated correctly, distinguishes both of
  Iteration 9's own real scenarios** — `RunBlocked` for the relevant
  refusal (Run 1), `RunCompleted` for the irrelevant one (Run 3) — the
  exact outcome neither the pure agent-text approach (Iteration 8) nor
  Iteration 9's own naive backend rule achieved simultaneously.
- **The `elementId` correlation in `events()` works correctly** —
  confirmed against real, live tool-call/tool-result pairs, not only
  hermetic fixtures.
- **Iteration 9's own rule is preserved exactly, unconditionally, for any
  Work Package that declares nothing** — every existing hermetic test
  continues to pass unchanged; this iteration is additive, not a
  replacement.

## What this does not settle

**This iteration validates the mechanism given a correctly hand-populated
field — not that Work Package generation can populate it correctly on
its own.** Both scenarios here had the "right answer" (which element is
required, which is optional) decided by this iteration's own author,
matching what each scenario's acceptance-criteria prose already said.
Whether `buildWorkPackage()`, or a future architect-facing authoring
tool, can reliably decide required-vs-optional for a real task is a
different, larger question this iteration deliberately does not attempt
— named directly in `docs/history/iteration-11/SCOPE.md`'s own Explicit
Deferrals, not discovered as a surprise here.

## Scope deferred

Exactly as `docs/history/iteration-11/SCOPE.md` listed: a real authoring
path for populating `relatedElements`; auto-deriving it from
`buildWorkPackage()`; the `acceptanceCriteria`-ids-vs-text gap (real,
disclosed, unrelated); `architecture-change-required` and
`mapping-missing`; removing the naive fallback (not warranted — it
remains correct and necessary for undeclared Work Packages); incremental
architecture authoring (Open Question #6, unrelated).

## Technical debt intentionally created

None new. The naive `toolResults`-refusal rule remains, now scoped
explicitly to the case where `relatedElements` is absent — a narrower,
better-understood role than it had before this iteration, not a debt.

## Demonstrations and verification

```
npm run typecheck                    # clean
npm test                              # 151/151, fully hermetic, zero network access
npm run investigate:run-blocked       # requires real gh-authenticated claude CLI + network; Run 1 above
npm run investigate:blocked-relevance # requires real gh-authenticated claude CLI + network; Runs 2 and 3 above
```

## Recommended next-step validation

Given a clean, validating result on both fronts, the immediate next
question is no longer about the classification mechanism — it is whether
Work Package generation (or a future authoring path) can populate
`relatedElements` correctly for a real task, which is squarely Iteration
12's own scoped territory (incremental architecture authoring) and the
roadmap's own next step, not attempted here.
