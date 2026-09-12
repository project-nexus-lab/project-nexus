# Iteration 15 Lessons

Not a status report (`docs/history/iteration-15/REPORT.md` is) and not a
roadmap. What this iteration's implementation proved, disproved, or left
exactly as open as it found it.

---

## Executive Summary

Iteration 15 made the two decisions an architecture-clarification session
deliberately left open before any Technology Profile schema existed: the
v1 field set, and the governance mechanism. Both survived implementation
unchanged from `docs/history/iteration-15/SCOPE.md`'s own reasoning — no
field needed re-adding, no governance approach needed reconsidering. The
one thing this iteration bet on being reusable without modification —
`ancestry()` (§8.4) — was, in fact, reusable without modification, on the
first real call three containment levels deep. What remains genuinely
untested is not this iteration's own mechanism but the one it deliberately
built on top of: whether citing an `architecture.decision` row is real
governance, given Decisions themselves have no governed creation path.

---

## Validated

### Assumption

Category-scoped assignments (`Product x Category -> Technology Profile`),
resolved by reusing the existing `ancestry()` traversal, require no new
traversal and no override/conflict-resolution logic, because there is
exactly one attachment point per category.

### Status

VALIDATED

### Evidence

`resolveTechnologyProfile()` calls `ancestry()` unmodified and looks up
`(product_id, category)` directly. Tested against `comp.invoice-service`,
three containment levels from `prod.trade-platform`
(Component → Subsystem → Domain → Product) — the resolved profile matched
the assigned one exactly, on the first real call, with zero changes
needed to `ancestry()` itself or to `graph/traversals.ts` generally.

### Consequence

Confirms the architecture-clarification session's own bet: this is a
single-attachment-point problem, not one that needs
`governanceOfElements`'s nearest-ancestor-wins machinery. Nothing in
`resolveTechnologyProfile`'s implementation needed that machinery, and
nothing about the real call surfaced a reason it might.

---

### Assumption

A small, data-driven `technology_category` reference table (mirroring
`architecture.legal_containment`'s own pattern) lets a future category be
added without a schema or CHECK-constraint change.

### Status

VALIDATED

### Evidence

`test/technology-profile.test.ts`: a fifth category (`mobile`, used only
inside that one test, never left in seed data) was added with a single
`insert` and nothing else — no migration, no constraint edit, no code
change anywhere.

### Consequence

The "no future redesign" requirement this table exists to satisfy is not
merely argued by analogy to `legal_containment`'s history — it is now
directly demonstrated for this specific table too.

---

### Assumption

Reusing `element_provision`'s `component_kind`/`capability_kind` composite-FK
idiom (a `check`-constrained kind column plus a composite foreign key to
`architecture.element (id, kind)`) is sufficient to enforce that
`product_technology_profile.product_id` names a real `product`-kind
element, without needing a new mechanism.

### Status

VALIDATED

### Evidence

`product_kind text not null default 'product' check (product_kind = 'product')`
plus `foreign key (product_id, product_kind) references architecture.element (id, kind)`
rejects a domain id (`dom.billing`) at the raw DB level
(`test/schema-constraints.test.ts`), independent of and in addition to
the friendlier `ProductNotFoundError` `assignTechnologyProfile` raises
first.

### Consequence

One more confirmation that this project's own established idioms
transfer directly to a new table without adaptation — the second time
this exact mechanism has been reused verbatim (`element_provision`
first, now `product_technology_profile`).

---

### Assumption

A cross-row consistency rule no single FK can express — that a profile
assigned to `(product, category)` actually carries that category itself —
can be enforced with a trigger, the same way `check_legal_containment`
enforces containment legality.

### Status

VALIDATED

### Evidence

`product_technology_profile_category_match` (a `before insert or update`
trigger) rejects a raw insert assigning a `backend`-category profile to
the `frontend` slot — tested by a direct insert that bypasses
`assignTechnologyProfile` entirely (`test/schema-constraints.test.ts`),
not merely through the wrapper function that also checks this.

### Consequence

The DB, not the TypeScript layer, is confirmed as the final word for
this invariant — consistent with this project's established discipline
(e.g. `element_provision`'s own primary-provider uniqueness, enforced by
a unique index, not application code).

---

## Unproven

### Assumption

Citing an existing, `accepted` `architecture.decision` row gives
Technology Profile governance genuine attribution — a real "who decided
this stack, and why" answer, not merely a citation that happens to point
somewhere.

### Why It Remains Unproven

`architecture.decision` itself has no governed creation path — every
Decision row that exists, including this iteration's own
`adr.backend-stack-java24-gradle`, is a direct insert, the same way
every prior Decision in this project's seed data has always been
created. Iteration 15's evidence shows only that the citation *check*
works (a nonexistent or non-`accepted` decision is rejected); it cannot
show that citing a decision, on its own, produces a real "Product Owner
proposes a new stack decision" governance workflow, because no such
workflow exists yet for Decisions at all. This is the same gap
Iteration 12 disclosed and explicitly left open when it closed the
equivalent gap for Elements via `provide`
(`docs/history/iteration-12/LESSONS.md`) — inherited here, not created
by this iteration, and not solved by it either.

### How To Validate

Build a real, governed Decision-creation path (draft → review → accept,
or something narrower) and observe whether Technology Profile governance
changes in any way once Decisions themselves carry that discipline — not
an experiment Technology Profiles alone can run, since the gap belongs
to `architecture.decision`, not to anything this iteration added.

---

### Assumption

`resolveTechnologyProfile`'s single fixed lookup at the Product remains
correct and fast at a scale beyond this project's own toy seed.

### Why It Remains Unproven

Only ever exercised against the seed dataset's own small tree
(`prod.trade-platform` with a handful of descendants). Iteration 10
validated the other eight named traversals at ~1,350 elements
specifically; `resolveTechnologyProfile` was never run at that scale,
and nothing about this iteration's own evidence speaks to it either way.

### How To Validate

Reuse Iteration 10's own graph-scale seeding approach
(`src/cli/investigate-graph-scale.ts`), assign profiles across a
meaningfully larger number of Products and categories, and confirm
`resolveTechnologyProfile` remains correct and fast — the same bar
already cleared for `ancestry()` itself, which this function calls
unmodified.

---

### Assumption

A second, real (non-scaffold) category — `frontend`, `infrastructure`,
or `data`, each actually populated with its own profile and assignment —
will not surface anything this schema's shape didn't anticipate.

### Why It Remains Unproven

v1 deliberately populates only `backend`. The category table itself
holds all four values, and the schema places no structural obstacle in
front of a second category — but that is an argument from design, not
from a second real example having actually been built and resolved.

### How To Validate

Add one real profile in a second category (e.g. `frontend`), assign it
to a Product that also has a `backend` assignment, and confirm
`resolveTechnologyProfile` returns the correct profile for each category
independently from the same Product — the most direct test of whether
"category-scoped, not flat" actually holds once more than one category
is real.

---

## Invalidated

None. Nothing this iteration attempted was disproven — every design
choice inherited from the architecture-clarification session and from
`docs/history/iteration-15/SCOPE.md` survived contact with real code and
a real, PGlite-backed test suite unchanged.

---

## Biggest Surprise

Not a surprise about Technology Profiles themselves — about the
error-message discipline this project already has. `resolveTechnologyProfile`'s
original not-found error read "ancestry() returned no 'product'
ancestor," phrased as if it named a structural anomaly. Checked against
`graph.ancestry()`'s actual SQL (a recursive CTE seeded by
`where e.id = p_element_id`): passing a `componentId` that simply doesn't
exist returns an empty result set through exactly the same code path as
the anomaly the message implied — by construction, given
`element_root_parent`, every *existing* element's ancestry chain
necessarily terminates in a product, so the message's literal claim
("no product ancestor") is in practice never true of a real element;
the overwhelmingly common real trigger is a typo'd or nonexistent id.
Caught during this iteration's own `/review` pass, not before — the same
kind of gap `docs/history/iteration-1/LESSONS.md`'s Consistency Auditor
exists to catch, here between a comment/error string and what the code
actually does, not between two documents.

---

## Final Verdict

**What does Project Nexus now know?** That category-scoped Technology
Profile assignments resolve correctly through the existing `ancestry()`
traversal with no new traversal or override logic; that the category
reference table, the composite-FK product-kind check, and the
cross-row category-match trigger — all direct reuses of this project's
own established idioms — transfer to a new table without adaptation;
and that the v1 field set and governance mechanism decided ahead of
implementation both survived contact with real code unchanged.

**What does Project Nexus still only believe?** That citing an
`architecture.decision` row is sufficient governance in practice, given
Decisions themselves have no governed creation path (Open Question #7);
that this mechanism holds at real scale; and that a second real category
will behave as the schema's shape predicts.

**What architectural bets remain highest risk?** Whether the
Decision-citation requirement, once a real PO workflow eventually needs
to *create* a Decision rather than cite a pre-seeded one, turns out to
need more than `architecture.decision` currently offers — a risk this
iteration inherited and disclosed, not one it introduced or resolved.
