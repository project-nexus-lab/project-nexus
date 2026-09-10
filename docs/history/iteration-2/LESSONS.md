# Iteration 2 Lessons

Not a status report (`docs/history/iteration-2/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 2 had one primary target — `docs/PROJECT_KNOWLEDGE.md`'s #1
Open Question — and closed it with direct evidence: adding a second
`AgentRuntimeAdapter` against the §12.2 port cost one new file with zero
new imports beyond what the first adapter already needed, and zero changes
to any core context, the port itself, or the registry. Three independent
checks agree (structural, comparative, no-second-pass), not one inference
from a passing suite.

It also produced one honest qualifier worth being precise about: this
validates the claim for *trivial* adapters. Neither adapter built here
does real work — no streaming, no tool-call translation, no actual vendor
API. Whether the same near-zero marginal cost holds for a *real* second
adapter, one that has to express actual behavioral differences through the
port, is a different and still-open question. Closing "runtime
independence holds for two adapters that do nothing" is real progress; it
is not the same claim as "runtime independence holds when a runtime does
something."

---

## Validated

### Assumption

Runtime independence holds when a second adapter is actually built —
adding it costs "one row, one class" (§12.7), not a change to any core
context.

### Status

VALIDATED — for adapters with no real behavioral complexity; see Unproven,
below, for the qualifier.

### Evidence

Three independent checks, not one:

1. **Structural** — `test/runtime.test.ts` statically parses
   `noop-b.ts`'s import statements and asserts every one resolves to the
   port and nothing else. This survives as a permanent regression test,
   not a one-time observation.
2. **Comparative** — `noop-a.ts` and `noop-b.ts` have byte-identical
   import surfaces (`diff` on the import lines produces no output).
   Adapter B needed nothing Adapter A didn't already need.
3. **No second pass** — `src/runtime/port.ts` and `src/runtime/registry.ts`
   were each written once, before Adapter B's registration was ever
   tested, and were not touched again to accommodate it.

### Consequence

The Constitution's own top-line principle (Agent Independence) now has
direct implementation evidence behind it, not only the static fact that
no vendor string exists in the core schemas — that fact was previously
necessary evidence, not sufficient (see Iteration 0/1's framing of this
same Open Question). It is now both.

---

## Invalidated

None. Nothing this iteration assumed turned out architecturally wrong —
the port, the schema, and the registration tables all worked exactly as
their Iteration 0 design intended, unmodified. The one real bug this
iteration produced was in the test written to check the claim, not in the
claim or the architecture itself — see Biggest Surprise.

---

## Unproven

### Assumption

The same near-zero marginal cost holds for a *real* second adapter — one
that has to express actual behavioral differences (streaming, tool-call
translation, vendor-specific configuration) through the port, not just a
canned event sequence.

### Why It Remains Unproven

Both adapters built this iteration are deliberately trivial by design —
that was the right scope for answering "does the port itself force core
changes," but it cannot answer "does a port shaped like this stay
sufficient once an adapter has real work to translate." A real adapter
might reveal the port needs a capability neither no-op adapter needed to
exercise (streaming event delivery, structured tool-call payloads,
model-specific configuration surfaced through `capabilities()`).

### How To Validate

Build the Claude SDK Adapter (§12.7) — the first *real* adapter — and
check the same three forms of evidence again: does it still import
nothing but the port plus its own vendor SDK, does the port still need no
changes, does the registry still need no new functions. If any of those
three answers changes from this iteration's, that is the signal the claim
was scope-limited, not general.

---

## Biggest Surprise

Not about the domain model — about the test written to check it. The
first version of the structural import-check test used a line-anchored
regex (`/^import .+$/gm`) to find import statements, which matched only
the first line of TypeScript's multi-line `import type { ... } from
"..."` formatting and silently found zero of the import's actual module
specifier. The test failed loudly on its first run — not because the
claim was false, but because the test itself was checking the wrong
substring. Fixed by matching the `from "..."` clause directly
(`/from\s+["']([^"']+)["']/g`), which is robust to line-wrapping.

Worth naming precisely because of what it is *not*: this is not the same
shape of gap as Iteration 1's two findings (a real bug invisible to a
green suite). Here the test caught its own defect on the first run — the
opposite failure mode, and the reassuring one. It is still worth recording
as a standing reminder for any future structural/static-analysis test in
this codebase: prefer matching the specific token you care about (a module
specifier) over a line-shaped pattern that assumes a formatting
convention the language doesn't actually guarantee.

A second, smaller instance of the same underlying lesson showed up closing
this same iteration out: the manual five-reviewer pass run before this
Report was written found and fixed two stale "Open Question #2" cross-
references (numbering that had shifted once `docs/PROJECT_KNOWLEDGE.md`
was updated) — but missed a third, inside "Scope completed," caught only
on the next pass, running `/iteration-close` fresh in a new session. A
grep-assisted manual check is still a manual check; it found most of an
instance of drift, not reliably all of it, on the first attempt. Consistent
with Iteration 1's own finding about the Consistency Auditor's *reason for
existing* — worth noting that the auditor role itself is not immune to
needing more than one pass.

---

## Final Verdict

**What does Project Nexus now know?** That adding a second
`AgentRuntimeAdapter` against the existing port genuinely costs what §12.7
claims, checked three independent ways rather than inferred from a passing
suite. That the `runtime` schema, sitting untouched since Iteration 0, was
correctly shaped for this from the start — no migration change was needed
to register two adapters and a full role vocabulary.

**What does Project Nexus still only believe?** That this holds for a
*real* adapter, not just two deliberately trivial ones — the qualifier
above is the honest boundary of what was actually tested. Everything else
in `docs/PROJECT_KNOWLEDGE.md`'s Open Questions — MCP grant enforcement,
file-level knowledge, graph traversals at scale — is exactly as unproven
as it was before this iteration touched none of them.

**What architectural bets remain highest risk?** MCP grant enforcement as
a real boundary rather than a formula is now the top-ranked open question
by elimination, not because anything new was learned about it this
iteration. Repository bootstrap remains the largest single piece of
remaining work, and the one most other Unproven items are waiting on.
