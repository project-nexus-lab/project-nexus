# Nexus Review Principles

This document is not part of the architecture model. It describes how
Nexus changes are evaluated and how project knowledge is maintained over
time — process, not domain.

It must align with, and never contradict:

- `docs/NEXUS_CONSTITUTION.md` — the Constitution Reviewer exists to
  protect this document specifically; nothing below grants authority this
  document doesn't already have.
- `docs/GRAPH_MODEL.md`, `docs/WORK_PACKAGE_SPEC.md`,
  `docs/REPOSITORY_MODEL.md`, `docs/AGENT_RUNTIME_MODEL.md` — the
  supporting model documents the Domain Integrity Reviewer checks proposed
  changes against.
- `docs/MVP_ARCHITECTURE_V2.md` — the current architecture; what the
  Constitution and supporting models are applied *through* at this stage
  of the platform.
- `docs/PROJECT_KNOWLEDGE.md` — the living output this process exists to
  produce and keep current. This document defines the process;
  `PROJECT_KNOWLEDGE.md` holds the result.

If anything below ever appears to conflict with one of those documents,
that document wins — see Knowledge Distillation Rule.

---

## Purpose

Project Nexus optimizes for evidence-driven evolution rather than
assumption-driven evolution — a platform whose own Constitution insists on
graph-centric modelling, stable identifiers, and one system of truth
should not evolve by whichever change feels reasonable at the time.
Formal review lenses exist because different failure modes are invisible
from different vantage points: a change can be constitutionally sound and
still blur a bounded context; it can respect every boundary and still be
complexity nobody asked for; it can be simple and coherent and still rest
on nothing but belief. One reviewer per failure mode, applied to every
significant change, catches what a single generalist pass reliably misses.

Knowledge capture exists for the same reason applied to time instead of
to a single change: implementation teaches things the architecture
documents didn't anticipate — Iteration 0 alone invalidated two
assumptions that looked correct until they were built (see
`docs/history/iteration-0/LESSONS.md`). Without a discipline that captures
this, each iteration re-learns what the last one already knew, or worse,
re-asserts something the last one already disproved.

---

## Review Framework

Before accepting major changes, evaluate them through four reviewers.
These are logical reviewers — implement them as subagents, separate
review passes, or distinct report sections, whichever fits the change.

### Constitution Reviewer

Protects:

- the Nexus Constitution
- the authority hierarchy
- source-of-truth rules
- stable ID principles
- runtime independence

Questions asked:

- Does this violate the Constitution?
- Has a second source of truth been introduced?
- Has architecture originated outside Nexus?
- Have stable ID principles been violated?
- Has runtime-specific knowledge leaked into the core domain?
- Have repositories become authoritative?

Expected output format: `PASS`, or `CONSTITUTIONAL CONCERNS` with specific
findings.

### Domain Integrity Reviewer

Protects:

- bounded contexts
- graph model integrity
- ownership boundaries
- relationship semantics

Questions asked:

- Are bounded contexts still coherent?
- Have context boundaries become blurred?
- Has Execution leaked into Architecture?
- Has Repository leaked into Architecture?
- Have Runtime concepts leaked into core models?
- Are relationships still explicit and graph-driven?

Expected output format: `PASS`, or `DOMAIN CONCERNS` with specific
findings.

### Simplicity Reviewer

Protects against:

- unnecessary abstractions
- premature flexibility
- speculative complexity
- over-engineering

Questions asked:

- Can this be deleted?
- Can this be postponed?
- Can this be configuration instead of structure?
- Can two concepts become one concept?
- Is this solving a current problem or a hypothetical future problem?
- Has a new abstraction earned its existence?

Expected output format: `PASS`, or `SIMPLICITY CONCERNS` with specific
findings.

### Evidence Reviewer

Separates:

- `VALIDATED`
- `UNPROVEN`
- `INVALIDATED`

Questions asked:

- Is this validated?
- Is it only believed?
- What evidence supports it?
- What experiment would validate it?
- Has implementation confirmed it?
- Has implementation disproved it?

Expected output format: findings grouped under `VALIDATED`, `UNPROVEN`,
and `INVALIDATED`, each with supporting evidence.

---

## Architecture Critic

When reviewing architecture, activate an Architecture Critic perspective.

The critic's purpose is not to design solutions. The critic's purpose is
to discover deep flaws.

Focus:

- authority violations
- duplicate truths
- hidden coupling
- unclear ownership
- unsupported assumptions

Prefer one major flaw, argued fully, over many minor comments.

---

## Iteration Discipline

Every iteration must produce both of the following. Implementation
without captured learning is considered incomplete.

### Report

Location: `docs/history/iteration-N/REPORT.md`

Purpose: describe what was implemented — scope completed, scope
deferred, architectural deviations, technical debt intentionally created,
demonstrations and verification, recommended next-step validation.

### Lessons

Location: `docs/history/iteration-N/LESSONS.md`

Purpose: capture evidence and learning. Classify findings as `VALIDATED`,
`UNPROVEN`, or `INVALIDATED`. Focus on assumptions, discoveries,
architectural learning, and implementation learning. Avoid roadmap
content — a Lessons document argues from evidence, not toward a plan.

---

## Project Knowledge Maintenance

`docs/PROJECT_KNOWLEDGE.md` is the living knowledge base — the current,
distilled understanding of the project. It must contain only:

### Validated

Things demonstrated by implementation.

### Unproven

Things still considered hypotheses.

### Invalidated

Things disproven through implementation.

### Open Questions

Important unresolved issues.

Historical iteration documents are evidence. `PROJECT_KNOWLEDGE.md` is the
current distilled understanding of the project — the two are not
interchangeable, and the second is never a substitute for reading the
first when the detail matters (see Knowledge Distillation Rule).

---

## Knowledge Distillation Rule

Historical documents are never authoritative. Authority order:

1. `docs/NEXUS_CONSTITUTION.md`
2. Supporting model documents
3. Current architecture documents
4. `docs/PROJECT_KNOWLEDGE.md`
5. Historical iteration reports

The process that produces this order:

```
Iteration Work → Report → Lessons → Project Knowledge
```

Each step distills, it does not merely relay. A Report is a narrative
account of what happened. Lessons extract what that narrative proved,
disproved, or left open. Project Knowledge keeps only the current,
cumulative shape of what's proven, disproven, or open — not the narrative
that produced it. Knowledge should become more distilled, not more
voluminous, as it moves through this chain. Iteration reports must inform
`docs/PROJECT_KNOWLEDGE.md`. They must not replace it, and it must not
grow into a second copy of them.

---

## Change Acceptance Rule

A significant change should only be accepted if:

- Constitution Reviewer passes
- Domain Integrity Reviewer passes
- Simplicity Reviewer passes
- Evidence Reviewer classifies assumptions honestly

Explicitly identify what we know, what we believe, and what we have not
tested.

Project Nexus optimizes for evidence-driven evolution rather than
assumption-driven evolution. When uncertain:

- prefer learning over features
- prefer evidence over opinions
- prefer simplicity over flexibility
- prefer one source of truth over convenience
