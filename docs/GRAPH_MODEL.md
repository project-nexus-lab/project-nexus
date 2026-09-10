# Nexus Graph Model

## Principles

Nexus is a graph-driven platform.

All entities are represented as graph nodes.

Relationships are represented as graph edges.

All nodes use stable identifiers.

Names may change.

Identifiers must not.

---

## Core Entity Hierarchy

Product
→ Domain
→ Subsystem
→ Component
→ Capability

Work entities:

Initiative
→ Epic
→ Feature
→ Task

Implementation entities:

Repository
→ File

---

## Identifier Strategy

Examples:

prod.trade-platform

dom.billing

subsys.invoice

comp.invoice-service

cap.create-invoice

repo.billing-service

feat.invoice-discounts

task.invoice-discount-validation

Identifiers are immutable.

---

## Relationships

Product
    contains
        Domain

Domain
    contains
        Subsystem

Subsystem
    contains
        Component

Component
    provides
        Capability

Component
    dependsOn
        Component

Repository
    implements
        Component

Task
    affects
        Capability

Task
    implementedIn
        Repository

Repository
    contains
        File

---

## Traversal Rules

Primary implementation path:

Task
→ Capability
→ Component
→ Repository
→ File

Primary impact path:

Component
→ dependsOn
→ Component

Context retrieval should follow graph traversal.

Document search is discouraged.

