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
