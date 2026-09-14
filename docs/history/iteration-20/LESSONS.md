# Iteration 20 Lessons

Not a status report (`docs/history/iteration-20/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 20 closed a real, previously undiscovered correctness bug: the
generated CI workflow file has been invalid YAML since Iteration 4,
surviving two real, live pushes to real GitHub repositories (17, 19)
undetected. It was found not by any test or live run, but by asking a
question no prior iteration's verification had asked — not "does the
pushed content match what `render()` produced," but "does the file's
real, only consumer actually accept it." The fix was verified against a
real oracle (this project's own `yaml` package) before a single line of
production code changed, and closed with the strongest possible
external evidence: GitHub's own Actions API confirming the fixed
workflow as `active`.

---

## Invalidated

### Assumption

A single, HTML-comment-style managed-region marker is valid across
every generated file, regardless of that file's own format — implicit
since Iteration 4, never stated as a hypothesis because it seemed too
obvious to name, and never actually tested against an external
consumer.

### Status

INVALIDATED

### Evidence

Parsing the exact real content this project has generated since
Iteration 4 for `.github/workflows/nexus-alignment.yml` — HTML-comment
markers wrapped around otherwise-valid YAML — through this project's
own `yaml` package (`^2.9.0`) fails outright: *"Implicit keys need to be
on a single line at line 1, column 1."* YAML has no HTML-comment syntax;
a bare `<!-- ... -->` line is parsed as an invalid implicit scalar key,
not a comment. This means the workflow pushed for real in both
Iteration 17's and Iteration 19's own live verification runs would have
been rejected by GitHub Actions as malformed, every time, since
Iteration 4.

### Why it went undetected this long

The three `.nexus/*.json` files share the exact same marker mechanism
and were never actually broken — nothing but Nexus's own code
(`extractManagedRegion`-aware since Iteration 18's `readJsonBody()`)
ever reads them, so self-consumption with an unwrap-aware reader masked
the underlying format violation. The CI workflow is the first — and, as
of this iteration, only — generated file whose real consumer is
external and never unwraps anything. Every prior verification checked
self-consistency (pushed content matches `render()`'s own output), a
real and correct check, but categorically incapable of catching a file
that is internally self-consistent and *also* invalid in its own
format. Nothing before this iteration ever asked the second question.

### Resolution

A second, YAML-native marker pair (`# nexus:begin generated · do not
edit` / `# nexus:end generated`); `wrapManagedRegion()` gains an
optional `style` parameter defaulting to `"html"`, so every existing
JSON call site is unaffected; `extractManagedRegion()`/`hashManagedRegion()`
try both styles internally, so no caller needs to know or pass which
style a given file uses.

### Consequence

Confirmed at the strongest available level: a real repository, a real
push, a real merge onto the default branch, and GitHub's own Actions
API listing the workflow as `state: "active"` — not merely that a local
parser agrees with the fix, but that GitHub Actions itself does.

---

## Validated

### Assumption

The fix (YAML-native markers for the one file that needs them) can be
verified against a real, external oracle before implementation, the
same way the bug itself was found — not merely reasoned about in
advance.

### Status

VALIDATED

### Evidence

Both the broken, real, historical content and the proposed fixed
content were parsed through this project's own `yaml` package before a
single line of `generate.ts` changed. The broken content failed
exactly as predicted; the fixed content parsed into the expected
`{name, on, jobs: {verify: {runs-on, steps}}}` structure exactly as
predicted. Implementation then matched what had already been verified,
rather than implementation preceding verification as in every prior
repository-generation iteration this session.

### Consequence

This is the first iteration this session where `/review` found no new
bugs in the implementation itself — only confirmed that a design
already tested against reality held. Pre-verifying both the failure and
the fix against a real oracle, before writing code, is a stronger
discipline than writing code and then discovering whether it was right.

---

### Assumption

`extractManagedRegion()`/`hashManagedRegion()` can become dual-style-aware
without any caller needing to change — `checkDrift()`, `generateProjection()`'s
hashing loop, and `POST /alignment/verify`'s `readJsonBody()` all keep
their exact existing signatures.

### Status

VALIDATED

### Evidence

Zero changes to `src/http/server.ts`, `src/http/routes.ts`, or any
`generateProjection()`/`checkDrift()` call site. Every one of their
existing tests — including the full `POST /alignment/verify` suite,
which depends on `readJsonBody()`'s unwrap behavior directly — passed
unmodified. A new `checkDrift()` test against the CI workflow file
specifically (coverage that never existed before this iteration)
confirmed the same drift-detection behavior the JSON files already had,
now correctly extended to the YAML file too.

### Consequence

The "try the specific thing, fall back" shape Iteration 18 established
for `readJsonBody()` generalizes cleanly one layer lower, without
needing to thread a new parameter through every consumer of managed-
region content.

---

## Unproven

### Assumption

No other currently-generated file has the same class of format/consumer
mismatch this iteration found for the CI workflow.

### Why It Remains Unproven

The three `.nexus/*.json` files were checked directly for this iteration
and confirmed self-consumed, unwrap-aware by construction — a real
check, not an assumption. But this is the first time this project has
asked "who really reads this file, in what raw form" of its own
generated output at all. A future generated file (real language/build
scaffolding, still Iteration 15's own deferred "Phase 4") will need to
ask the same question again for itself; this iteration's answer does
not transfer automatically.

### How To Validate

Whichever iteration next adds a new generated file should identify that
file's real, primary consumer before assuming the existing HTML-comment
marker default is safe — the same question this iteration asked of the
CI workflow, asked again, deliberately, rather than inherited silently.

---

## Biggest Surprise

Not that a bug existed — this project has now found a real,
previously-unknown defect via contact with reality in every single
repository-generation iteration this session (Iteration 5's `--json`
flag, Iteration 17's empty-repo `HEAD`, Iteration 19's primary-mapping
ambiguity). The surprise was how long this specific one survived,
and exactly why: it required not a live run, not a test, but a
*question* — "does the real consumer of this file actually read raw
bytes, or does something in between always unwrap them first" — that
happened to differ for exactly one of four generated files, and nothing
before this iteration had reason to ask it, because the other three
files' self-consumption pattern made the same underlying design choice
look safe everywhere it had been tried.

---

## Final Verdict

**What does Project Nexus now know?** That the generated CI workflow
file is real, valid YAML, confirmed by GitHub's own Actions API — not
merely by this project's own tooling agreeing with itself. That the
managed-region marker mechanism needed to become format-aware, and that
doing so required no changes to any of its existing consumers. That a
bug can survive two real, live external demonstrations when both only
ever check self-consistency, never a third-party consumer's own
acceptance.

**What does Project Nexus still only believe?** That no other currently
generated file shares this same format/consumer mismatch — checked for
today's three JSON files, not proven as a general property of every
future generated file.

**What architectural bets remain highest risk?** None newly introduced.
The one process lesson worth carrying forward explicitly: self-
consistency checks (does the pushed content match what was generated)
and external-validity checks (does the real consumer actually accept
it) are different questions, and this project's own verification
discipline needs to keep asking both for every future generated file,
not assume the first implies the second.
