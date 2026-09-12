# Iteration 13 Scope — can a simulated PO/Architect complete a real authoring workflow through the API, knowing nothing but a product's name?

This is a scope document, not a report. Nothing described here has been
built. It follows `docs/ROADMAP.md`'s current sequence and directly
answers `docs/PROJECT_KNOWLEDGE.md`'s narrowed Open Question #6: not
whether an incremental write path exists (Iteration 12 closed that), but
whether the resulting `create`/`retire`/`provide` mechanism is usable by
a real Product Owner or Architect, given it is reachable today only as
raw `POST /proposals` JSON with no way to discover what already exists
or review a draft before approving it.

---

## A naming clarification, checked before anything else

`MVP_ARCHITECTURE_V2.md` §6.2 rule 8 already uses the phrase "an
authoring API call" as one of exactly two legitimate ID-minting paths,
alongside "an applied proposal." Read in isolation, this could suggest
a *second*, ungoverned write path distinct from the proposal mechanism
Iterations 1 and 12 built. Read against §5.1–§5.2 (the proposal
mechanism exists specifically so architecture change has *one* governed
path, replacing ad hoc direct edits — "GitHub governs code merge. Nexus
governs architecture merge") and against `draftProposal`'s own
`authoredBy` field (which already accepts `human:<id>`, not only
`run:<id>`), the more consistent reading is that rule 8's "authoring API
call" names the *seed/bootstrap* path (`importArchitecture`, used once
to establish a graph's very first elements before any proposals exist),
not a parallel bypass of governance for ordinary incremental change.

This iteration proceeds on that reading: "Architecture/PO authoring
API" means a friendlier surface *onto the existing, unchanged proposal
mechanism* — read access for discovery and review, plus the
already-governed write path — not a new way to mint elements without
approval. If a future iteration finds evidence this reading is wrong,
that is a real, separate architectural question, not silently
reinterpreted here.

---

## Question Under Test

Is a plain, ungated HTTP **read** surface — sufficient to discover what
already exists and to review a drafted proposal before approving it —
enough to make the *existing, unchanged* `create`/`retire`/`provide`
write shape usable end-to-end by someone who starts with nothing but a
product's name? Or does the write shape (`operations[]`, a flat bag of
optional fields) also need to change before that's true?

---

## What We Know

Checked directly against the actual code before writing anything else:

- **None of the 8 named graph traversals (§8.4) is a "get element" or
  "list elements" query** — `ancestry`, `providersOf`, `capabilitiesOf`,
  `implementationPath`, `impactOf`, `governanceOf`, `resolve`,
  `localSubgraph` (`src/graph/traversals.ts`) all require an
  already-known id and walk a relationship from it. There is no way to
  discover an id from a name, or list an element's children, anywhere
  in this codebase today.
- **Only 2 of the 7 Architecture MCP tools §9.2 specifies exist**
  (`getAncestry`, `getCapabilitiesOf`, `src/mcp/tools.ts`) — confirmed
  since Iteration 3. `architecture.get_element` (id → kind, name,
  status, parentId, childIds) is fully specified there and has never
  been built, in any form. Work MCP and Repository MCP: zero tools
  implemented.
- **`getProposal()` (`src/proposal/proposal.ts`) already reads back
  `id`/`state` internally, but is not exported and has no route** —
  `src/http/routes.ts` exposes `POST /proposals`,
  `/submit`, `/approve`, `/reject`, `/apply`, and nothing that reads a
  proposal back. A human approving a proposal today cannot inspect its
  operations through the API at all.
- **Constitution's "no free-text or semantic search, IDs in, structure
  out" (§ MCP Layer) is stated for MCP tools specifically** — a bounded,
  `kind`/`parent`-filtered listing is deterministic retrieval, not
  fuzzy search, and does not conflict with it; nothing in the
  Constitution or `MVP_ARCHITECTURE_V2.md` forbids a plain listing
  endpoint for humans.
- **Precedent already exists for a plain, ungated HTTP wrapper alongside
  a grant-checked MCP tool over the same traversal** —
  `GET /architecture/:id/ancestry` (`routes.ts`) calls `ancestry(db, id)`
  directly, bypassing the MCP grant machinery entirely, because a human
  browsing pre-run is a different context than an agent mid-run (§9.5's
  grant is run-scoped). The same precedent applies to whatever this
  iteration adds.
- **`apps/frontend` is still an empty placeholder** (`package.json` +
  `README.md` only) — confirmed directly, unchanged since Iteration 10.
  There is no UI, and none is in scope here (Iteration 14).

---

## What We Only Believe

1. **That read access alone (discovery + review) is sufficient** —
   untested. The `operations[]` write shape (flat, optional fields named
   `mintId`/`provideComponentId`/etc.) might still be too low-level for
   a real PO/architect regardless of what they can read first.
2. **That a bounded `kind`/`parent` listing is the right shape for
   discovery** — an alternative (browsing only via containment, i.e.
   reusing `ancestry` in reverse) was considered and rejected for this
   iteration only because no traversal today walks *down*; not proven
   superior, just the smaller addition.
3. **That `change_operation`'s known, disclosed schema looseness**
   (`docs/PROJECT_KNOWLEDGE.md` Unproven, Iteration 12) is unaffected by
   anything here — this iteration does not touch `change_operation` or
   `element_provision` at all, only reads.

---

## Smallest Viable Investigation

1. **`GET /architecture/:id`** — element detail: `id`, `kind`, `name`,
   `status`, `parentId`, `childIds` (one query for the row, one for
   `parent_id = id`). Mirrors §9.2's spec'd, never-built
   `architecture.get_element` shape — but as a plain, ungated route for
   humans, the same relationship `/architecture/:id/ancestry` already
   has to `getAncestry`.
2. **`GET /architecture?kind=&parent=`** — bounded listing (`id`, `kind`,
   `name`, `status`), both filters optional, fixed cap, no cursor
   pagination (same postponement §9.6 already applies to MCP).
3. **`GET /proposals/:id`** — proposal detail: `id`, `intent`, `state`,
   `authoredBy`, `approvedBy`, `operations` (each operation's `ordinal`,
   `op`, and whichever fields are non-null for that op) — the actual
   review step a PO needs before approving.
4. **`GET /proposals?state=`** — bounded listing (`id`, `intent`,
   `state`, `authoredBy`), same pagination postponement as above.
5. **One real, HTTP-driven end-to-end test** (`test/http.test.ts`,
   extending Iteration 1's own real-`http.Server` pattern — not a new
   testing style): a simulated PO starts knowing only the string "Trade
   Platform," never a hardcoded `subsys.*`/`comp.*`/`cap.*` id from the
   seed file. It lists products, finds the matching one by name, lists
   domains under it, subsystems under that, and so on down to a real
   unprovided capability discovered the same way `verify.ts` already
   knows `cap.invoice-export` is unprovided — then drafts a
   `create` + `provide` proposal referencing only discovered ids, `GET`s
   it back to confirm its operations before approving (the actual
   review step), approves, applies, and re-fetches the capability's
   detail to confirm it now resolves.

**Stays unchanged unless evidence demands otherwise**: `operations[]`'s
shape, `draftProposal`/`applyProposal`, `change_operation`,
`element_provision`, the MCP grant surface, Work MCP, Repository MCP,
anything in `apps/frontend`.

---

## Evidence Plan

**New evidence required:**
1. Does the read surface above let a real, HTTP-driven test complete a
   full authoring workflow using zero ids known in advance (only a
   human-readable name)?
2. Does the existing `operations[]` write shape survive that workflow
   without needing to change, or does the exercise surface a concrete
   ergonomic problem with it?

**Failure modes, named directly:**
- The read surface is sufficient for *discovery* but the write step
  still feels raw/error-prone even with full read access — a real,
  informative result that would motivate redesigning `operations[]` in
  a *future* iteration, not evidence to force that redesign in now.
- A bounded listing turns out to need more than `kind`/`parent`
  filtering for a realistic org (e.g., every subsystem having so many
  components that a fixed cap hides real entries) — narrows the
  question rather than answering it, the same way Iteration 10's own
  scale investigation narrowed rather than closed its question.
- The Domain Integrity Reviewer may judge that `GET /architecture`'s
  listing sits closer to a "browse everything" pattern than the
  Constitution's deterministic-retrieval bias tolerates, even bounded —
  a real `/review`-time question, not pre-decided here.

---

## Acceptance Criteria

1. `GET /architecture/:id`, `GET /architecture`, `GET /proposals/:id`,
   `GET /proposals` all added as thin wrappers, each hermetically tested
   individually in the existing style.
2. The end-to-end HTTP test described above passes using **only** the
   product's name as a hardcoded string — no `subsys.*`/`comp.*`/`cap.*`
   id literal anywhere in that test.
3. `operations[]`'s shape, and every existing route, are unchanged; all
   existing tests continue to pass unmodified.
4. `npm test` remains fully hermetic; typecheck clean.
5. The Report states plainly whether evidence supports leaving
   `operations[]` as-is or names a concrete, disclosed ergonomic gap for
   a future iteration to pick up — decided from what the exercise
   actually shows, not assumed in either direction here.

---

## Explicit Deferrals

- **Redesigning `operations[]`'s wire shape** (discriminated per-op
  JSON, friendlier field names) — only if this iteration's own evidence
  demonstrates read access alone is insufficient; not assumed either
  way in advance.
- **`change_operation`'s disclosed schema looseness** (mutual
  exclusivity across operation column groups, `docs/PROJECT_KNOWLEDGE.md`
  Unproven, Iteration 12) — unrelated, untouched; still a decision for
  whichever iteration adds a fourth operation type.
- **Work MCP and Repository MCP tool catalogs** — unrelated to
  Architecture authoring, still deferred since Iteration 3.
- **Any UI** — Iteration 14's territory; this iteration proves the API
  surface a UI would need, nothing more.
- **Authentication/authorization on these new endpoints** — the
  Security & Authorization Model is explicitly parked
  (`docs/ROADMAP.md`, "Standing awareness") and not to be acted on until
  it surfaces on its own; these endpoints are exactly as ungated as the
  existing `/architecture/:id/ancestry` route, no more and no less.
- **Pagination beyond a fixed cap** — same postponement §9.6 already
  states for MCP, applied here without re-litigating it.
- **`depend`, Decision/Constraint attachment, element renaming** —
  Iteration 12's own deferrals; still untouched, still pending a
  concrete scenario.
- **Technology Profiles** — unrelated, untouched.
