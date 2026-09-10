import type { SqlExecutor } from "../db/sql-executor.js";
import { assertPrefixMatchesKind } from "../ids/ids.js";
import { ArchitectureYaml } from "./schema.js";

/**
 * Architecture YAML import (Iteration 0 deliverable #4).
 *
 * Insert order respects containment (parent before child) so the DB's own
 * legal-containment trigger (§7.3) is the final word — this function does not
 * duplicate that rule, it only orders statements so the trigger can fire
 * against an already-present parent.
 */
export async function importArchitecture(
  db: SqlExecutor,
  doc: unknown,
): Promise<{ elements: number; provides: number; dependsOn: number; decisions: number; constraints: number }> {
  const data = ArchitectureYaml.parse(doc);

  for (const p of data.products) {
    assertPrefixMatchesKind(p.id, "product");
    await db.query(
      `insert into architecture.element (id, kind, parent_id, name) values ($1, 'product', null, $2)`,
      [p.id, p.name],
    );
  }
  for (const d of data.domains) {
    assertPrefixMatchesKind(d.id, "domain");
    await db.query(
      `insert into architecture.element (id, kind, parent_id, name) values ($1, 'domain', $2, $3)`,
      [d.id, d.parent, d.name],
    );
  }
  for (const s of data.subsystems) {
    assertPrefixMatchesKind(s.id, "subsystem");
    await db.query(
      `insert into architecture.element (id, kind, parent_id, name) values ($1, 'subsystem', $2, $3)`,
      [s.id, s.parent, s.name],
    );
  }
  for (const c of data.components) {
    assertPrefixMatchesKind(c.id, "component");
    await db.query(
      `insert into architecture.element (id, kind, parent_id, name) values ($1, 'component', $2, $3)`,
      [c.id, c.parent, c.name],
    );
  }
  for (const c of data.capabilities) {
    assertPrefixMatchesKind(c.id, "capability");
    await db.query(
      `insert into architecture.element (id, kind, parent_id, name) values ($1, 'capability', $2, $3)`,
      [c.id, c.parent, c.name],
    );
  }

  for (const p of data.provides) {
    await db.query(
      `insert into architecture.element_provision (component_id, capability_id, is_primary)
       values ($1, $2, $3)`,
      [p.component, p.capability, p.primary],
    );
  }

  for (const d of data.dependsOn) {
    await db.query(
      `insert into architecture.element_dependency (from_id, to_id) values ($1, $2)`,
      [d.from, d.to],
    );
  }

  for (const dec of data.decisions) {
    await db.query(
      `insert into architecture.decision (id, title, status, statement) values ($1, $2, $3, $4)`,
      [dec.id, dec.title, dec.status, dec.statement],
    );
    for (const elementId of dec.governs) {
      await db.query(
        `insert into architecture.decision_scope (decision_id, element_id) values ($1, $2)`,
        [dec.id, elementId],
      );
    }
  }

  for (const con of data.constraints) {
    await db.query(
      `insert into architecture.constraint_def (id, title, statement) values ($1, $2, $3)`,
      [con.id, con.title, con.statement],
    );
    for (const elementId of con.appliesTo) {
      await db.query(
        `insert into architecture.element_constraint (element_id, constraint_id) values ($1, $2)`,
        [elementId, con.id],
      );
    }
  }

  return {
    elements:
      data.products.length +
      data.domains.length +
      data.subsystems.length +
      data.components.length +
      data.capabilities.length,
    provides: data.provides.length,
    dependsOn: data.dependsOn.length,
    decisions: data.decisions.length,
    constraints: data.constraints.length,
  };
}
