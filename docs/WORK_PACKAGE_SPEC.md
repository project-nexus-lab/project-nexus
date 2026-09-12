# Nexus Work Package Specification

## Purpose

A Work Package is the unit of execution consumed by agent runtimes.

Work Packages must be runtime-independent.

---

## Schema

id:
  WP-123

task:
  task.invoice-discount-validation

feature:
  feat.invoice-discounts

capabilities:
  - cap.invoice-discount

components:
  - comp.invoice-service

repositories:
  - repo.billing-service

files:
  - InvoiceService.java

constraints:
  - backward-compatible

acceptanceCriteria:
  - ac.discount-applied
  - ac.existing-behaviour-unchanged

decisions:
  - adr.discount-strategy-v1

relatedElements:
  - elementId: comp.upstream-service
    required: true

---

`relatedElements` (Iteration 11, `docs/history/iteration-11/SCOPE.md`):
optional. Elements outside the Work Package's own resolved/granted scope
that the task may still need, each tagged whether Nexus should treat a
refusal on it as blocking. Declared — not inferred from a run, and not
something an agent runtime ever writes or reads directly, and (Iteration
14a, `docs/history/iteration-14a/SCOPE.md`) not derived from graph
structure either: neither of this field's own two validating scenarios
(Iterations 9 and 11) encodes its required/optional distinction as a
graph edge, so automatic derivation was ruled out on direct evidence, not
merely left unbuilt. Since Iteration 14a, `buildWorkPackage()` populates
this field from `work.work_item_related_element`, a plain declared table
a human authors directly (matching `work.work_item_capability`'s own
shape) — omitted entirely from the payload when no rows are declared,
matching every Work Package before Iteration 14a byte-for-byte. Exists so
a runtime adapter can classify `RunBlocked` from declared relevance when
the field is present, falling back to prior behavior when it is absent.

---

## Context Construction

Work Packages are created from graph traversal.

Task
→ Capability
→ Component
→ Repository
→ File

Only required context should be included.

---

## Runtime Independence

Work Packages are owned by Nexus.

Agent runtimes consume Work Packages.

Agent runtimes must not modify Work Package schema.
