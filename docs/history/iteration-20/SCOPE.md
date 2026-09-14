# Iteration 20 Scope — has the generated CI workflow ever actually been valid YAML?

This is a scope document, not a report. Nothing described here has been
built. It closes a real, previously undiscovered correctness bug found
while scoping what would otherwise have been the next iteration
(Technology Profile-driven scaffolding): `.github/workflows/nexus-alignment.yml`,
generated since Iteration 4 and pushed for real in Iterations 17 and 19,
is not valid YAML as actually committed — verified directly against
this project's own `yaml` package (already a dependency, `src/import/importAll.ts`),
not assumed.

---

## Question Under Test

Can the managed-region marker mechanism (§10.4, Iteration 4) be fixed so
that every generated file is valid in its *own* real format — not just
self-consistent with what `render()` itself produced — without breaking
the mechanism's existing, working behavior for the files that were
never actually broken?

---

## What We Know

Checked directly against the actual code and a real YAML parser, not
carried over from any prior iteration's prose:

- **`wrapManagedRegion()` (`src/repository/generate.ts`) wraps every
  generated file in the same HTML-comment-style markers**
  (`<!-- nexus:begin generated · do not edit -->` /
  `<!-- nexus:end generated -->`), regardless of the file's own format.
- **This is harmless for the three `.nexus/*.json` files** —
  `.nexus/repository.json`, `.nexus/architecture.snapshot.json`,
  `.nexus/technology-profile.json`. None of them are valid standalone
  JSON as committed (an HTML comment isn't valid JSON either), but
  **nothing other than Nexus's own code ever reads them**, and that code
  already unwraps the markers first (`extractManagedRegion()`, used by
  `POST /alignment/verify`'s `readJsonBody()` since Iteration 18). Self-
  consumption with an unwrap-aware reader was never actually broken.
- **This is not harmless for `.github/workflows/nexus-alignment.yml`.**
  Its real, primary — and only — consumer is GitHub Actions, an
  external system that will never unwrap Nexus's custom markers; it
  parses the raw file as plain YAML. Verified directly, not assumed:
  parsing the exact real content this project has generated since
  Iteration 4 (HTML-comment markers wrapped around otherwise-valid YAML)
  through this project's own `yaml` package fails outright:
  `Implicit keys need to be on a single line at line 1, column 1`. YAML
  has no HTML-comment syntax; a bare `<!-- ... -->` line is parsed as an
  invalid implicit scalar key, not a comment.
- **This means the workflow pushed for real in both Iteration 17's and
  Iteration 19's live verification runs would have been rejected by
  GitHub Actions as a malformed workflow file**, every time, since
  Iteration 4 — through no fault of Iteration 18's own alignment-check
  logic, which has simply never had a real chance to run.
- **Nobody caught this because every prior verification checked
  self-consistency, never external validity.** Iteration 17's and
  19's own live runs confirmed the pushed content matched
  `render()`'s own output byte-for-byte — a real, correct check, but one
  that cannot detect a file that is internally self-consistent and
  *also* invalid in its own format.
- **A fix verified directly, not merely proposed**: replacing the
  markers with YAML's own native comment syntax
  (`# nexus:begin generated · do not edit` / `# nexus:end generated`)
  around the exact same body produces content this project's own `yaml`
  package parses correctly, into the expected
  `{name, on, jobs: {verify: {runs-on, steps}}}` structure.
- **`yaml` (`^2.9.0`) is already a project dependency**, used today in
  `src/import/importAll.ts` — no new dependency needed to fix or to
  verify the fix.

---

## What We Only Believe

1. **That this project's own `yaml` package is a sufficiently faithful
   oracle for "GitHub Actions can parse this file."** It is a real,
   spec-compliant YAML 1.2 parser, and the fix is verified against it
   directly — but the strongest possible evidence is GitHub Actions
   itself accepting the file, not a local library agreeing with it.
   Recommended, not required (see Acceptance Criteria).
2. **That no other currently-generated file has a format/consumer
   mismatch of the same shape.** The three `.nexus/*.json` files are
   self-consumed and unwrap-aware by construction — checked directly
   for this iteration — but this is the first time this project has
   asked "who *really* reads this file, and in what raw form" of its
   own generated output; a future generated file (e.g. real
   language/build scaffolding, still deferred) will need to ask the same
   question again, not assume the answer from this iteration.

---

## Decision: format-aware markers, chosen per file at the point `render()` already knows the file's own format — not a new marker-style registry

- **`wrapManagedRegion(body, style)` gains a second, optional parameter**
  (`"html" | "yaml"`, defaulting to `"html"`) — every existing call site
  (all three `.nexus/*.json` files) needs zero changes, since the
  default preserves today's exact behavior. Only the one YAML call site
  in `render()` passes `"yaml"` explicitly.
- **`extractManagedRegion()`/`hashManagedRegion()` keep their existing
  signatures unchanged** and instead try both marker pairs internally —
  HTML first, then YAML — returning `null` only if neither matches. This
  is the same "try the more specific thing first, fall back" shape
  `readJsonBody()` already established in Iteration 18
  (`extractManagedRegion(text) ?? text`), applied one layer lower. No
  caller (`checkDrift()`, `generateProjection()`'s hashing loop,
  `readJsonBody()`) needs to know or pass which style a given file uses
  — confirmed as sufficient by reading every real call site directly,
  not assumed.
- **Rejected: a general, path-extension-driven marker-style lookup
  table.** Only two real formats exist today (JSON, self-consumed;
  YAML, externally consumed) and only one of the two needed to change.
  Building a registry for hypothetical future formats not yet generated
  would be solving a problem this iteration's own evidence doesn't yet
  have.
- **Rejected: giving every generated file its own bespoke marker
  scheme decided ad hoc at each call site with no shared function.**
  Would duplicate the "wrap/extract/hash" logic Iteration 4 already
  built once, correctly, for the cases where it was never actually
  broken.

---

## Recommended Iteration 20 Scope

1. **`src/repository/generate.ts`**: add a YAML-native marker pair;
   `wrapManagedRegion(body, style: "html" | "yaml" = "html")`;
   `extractManagedRegion()`/`hashManagedRegion()` try HTML markers, then
   YAML markers, unchanged signatures. `render()`'s `alignmentWorkflowYaml`
   call passes `style: "yaml"`; the three JSON call sites are untouched
   (default already correct).
2. **No change to `src/http/server.ts`, `POST /alignment/verify`, or
   `checkDrift()`'s signatures.** All three already call the
   now-smarter `extractManagedRegion()`/`hashManagedRegion()` unchanged
   and get the right behavior for free.
3. **No change to `generateProjection()`'s hashing loop** — it already
   iterates every `ManagedFile` uniformly; a correctly-marked YAML file
   hashes exactly the same way the JSON files already do.
4. **Real, live confirmation, beyond the hermetic suite**: push a real
   repository (reusing Iteration 17's `openPullRequestWithChanges()`
   unmodified) with the fixed workflow file, and confirm via `gh
   workflow list`/`gh api` that GitHub Actions actually recognizes it as
   a valid workflow — not merely that this project's own `yaml` package
   agrees with it.

---

## Acceptance Criteria

1. `wrapManagedRegion(body, "yaml")` produces content this project's
   own `yaml` package parses successfully into the expected structure;
   `wrapManagedRegion(body)` (no style, or `"html"`) is byte-identical
   to every call before this iteration.
2. `extractManagedRegion()` correctly strips either marker style and
   returns `null` for content matching neither — checked against real
   examples of both, not only the style each was designed for.
3. `render()`'s three JSON files are byte-identical to their Iteration
   19 output — confirmed by every pre-existing `repository.test.ts` and
   `technology-profile`-related test passing unmodified, not merely
   argued from the diff.
4. `render()`'s CI workflow file, taken as a whole (markers included,
   exactly as it would be committed), parses successfully via this
   project's own `yaml` package into
   `{ name: "nexus-alignment", on: ["pull_request"], jobs: { verify: {
   "runs-on": "ubuntu-latest", steps: [...] } } }`.
5. `checkDrift()` against the CI workflow file specifically — not only
   the JSON files, which is all any prior iteration's tests have ever
   exercised — correctly reports no drift for a hand-edit outside the
   (now `#`-style) markers, and real drift for one inside them.
6. `POST /alignment/verify`'s full existing test suite passes
   unmodified — its own body-unwrapping path only ever touches the JSON
   file, untouched by this fix.
7. A real, live push (Iteration 17's mechanism, unmodified) of the fixed
   workflow file is independently confirmed via `gh` to be a
   GitHub-Actions-recognized, valid workflow — not merely that it parses
   locally.
8. The Report states plainly that this bug existed, undetected, from
   Iteration 4 through Iteration 19, and names precisely why prior
   verification (self-consistency checks) could not have caught it.

---

## Explicit Deferrals

- **Auditing every other file this project might one day generate**
  (real language/build/CI/container scaffolding, still Iteration 15's
  own deferred "Phase 4") for the same format/consumer mismatch —
  each future generated file needs to ask this question for itself when
  it is actually built, not have an answer assumed in advance from this
  iteration's own fix.
- **A runtime self-check inside `render()`** that validates its own YAML
  output against the `yaml` package before returning it. `render()`
  stays a simple, pure function; validity is established by tests and
  the real, live demonstration, not by a defensive check baked into
  generation itself — matching how no other generated file has ever
  been self-validated at generation time either.
- **Any change to what the CI workflow's content actually does**
  (the alignment-verify call itself, its trigger conditions) — this
  iteration fixes the file's *validity*, not its behavior.

---

## Risks

- **This project's own `yaml` package agreeing with the fix is strong,
  but not the strongest possible, evidence** — GitHub Actions' own YAML
  handling could in principle differ in some edge case a generic
  YAML 1.2 parser wouldn't catch. Acceptance Criterion 7's real, live
  push is what actually closes this gap; the hermetic tests alone would
  not.
- **Every repository already bootstrapped under the old, broken
  workflow** (none currently real and persistent, since both live
  demonstrations to date were deliberately disposable) **would need
  `generateProjection()` re-run to pick up the fix** — not a migration
  this iteration performs, since no real, persistent repository exists
  yet to migrate.

---

## Why Iteration 20 Is The Right Next Step

This is a real, verified correctness bug in something every repository-
generation iteration since Iteration 4 has silently depended on being
right, discovered only by chance while scoping a larger, riskier next
feature (Technology Profile-driven scaffolding). Iteration 18 built a
real alignment-verification endpoint that this exact bug would have
prevented from ever actually running against a real repository's CI —
closing it now, before attempting anything bigger on top of the same
generation pipeline, matches this project's own repeated discipline of
fixing a found, disclosed defect before building further on the layer
that carries it.
