# Iteration 2 Report — runtime independence under a second adapter

Status: complete for the scope agreed before starting. 84 `node:test`
cases pass (up from Iteration 1's 77). The primary target —
`docs/PROJECT_KNOWLEDGE.md`'s #1-ranked Open Question, whether adding a
*second* `AgentRuntimeAdapter` genuinely costs only "one row, one class"
(§12.7) — is answered, with direct evidence, not by inference from a
passing test suite alone.

## Scope completed

1. **The `AgentRuntimeAdapter` port** — `src/runtime/port.ts`. The
   interface exactly as §12.2 specifies (`id`, `capabilities()`, `start`,
   `events`, `cancel`), the full six-event `RunEvent` vocabulary
   (`RunStarted`, `ContextRequested`, `ArtifactProduced`, `RunBlocked`,
   `RunFailed`, `RunCompleted`), and a typed `McpGrant` matching §9.5's
   shape — a type only; no grant is issued or enforced anywhere (the MCP
   grant Open Question — #1 as of this iteration's close, see
   "Recommended next-step validation" — still open, still out of scope).

2. **Two adapters** — `src/runtime/adapters/noop-a.ts`,
   `src/runtime/adapters/noop-b.ts`. Both trivial: canned event sequences,
   no real execution. Adapter A always succeeds; adapter B deliberately
   emits `RunBlocked` instead, so the experiment also exercises the one
   event kind v2 added over v1, not just the happy path.

3. **The role vocabulary** — `db/migrations/0010_runtime_role_vocabulary.sql`.
   All six `role.*` rows from §4.4, preserved in full as the document
   requires, even though only `role.implementer` is actually orchestrated
   in the MVP (§12.6). `runtime.agent_role` has existed, empty, since
   Iteration 0; this is the first time anything wrote to it.

4. **Registration** — `src/runtime/registry.ts`. `registerAdapter`,
   `listAdaptersForRole`, both application-level (a deploy/setup step, not
   a migration — an adapter is a code artifact, not static reference data
   the way the role vocabulary is). `runtime.adapter_registration` and
   `runtime.adapter_role_support` have existed, empty, since Iteration 0;
   same story.

5. **Tests** — `test/runtime.test.ts` (7 cases): the role vocabulary is
   seeded correctly, both adapters register into the pre-existing tables
   without any schema change, registration is idempotent, both adapters'
   `start`/`events` produce vocabulary-conformant sequences, and a
   structural check (below) that is the actual answer to the question this
   iteration exists to answer.

## Scope deferred

- **An Orchestrator** (§16 1f) — still deferred; nothing here assumes one
  exists or will soon.
- **An HTTP surface for the runtime context** — unlike Iteration 1,
  nothing needed to be externally reachable to be meaningful here; the
  claim under test is about code-change surface area, not runtime
  behavior.
- **MCP grant enforcement** — was Open Question #2 at the start of this
  iteration, is #1 now that this iteration narrowed its own question
  rather than fully retiring it (see "Recommended next-step validation,"
  below). Deliberately not bundled in regardless of its rank; it needs
  real MCP server scaffolding, a different and larger build than this
  iteration's two TypeScript classes.

## The actual answer to the Open Question

**Yes, confirmed, with three independent pieces of evidence, not one:**

1. **Structural.** `test/runtime.test.ts`'s last test statically parses
   `noop-b.ts`'s import statements and asserts every one resolves to
   `../port.js` — nothing from `architecture`, `work`, `repo`, or
   `workpackage`/execution code. This is the durable, repeatable form of
   the claim: a future change that adds a stray dependency from an adapter
   into core context code fails this test immediately, not by someone
   noticing during a review.

2. **Comparative.** `noop-a.ts` and `noop-b.ts` have an identical import
   surface — `diff` on their import lines produces no output. Adapter B
   introduced zero new imports beyond what Adapter A already needed.

3. **No second pass on shared code.** `port.ts` and `registry.ts` were
   each written once, before Adapter B's registration was ever tested, and
   neither was touched again to accommodate it — `registerAdapter` and
   `listAdaptersForRole` are the exact same functions for both adapters,
   with no adapter-specific branches added.

Taken together: registering a second adapter cost one new file
(`noop-b.ts`, 32 lines, importing only the port) and zero changes to
`execution`, `work`, `architecture`, `repo`, or the registry/port
themselves. §12.7's claim holds — not as an inference from "the tests
still pass," but as something specifically checked for.

## Architectural deviations

None. This iteration exercised existing, unmodified schema
(`db/migrations/0006_runtime.sql`, written in Iteration 0 and never
altered) and added one new migration that is pure data (role vocabulary),
not a schema change.

## Technical debt intentionally created

- **Both adapters are permanently trivial.** Neither will ever do real
  work; they exist only to answer the marginal-cost question. A real
  adapter (the Claude SDK Adapter, §12.7) is a separate, future build —
  these two are not a scaffold for it, and should not be extended into
  one. Worth stating plainly so a future iteration doesn't inherit them as
  a starting point by accident.
- **`McpGrant` is a type with no issuer and no enforcement.** `start()`'s
  signature needed the shape to match §12.2 exactly; nothing constructs a
  real grant or checks one. This is the MCP grant Open Question's
  territory (see "Scope completed" above and "Recommended next-step
  validation" below), not addressed here.
- **The port and adapters live in one `src/runtime/` module** rather than
  splitting the port (architecturally Execution's, §12.1) from the
  adapters (Runtime Integration's) into separate directories. Disclosed in
  `port.ts`'s own doc comment — a deliberate simplification given the port
  is one interface, not a module's worth of code, and a near-empty
  `src/execution/` created just to hold it would be exactly the kind of
  structure the Simplicity Reviewer exists to question.

## Demonstrations and verification

```
npm run typecheck    # clean
npm test              # 84/84
```

The comparative and no-second-pass evidence above (import diff, `git
status` showing only new files under `runtime/`) was gathered directly
during this iteration, not reconstructed afterward — see
`docs/history/iteration-2/LESSONS.md` for the exact commands run.

## Recommended next-step validation

Unchanged in relative priority from Iteration 1's recommendation, with #1
now resolved:

1. **MCP grant boundary enforcement** (now the top-ranked Open Question) —
   one MCP tool, one grant, one refused out-of-grant call. Bigger than
   this iteration's build (real MCP server scaffolding, not two
   TypeScript classes) — its own iteration.
2. **Repository bootstrap (§10)** — still the largest remaining piece,
   and still the one that unlocks two other Unproven items at once
   (FileAnchor maintenance over real time, multi-repository ambiguity in a
   real scenario).
3. **Multi-repository ambiguity in a real scenario** — piggybacks on
   repository bootstrap once real repos exist; not worth forcing before
   then.
