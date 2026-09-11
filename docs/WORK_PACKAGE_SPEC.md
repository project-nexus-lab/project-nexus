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
refusal on it as blocking. Declared at Work Package construction time —
not inferred from a run, and not something an agent runtime ever writes
or reads directly. As of Iteration 11, `buildWorkPackage()` does not yet
populate this field from the graph; it exists so a runtime adapter can
classify `RunBlocked` from declared relevance when the field is present,
falling back to prior behavior when it is absent.

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
