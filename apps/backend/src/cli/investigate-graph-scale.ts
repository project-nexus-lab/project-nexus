/**
 * Iteration 10 (`docs/history/iteration-10/SCOPE.md`) — do the eight named
 * graph traversals hold up past toy scale? NOT part of `npm test`,
 * deliberately not named `verify-*`: the outcome is the open question this
 * script exists to gather evidence on.
 *
 * Generates two graphs from the *same* parameterized generator — one at
 * "scale" (~1,350 elements, several hundred `dependsOn` edges, ~150
 * decisions/constraints, 50 tasks/repositories), one "toy" (13 elements,
 * the same shape the existing test fixtures and other `investigate-*.ts`
 * scripts use) — so the timing comparison is the same query shape at two
 * sizes, not two differently-shaped graphs.
 *
 * A correction made while writing this, not assumed from
 * `docs/history/iteration-10/SCOPE.md`'s own "What We Know": reading
 * `db/migrations/0007_graph.sql` closely shows `ancestry`, `impactOf`, and
 * `resolve` all join on a recursive CTE column against the *leading*
 * column of an existing composite primary key (`element.id`,
 * `element_dependency(from_id,to_id)`, `element_succession(predecessor_id,
 * successor_id)` respectively) — each already gets an index-backed lookup
 * for free, contrary to the scope document's broader "no index exists on
 * parent_id/from_id/predecessor_id" framing. The genuinely uncovered
 * columns are ones queried on the *non-leading* half of a composite key:
 * `element_provision.capability_id` (`providersOf`, PK is
 * `(component_id, capability_id)`), `decision_scope.element_id`
 * (`governanceOf`, PK is `(decision_id, element_id)`), and
 * `repository_component.component_id` (`implementationPath`, PK is
 * `(repository_id, component_id)`). `element_constraint.element_id` is,
 * contrary to the same broad framing, already the *leading* column of its
 * own PK — also covered. This is disclosed here, not silently corrected,
 * because it changes which three traversals are this investigation's real
 * suspects rather than all eight equally.
 *
 * A second correction, also made while writing this: the scope document's
 * `governanceOfElements` concern assumed its anchor set widens with a
 * profile's `context_depth` (via `impactOf`). Reading
 * `src/workpackage/build.ts` directly shows this is not so — Step 4's
 * `impactOf`-widened `impactedComponents` feeds a separate, future
 * MCP-grant field and is never merged into `anchorElementIds` (Step 6).
 * The real lever for a large anchor set is a task affecting many
 * capabilities directly (`work.work_item_capability`), not profile
 * widening — this script tests both a typical single-capability task and
 * one task deliberately affecting many, matching `build.ts`'s actual
 * construction exactly rather than a plausible-sounding guess at it.
 *
 * Uses two separate in-memory databases, same choice every other
 * `investigate-*.ts` script has made: this script's evidence is the
 * measurements and correctness checks printed below, not an accumulating
 * record.
 */

import { performance } from "node:perf_hooks";
import { openDb } from "../db/client.js";
import type { NexusDb } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import type { SqlExecutor } from "../db/sql-executor.js";
import {
  ancestry,
  capabilitiesOf,
  governanceOf,
  governanceOfElements,
  implementationPath,
  impactOf,
  localSubgraph,
  providersOf,
  resolve,
} from "../graph/traversals.js";

console.log("=== Iteration 10: do the graph traversals hold up past toy scale? ===\n");

// --- Graph generator -------------------------------------------------------

interface GraphParams {
  label: string;
  domains: number;
  subsystemsPerDomain: number;
  componentsPerSubsystem: number;
  capabilitiesPerSubsystem: number;
  taskCount: number;
  wideTaskCapabilityCount: number;
}

interface GeneratedGraph {
  params: GraphParams;
  products: Array<{ id: string; name: string }>;
  domains: Array<{ id: string; parent: string; name: string }>;
  subsystems: Array<{ id: string; parent: string; name: string }>;
  components: Array<{ id: string; parent: string; name: string }>;
  capabilities: Array<{ id: string; parent: string; name: string }>;
  provisions: Array<{ component: string; capability: string; primary: boolean }>;
  dependencies: Array<{ from: string; to: string }>;
  decisions: Array<{ id: string; title: string; statement: string }>;
  constraints: Array<{ id: string; title: string; statement: string }>;
  decisionScopes: Array<{ decision: string; element: string }>;
  elementConstraints: Array<{ constraint: string; element: string }>;
  workItems: { initiative: string; epic: string; feature: string; tasks: string[] };
  wideTask: { id: string; capabilities: string[] };
  taskCapability: Map<string, string>;
  repositories: string[];
  repositoryComponents: Array<{ repository: string; component: string; primary: boolean }>;

  // JS-side ground truth, independent of the SQL traversals under test.
  parentOf: Map<string, string | null>;
  kindOf: Map<string, string>;
  nameOf: Map<string, string>;
  capsByComponent: Map<string, Array<{ capability: string; primary: boolean }>>;
  compsByCapability: Map<string, Array<{ component: string; primary: boolean }>>;
  depsFrom: Map<string, string[]>;
  governanceByElement: Map<string, { decisions: string[]; constraints: string[] }>;
  primaryComponentOfCapability: Map<string, string>;
  repoOfComponent: Map<string, string>;
  allComponentIds: string[];
  allCapabilityIds: string[];
}

function generateGraph(params: GraphParams): GeneratedGraph {
  const { domains: D, subsystemsPerDomain: S, componentsPerSubsystem: C, capabilitiesPerSubsystem: K } = params;

  const products = [{ id: "prod.scale", name: "Synthetic Product" }];
  const domains: GeneratedGraph["domains"] = [];
  const subsystems: GeneratedGraph["subsystems"] = [];
  const components: GeneratedGraph["components"] = [];
  const capabilities: GeneratedGraph["capabilities"] = [];

  const parentOf = new Map<string, string | null>();
  const kindOf = new Map<string, string>();
  const nameOf = new Map<string, string>();
  parentOf.set("prod.scale", null);
  kindOf.set("prod.scale", "product");
  nameOf.set("prod.scale", "Synthetic Product");

  for (let d = 0; d < D; d++) {
    const domId = `dom.d${d}`;
    domains.push({ id: domId, parent: "prod.scale", name: `Domain ${d}` });
    parentOf.set(domId, "prod.scale");
    kindOf.set(domId, "domain");
    nameOf.set(domId, `Domain ${d}`);

    for (let s = 0; s < S; s++) {
      const subId = `subsys.d${d}-s${s}`;
      subsystems.push({ id: subId, parent: domId, name: `Subsystem ${d}.${s}` });
      parentOf.set(subId, domId);
      kindOf.set(subId, "subsystem");
      nameOf.set(subId, `Subsystem ${d}.${s}`);

      for (let c = 0; c < C; c++) {
        const compId = `comp.d${d}-s${s}-c${c}`;
        components.push({ id: compId, parent: subId, name: `Component ${d}.${s}.${c}` });
        parentOf.set(compId, subId);
        kindOf.set(compId, "component");
        nameOf.set(compId, `Component ${d}.${s}.${c}`);
      }
      for (let k = 0; k < K; k++) {
        const capId = `cap.d${d}-s${s}-k${k}`;
        capabilities.push({ id: capId, parent: subId, name: `Capability ${d}.${s}.${k}` });
        parentOf.set(capId, subId);
        kindOf.set(capId, "capability");
        nameOf.set(capId, `Capability ${d}.${s}.${k}`);
      }
    }
  }

  const allComponentIds = components.map((c) => c.id);
  const allCapabilityIds = capabilities.map((c) => c.id);

  // --- Provisions: each component primarily provides its own-index
  // capability within the same subsystem, plus non-primary provision of
  // two capabilities in neighbouring subsystems (cross-subsystem sharing,
  // the realistic shape of a shared component) when enough subsystems exist.
  const provisions: GeneratedGraph["provisions"] = [];
  const capsByComponent = new Map<string, Array<{ capability: string; primary: boolean }>>();
  const compsByCapability = new Map<string, Array<{ component: string; primary: boolean }>>();
  const primaryComponentOfCapability = new Map<string, string>();

  function addProvision(component: string, capability: string, primary: boolean) {
    provisions.push({ component, capability, primary });
    if (!capsByComponent.has(component)) capsByComponent.set(component, []);
    capsByComponent.get(component)!.push({ capability, primary });
    if (!compsByCapability.has(capability)) compsByCapability.set(capability, []);
    compsByCapability.get(capability)!.push({ component, primary });
    if (primary) primaryComponentOfCapability.set(capability, component);
  }

  const totalSubsystems = D * S;
  for (let d = 0; d < D; d++) {
    for (let s = 0; s < S; s++) {
      const subsystemIndex = d * S + s;
      for (let i = 0; i < Math.min(C, K); i++) {
        const compId = `comp.d${d}-s${s}-c${i}`;
        const capId = `cap.d${d}-s${s}-k${i}`;
        addProvision(compId, capId, true);

        if (totalSubsystems > 1) {
          for (const offset of [1, 3]) {
            const otherIndex = (subsystemIndex + offset) % totalSubsystems;
            const od = Math.floor(otherIndex / S);
            const os = otherIndex % S;
            const otherCapId = `cap.d${od}-s${os}-k${i % K}`;
            if (allCapabilityIds.includes(otherCapId) && otherCapId !== capId) {
              addProvision(compId, otherCapId, false);
            }
          }
        }
      }
    }
  }

  // --- Dependencies: a long chain across all components (exercises
  // impactOf at real multi-hop depth) plus two shortcut rules for fan-out,
  // plus local within-subsystem coupling. Forward-only by construction
  // (higher global index depends on nothing "behind" it via the shortcut
  // rules; the chain and local rules are also forward-only) — deliberately
  // acyclic, so `impactOf`'s bounded-depth CTE has a real, computable
  // ground truth via a plain BFS, not one that could loop.
  const dependencies: GeneratedGraph["dependencies"] = [];
  const depsFrom = new Map<string, string[]>();
  const seenEdges = new Set<string>();
  function addEdge(from: string, to: string) {
    if (from === to) return;
    const key = `${from}|${to}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    dependencies.push({ from, to });
    if (!depsFrom.has(from)) depsFrom.set(from, []);
    depsFrom.get(from)!.push(to);
  }

  for (let i = 0; i < allComponentIds.length - 1; i++) {
    addEdge(allComponentIds[i]!, allComponentIds[i + 1]!);
  }
  for (let i = 0; i < allComponentIds.length; i++) {
    if (i % 3 === 0 && i + 15 < allComponentIds.length) addEdge(allComponentIds[i]!, allComponentIds[i + 15]!);
    if (i % 5 === 0 && i + 37 < allComponentIds.length) addEdge(allComponentIds[i]!, allComponentIds[i + 37]!);
  }
  // Local, within-subsystem coupling: component c depends on c+1 and c+2
  // in its own subsystem, a realistic "siblings call each other" shape
  // distinct from the cross-graph chain above. Forward-only, no modulo
  // wraparound — a wraparound (c+offset) % C would close each subsystem's
  // component ring into a cycle (e.g. c8->c0), which would make impactOf's
  // non-deduplicating recursive CTE (every distinct path, not shortest-path
  // per node — confirmed by reading db/migrations/0007_graph.sql's
  // impact_of directly) revisit the cycle repeatedly within the depth cap,
  // producing a combinatorial number of duplicate rows. That is itself a
  // real, useful thing to know about impact_of's behavior on a cyclic
  // dependency graph — but it is not this iteration's question, and a
  // graph that accidentally contains it produces no usable ground truth
  // for a plain BFS. Kept acyclic on purpose, matching this script's own
  // stated design.
  for (let d = 0; d < D; d++) {
    for (let s = 0; s < S; s++) {
      for (let c = 0; c < C; c++) {
        const from = `comp.d${d}-s${s}-c${c}`;
        for (const offset of [1, 2]) {
          if (c + offset >= C) continue;
          const to = `comp.d${d}-s${s}-c${c + offset}`;
          addEdge(from, to);
        }
      }
    }
  }

  // --- Decisions / constraints, scattered across containment depths:
  // one per subsystem, one per domain, one per every 8th component /
  // capability.
  const decisions: GeneratedGraph["decisions"] = [];
  const constraints: GeneratedGraph["constraints"] = [];
  const decisionScopes: GeneratedGraph["decisionScopes"] = [];
  const elementConstraints: GeneratedGraph["elementConstraints"] = [];
  const governanceByElement = new Map<string, { decisions: string[]; constraints: string[] }>();

  function attachDecision(id: string, targetElement: string) {
    decisionScopes.push({ decision: id, element: targetElement });
    if (!governanceByElement.has(targetElement)) governanceByElement.set(targetElement, { decisions: [], constraints: [] });
    governanceByElement.get(targetElement)!.decisions.push(id);
  }
  function attachConstraint(id: string, targetElement: string) {
    elementConstraints.push({ constraint: id, element: targetElement });
    if (!governanceByElement.has(targetElement)) governanceByElement.set(targetElement, { decisions: [], constraints: [] });
    governanceByElement.get(targetElement)!.constraints.push(id);
  }

  let decisionCounter = 0;
  let constraintCounter = 0;
  for (const dom of domains) {
    const id = `adr.scale-${decisionCounter++}`;
    decisions.push({ id, title: `Decision for ${dom.id}`, statement: "Synthetic decision for scale testing." });
    attachDecision(id, dom.id);
    const cid = `con.scale-${constraintCounter++}`;
    constraints.push({ id: cid, title: `Constraint for ${dom.id}`, statement: "Synthetic constraint for scale testing." });
    attachConstraint(cid, dom.id);
  }
  for (const sub of subsystems) {
    const id = `adr.scale-${decisionCounter++}`;
    decisions.push({ id, title: `Decision for ${sub.id}`, statement: "Synthetic decision for scale testing." });
    attachDecision(id, sub.id);
    const cid = `con.scale-${constraintCounter++}`;
    constraints.push({ id: cid, title: `Constraint for ${sub.id}`, statement: "Synthetic constraint for scale testing." });
    attachConstraint(cid, sub.id);
  }
  for (let i = 0; i < components.length; i += 8) {
    const comp = components[i]!;
    const id = `adr.scale-${decisionCounter++}`;
    decisions.push({ id, title: `Decision for ${comp.id}`, statement: "Synthetic decision for scale testing." });
    attachDecision(id, comp.id);
  }
  for (let i = 0; i < capabilities.length; i += 8) {
    const cap = capabilities[i]!;
    const cid = `con.scale-${constraintCounter++}`;
    constraints.push({ id: cid, title: `Constraint for ${cap.id}`, statement: "Synthetic constraint for scale testing." });
    attachConstraint(cid, cap.id);
  }

  // --- Work hierarchy + repositories: one initiative/epic/feature, N
  // tasks spread evenly across the generated capabilities, each mapped to
  // a distinct repository via its capability's primary provider.
  const initiative = "init.scale";
  const epic = "epic.scale";
  const feature = "feat.scale";
  const tasks: string[] = [];
  const taskCapability = new Map<string, string>();
  const repositories: string[] = [];
  const repositoryComponents: GeneratedGraph["repositoryComponents"] = [];
  const repoOfComponent = new Map<string, string>();

  const taskStep = Math.max(1, Math.floor(allCapabilityIds.length / params.taskCount));
  for (let i = 0; i < params.taskCount; i++) {
    const taskId = `task.scale-${i}`;
    tasks.push(taskId);
    const capId = allCapabilityIds[(i * taskStep) % allCapabilityIds.length]!;
    taskCapability.set(taskId, capId);

    const repoId = `repo.scale-${i}`;
    repositories.push(repoId);
    const primaryComponent = primaryComponentOfCapability.get(capId);
    if (primaryComponent) {
      repositoryComponents.push({ repository: repoId, component: primaryComponent, primary: true });
      repoOfComponent.set(primaryComponent, repoId);
    }
  }

  // One additional task affecting *many* capabilities directly — the real
  // lever for a large `governanceOfElements` anchor set, per `build.ts`
  // Step 3/6, not `impactOf`/`context_depth` widening (Step 4's
  // `impactedComponents` feeds a separate, future MCP-grant field and is
  // never merged into `anchorElementIds` — confirmed by reading `build.ts`
  // directly while writing this investigation, correcting this scope's own
  // earlier assumption; see the top-of-file doc comment).
  const wideTaskId = "task.scale-wide";
  const wideTaskCapabilities = sample(allCapabilityIds, params.wideTaskCapabilityCount);

  return {
    params,
    products,
    domains,
    subsystems,
    components,
    capabilities,
    provisions,
    dependencies,
    decisions,
    constraints,
    decisionScopes,
    elementConstraints,
    workItems: { initiative, epic, feature, tasks },
    wideTask: { id: wideTaskId, capabilities: wideTaskCapabilities },
    taskCapability,
    repositories,
    repositoryComponents,
    parentOf,
    kindOf,
    nameOf,
    capsByComponent,
    compsByCapability,
    depsFrom,
    governanceByElement,
    primaryComponentOfCapability,
    repoOfComponent,
    allComponentIds,
    allCapabilityIds,
  };
}

// --- Seeding -----------------------------------------------------------

async function bulkInsert(db: SqlExecutor, sql: (placeholders: string) => string, rows: unknown[][], chunkSize = 500): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const width = chunk[0]!.length;
    const placeholders = chunk
      .map((_, r) => `(${Array.from({ length: width }, (_, c) => `$${r * width + c + 1}`).join(",")})`)
      .join(",");
    const params = chunk.flat();
    await db.query(sql(placeholders), params);
  }
}

async function seedGraph(db: NexusDb, g: GeneratedGraph): Promise<void> {
  await db.transaction(async (tx) => {
    await bulkInsert(tx, (ph) => `insert into architecture.element (id, kind, parent_id, name) values ${ph}`,
      g.products.map((p) => [p.id, "product", null, p.name]));
    await bulkInsert(tx, (ph) => `insert into architecture.element (id, kind, parent_id, name) values ${ph}`,
      g.domains.map((d) => [d.id, "domain", d.parent, d.name]));
    await bulkInsert(tx, (ph) => `insert into architecture.element (id, kind, parent_id, name) values ${ph}`,
      g.subsystems.map((s) => [s.id, "subsystem", s.parent, s.name]));
    await bulkInsert(tx, (ph) => `insert into architecture.element (id, kind, parent_id, name) values ${ph}`,
      g.components.map((c) => [c.id, "component", c.parent, c.name]));
    await bulkInsert(tx, (ph) => `insert into architecture.element (id, kind, parent_id, name) values ${ph}`,
      g.capabilities.map((c) => [c.id, "capability", c.parent, c.name]));

    await bulkInsert(tx, (ph) => `insert into architecture.element_provision (component_id, capability_id, is_primary) values ${ph}`,
      g.provisions.map((p) => [p.component, p.capability, p.primary]));
    await bulkInsert(tx, (ph) => `insert into architecture.element_dependency (from_id, to_id) values ${ph}`,
      g.dependencies.map((d) => [d.from, d.to]));

    await bulkInsert(tx, (ph) => `insert into architecture.decision (id, title, statement) values ${ph}`,
      g.decisions.map((d) => [d.id, d.title, d.statement]));
    await bulkInsert(tx, (ph) => `insert into architecture.constraint_def (id, title, statement) values ${ph}`,
      g.constraints.map((c) => [c.id, c.title, c.statement]));
    await bulkInsert(tx, (ph) => `insert into architecture.decision_scope (decision_id, element_id) values ${ph}`,
      g.decisionScopes.map((s) => [s.decision, s.element]));
    await bulkInsert(tx, (ph) => `insert into architecture.element_constraint (element_id, constraint_id) values ${ph}`,
      g.elementConstraints.map((s) => [s.element, s.constraint]));

    await tx.query(`insert into work.work_item (id, kind, parent_id, title) values ($1, 'initiative', null, $2)`, [
      g.workItems.initiative, "Synthetic Initiative",
    ]);
    await tx.query(`insert into work.work_item (id, kind, parent_id, title) values ($1, 'epic', $2, $3)`, [
      g.workItems.epic, g.workItems.initiative, "Synthetic Epic",
    ]);
    await tx.query(`insert into work.work_item (id, kind, parent_id, title) values ($1, 'feature', $2, $3)`, [
      g.workItems.feature, g.workItems.epic, "Synthetic Feature",
    ]);
    await bulkInsert(tx, (ph) => `insert into work.work_item (id, kind, parent_id, title) values ${ph}`,
      g.workItems.tasks.map((t) => [t, "task", g.workItems.feature, `Synthetic ${t}`]));
    await bulkInsert(tx, (ph) => `insert into work.work_item_capability (work_item_id, capability_id) values ${ph}`,
      g.workItems.tasks.map((t) => [t, g.taskCapability.get(t)]));

    await tx.query(`insert into work.work_item (id, kind, parent_id, title) values ($1, 'task', $2, $3)`, [
      g.wideTask.id, g.workItems.feature, `Synthetic ${g.wideTask.id}`,
    ]);
    await bulkInsert(tx, (ph) => `insert into work.work_item_capability (work_item_id, capability_id) values ${ph}`,
      g.wideTask.capabilities.map((c) => [g.wideTask.id, c]));

    await bulkInsert(tx, (ph) => `insert into repo.repository (id, name, provider) values ${ph}`,
      g.repositories.map((r) => [r, `Synthetic ${r}`, "synthetic"]));
    await bulkInsert(tx, (ph) => `insert into repo.repository_component (repository_id, component_id, is_primary) values ${ph}`,
      g.repositoryComponents.map((r) => [r.repository, r.component, r.primary]));
  });
}

// --- Correctness checking ------------------------------------------------

let checksPassed = 0;
let checksFailed = 0;
const failureExamples: string[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    checksPassed++;
  } else {
    checksFailed++;
    if (failureExamples.length < 10) failureExamples.push(`${name}: expected ${e}, got ${a}`);
  }
}

function sortedIds<T extends { component_id?: string; capability_id?: string }>(rows: T[], key: "component_id" | "capability_id"): string[] {
  return rows.map((r) => r[key]!).sort();
}

function jsAncestryChain(g: GeneratedGraph, id: string): Array<{ id: string; kind: string; name: string; depth: number }> {
  const out: Array<{ id: string; kind: string; name: string; depth: number }> = [];
  let cur: string | null = id;
  let depth = 0;
  while (cur !== null) {
    out.push({ id: cur, kind: g.kindOf.get(cur)!, name: g.nameOf.get(cur)!, depth });
    cur = g.parentOf.get(cur) ?? null;
    depth++;
  }
  return out;
}

function jsGovernanceUnion(g: GeneratedGraph, elementIds: string[]): { decisions: string[]; constraints: string[] } {
  const nearestDepth = new Map<string, number>();
  for (const elementId of elementIds) {
    const chain = jsAncestryChain(g, elementId);
    for (const { id, depth } of chain) {
      const gov = g.governanceByElement.get(id);
      if (!gov) continue;
      for (const d of gov.decisions) {
        const key = `d:${d}`;
        const existing = nearestDepth.get(key);
        if (existing === undefined || depth < existing) nearestDepth.set(key, depth);
      }
      for (const c of gov.constraints) {
        const key = `c:${c}`;
        const existing = nearestDepth.get(key);
        if (existing === undefined || depth < existing) nearestDepth.set(key, depth);
      }
    }
  }
  const decisions: string[] = [];
  const constraints: string[] = [];
  for (const key of nearestDepth.keys()) {
    if (key.startsWith("d:")) decisions.push(key.slice(2));
    else constraints.push(key.slice(2));
  }
  return { decisions: decisions.sort(), constraints: constraints.sort() };
}

/**
 * `graph.impact_of`'s recursive CTE (`db/migrations/0007_graph.sql`) does
 * not deduplicate by node — it expands every distinct path up to
 * `p_depth`, so a component reachable via two different paths appears as
 * two separate rows, possibly at two different distances. Confirmed by
 * running this script once against a first-draft ground truth that
 * assumed shortest-path deduplication (a plain BFS): it disagreed with
 * every multi-path case. This enumerates paths the same way the CTE does
 * — not an idealized "what impactOf should do," a match for "what it
 * actually, already does," since that is what this iteration is checking
 * for regressions in, not redesigning.
 */
function enumeratePathsImpact(g: GeneratedGraph, componentId: string, depth: number): Array<{ component_id: string; distance: number }> {
  const out: Array<{ component_id: string; distance: number }> = [];
  function walk(node: string, distance: number): void {
    if (distance > 0) out.push({ component_id: node, distance });
    if (distance < depth) {
      for (const to of g.depsFrom.get(node) ?? []) walk(to, distance + 1);
    }
  }
  walk(componentId, 0);
  return out.sort((a, b) => (a.component_id === b.component_id ? a.distance - b.distance : a.component_id < b.component_id ? -1 : 1));
}

function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = Math.max(1, Math.floor(arr.length / n));
  const out: T[] = [];
  for (let i = 0; i < arr.length && out.length < n; i += step) out.push(arr[i]!);
  return out;
}

// --- Timing ---------------------------------------------------------------

async function timeSampled<T>(ids: string[], call: (id: string) => Promise<T>): Promise<{ avgMs: number; totalMs: number; results: T[] }> {
  // Warmup: run once and discard, so query-plan caching does not bias the
  // first timed call.
  if (ids.length > 0) await call(ids[0]!);
  const results: T[] = [];
  const start = performance.now();
  for (const id of ids) results.push(await call(id));
  const totalMs = performance.now() - start;
  return { avgMs: ids.length > 0 ? totalMs / ids.length : 0, totalMs, results };
}

// --- Investigation over one graph -----------------------------------------

async function investigate(db: NexusDb, g: GeneratedGraph, sampleSize: number): Promise<void> {
  console.log(`\n--- ${g.params.label} (${g.components.length + g.capabilities.length + g.domains.length + g.subsystems.length + g.products.length} elements, ${g.provisions.length} provisions, ${g.dependencies.length} dependencies, ${g.decisions.length + g.constraints.length} decisions+constraints, ${g.workItems.tasks.length} tasks) ---`);

  const componentSample = sample(g.allComponentIds, sampleSize);
  const capabilitySample = sample(g.allCapabilityIds, sampleSize);
  const elementSample = sample([...g.allComponentIds, ...g.allCapabilityIds], sampleSize);

  // ancestry
  const anc = await timeSampled(elementSample, (id) => ancestry(db, id));
  for (let i = 0; i < elementSample.length; i++) {
    const expected = jsAncestryChain(g, elementSample[i]!);
    check(`ancestry(${elementSample[i]})`, anc.results[i], expected);
  }
  console.log(`ancestry:            avg ${anc.avgMs.toFixed(3)}ms/call over ${elementSample.length} calls`);

  // providersOf
  const prov = await timeSampled(capabilitySample, (id) => providersOf(db, id));
  for (let i = 0; i < capabilitySample.length; i++) {
    const capId = capabilitySample[i]!;
    const expected = (g.compsByCapability.get(capId) ?? [])
      .map((p) => ({ component_id: p.component, is_primary: p.primary }))
      .sort((a, b) => (a.component_id < b.component_id ? -1 : 1));
    const actualSorted = prov.results[i]!
      .map((r) => ({ component_id: r.component_id, is_primary: r.is_primary }))
      .sort((a, b) => (a.component_id < b.component_id ? -1 : 1));
    check(`providersOf(${capId})`, actualSorted, expected);
  }
  console.log(`providersOf:         avg ${prov.avgMs.toFixed(3)}ms/call over ${capabilitySample.length} calls`);

  // capabilitiesOf
  const capsOf = await timeSampled(componentSample, (id) => capabilitiesOf(db, id));
  for (let i = 0; i < componentSample.length; i++) {
    const compId = componentSample[i]!;
    const expected = (g.capsByComponent.get(compId) ?? [])
      .map((c) => ({ capability_id: c.capability, is_primary: c.primary }))
      .sort((a, b) => (a.capability_id < b.capability_id ? -1 : 1));
    const actualSorted = capsOf.results[i]!
      .map((r) => ({ capability_id: r.capability_id, is_primary: r.is_primary }))
      .sort((a, b) => (a.capability_id < b.capability_id ? -1 : 1));
    check(`capabilitiesOf(${compId})`, actualSorted, expected);
  }
  console.log(`capabilitiesOf:      avg ${capsOf.avgMs.toFixed(3)}ms/call over ${componentSample.length} calls`);

  // impactOf, depth 5
  const IMPACT_DEPTH = 5;
  const impact = await timeSampled(componentSample, (id) => impactOf(db, id, IMPACT_DEPTH));
  for (let i = 0; i < componentSample.length; i++) {
    const compId = componentSample[i]!;
    const expected = enumeratePathsImpact(g, compId, IMPACT_DEPTH);
    const actualSorted = impact.results[i]!
      .map((r) => ({ component_id: r.component_id, distance: r.distance }))
      .sort((a, b) => (a.component_id === b.component_id ? a.distance - b.distance : a.component_id < b.component_id ? -1 : 1));
    check(`impactOf(${compId},${IMPACT_DEPTH})`, actualSorted, expected);
  }
  console.log(`impactOf(depth=${IMPACT_DEPTH}):    avg ${impact.avgMs.toFixed(3)}ms/call over ${componentSample.length} calls`);

  // governanceOf
  const gov = await timeSampled(elementSample, (id) => governanceOf(db, id));
  for (let i = 0; i < elementSample.length; i++) {
    const id = elementSample[i]!;
    const expected = jsGovernanceUnion(g, [id]);
    const actualDecisions = [...new Set(gov.results[i]!.filter((r) => r.decision_id).map((r) => r.decision_id!))].sort();
    const actualConstraints = [...new Set(gov.results[i]!.filter((r) => r.constraint_id).map((r) => r.constraint_id!))].sort();
    check(`governanceOf(${id})`, { decisions: actualDecisions, constraints: actualConstraints }, expected);
  }
  console.log(`governanceOf:        avg ${gov.avgMs.toFixed(3)}ms/call over ${elementSample.length} calls`);

  // resolve — no succession data ever seeded (Iteration 0's own disclosed
  // gap: no data path populates element_succession), so every id should
  // resolve to itself.
  const res = await timeSampled(componentSample, (id) => resolve(db, id));
  for (let i = 0; i < componentSample.length; i++) {
    check(`resolve(${componentSample[i]})`, res.results[i], [componentSample[i]]);
  }
  console.log(`resolve:             avg ${res.avgMs.toFixed(3)}ms/call over ${componentSample.length} calls`);

  // localSubgraph
  const local = await timeSampled(componentSample, (id) => localSubgraph(db, id));
  for (let i = 0; i < componentSample.length; i++) {
    const compId = componentSample[i]!;
    const expectedCaps = (g.capsByComponent.get(compId) ?? []).map((c) => c.capability).sort();
    const expectedDeps = [...new Set(g.depsFrom.get(compId) ?? [])].sort();
    const actual = local.results[i]!;
    check(`localSubgraph(${compId})`, { component: actual.component.id, capabilities: actual.capabilities, dependsOn: actual.dependsOn }, {
      component: compId,
      capabilities: expectedCaps,
      dependsOn: expectedDeps,
    });
  }
  console.log(`localSubgraph:       avg ${local.avgMs.toFixed(3)}ms/call over ${componentSample.length} calls`);

  // implementationPath — every task. Multi-valued by design (the
  // traversal's own doc comment: "Multi-valued at the Component and
  // Repository steps") — a capability with a secondary, non-primary
  // provider produces one row per provider, not only the primary one. An
  // earlier version of this check only expected the primary provider's row
  // and failed against every capability that also had a secondary
  // provider — fixed to match the traversal's own documented LEFT JOIN
  // semantics, not a narrowed assumption about it.
  const implStart = performance.now();
  for (const taskId of g.workItems.tasks) {
    const rows = await implementationPath(db, taskId);
    const capId = g.taskCapability.get(taskId)!;
    const providers = g.compsByCapability.get(capId) ?? [];
    const expected = providers
      .map((p) => {
        const repoId = g.repoOfComponent.get(p.component);
        return {
          capability_id: capId,
          component_id: p.component,
          provider_is_primary: p.primary,
          repository_id: repoId ?? null,
          repo_is_primary: repoId ? true : null,
        };
      })
      .sort((a, b) => (a.component_id < b.component_id ? -1 : 1));
    const actualSorted = [...rows].sort((a, b) => ((a.component_id ?? "") < (b.component_id ?? "") ? -1 : 1));
    check(`implementationPath(${taskId})`, actualSorted, expected);
  }
  const implMs = performance.now() - implStart;
  console.log(`implementationPath:  avg ${(implMs / g.workItems.tasks.length).toFixed(3)}ms/call over ${g.workItems.tasks.length} calls`);

  // governanceOfElements — anchorElementIds built exactly the way
  // `workpackage/build.ts` Step 6 builds it: resolvedCapabilities ∪
  // resolvedComponents (default profile: primary provider per capability
  // only), NOT widened by impactOf/context_depth — that widening
  // (`impactedComponents`, Step 4) feeds a separate, future MCP-grant
  // field and is never merged into the governance anchor set. Confirmed
  // by reading `build.ts` directly; an earlier version of this script
  // widened the anchor set via `impactOf` itself, which measured a
  // real-but-unrepresentative N (see the top-of-file doc comment).
  //
  // Two real shapes, both exercised: a typical single-capability task
  // (small anchor set — this is most of the 50 tasks above), and one task
  // deliberately affecting many capabilities directly (`g.wideTask`) — the
  // actual lever for a large anchor set in real usage.
  const typicalSamples = sample(g.workItems.tasks, 5);
  const typicalTimings: number[] = [];
  let typicalAnchorCount = 0;
  for (const taskId of typicalSamples) {
    const capId = g.taskCapability.get(taskId)!;
    const primaryComponent = g.primaryComponentOfCapability.get(capId);
    if (!primaryComponent) continue;
    const anchorElementIds = [capId, primaryComponent];
    typicalAnchorCount = anchorElementIds.length;
    const start = performance.now();
    const actual = await governanceOfElements(db, anchorElementIds);
    typicalTimings.push(performance.now() - start);
    const expected = jsGovernanceUnion(g, anchorElementIds);
    check(`governanceOfElements(${taskId}, ${anchorElementIds.length} anchors)`, actual, expected);
  }
  const avgTypicalMs = typicalTimings.reduce((a, b) => a + b, 0) / (typicalTimings.length || 1);
  console.log(`governanceOfElements (typical, ${typicalAnchorCount} anchors): avg ${avgTypicalMs.toFixed(3)}ms/call over ${typicalTimings.length} calls`);

  const wideResolvedComponents = [
    ...new Set(g.wideTask.capabilities.map((c) => g.primaryComponentOfCapability.get(c)).filter((c): c is string => !!c)),
  ];
  const wideAnchorElementIds = [...g.wideTask.capabilities, ...wideResolvedComponents];
  const wideStart = performance.now();
  const wideActual = await governanceOfElements(db, wideAnchorElementIds);
  const wideMs = performance.now() - wideStart;
  const wideExpected = jsGovernanceUnion(g, wideAnchorElementIds);
  check(`governanceOfElements(${g.wideTask.id}, ${wideAnchorElementIds.length} anchors)`, wideActual, wideExpected);
  console.log(`governanceOfElements (wide, ${wideAnchorElementIds.length} anchors):    ${wideMs.toFixed(3)}ms for 1 call`);
}

// --- Main -------------------------------------------------------------

const SCALE_PARAMS: GraphParams = {
  label: "scale graph",
  domains: 8,
  subsystemsPerDomain: 8,
  componentsPerSubsystem: 10,
  capabilitiesPerSubsystem: 10,
  taskCount: 50,
  wideTaskCapabilityCount: 40,
};

const TOY_PARAMS: GraphParams = {
  label: "toy graph (same shape, baseline)",
  domains: 1,
  subsystemsPerDomain: 1,
  componentsPerSubsystem: 5,
  capabilitiesPerSubsystem: 5,
  taskCount: 3,
  wideTaskCapabilityCount: 4,
};

const scaleGraph = generateGraph(SCALE_PARAMS);
const toyGraph = generateGraph(TOY_PARAMS);

console.log(`Scale graph: ${scaleGraph.products.length + scaleGraph.domains.length + scaleGraph.subsystems.length + scaleGraph.components.length + scaleGraph.capabilities.length} elements, ${scaleGraph.provisions.length} provisions, ${scaleGraph.dependencies.length} dependencies, ${scaleGraph.decisions.length} decisions, ${scaleGraph.constraints.length} constraints, ${scaleGraph.workItems.tasks.length} tasks, ${scaleGraph.repositories.length} repositories.`);
console.log(`Toy graph:   ${toyGraph.products.length + toyGraph.domains.length + toyGraph.subsystems.length + toyGraph.components.length + toyGraph.capabilities.length} elements, ${toyGraph.provisions.length} provisions, ${toyGraph.dependencies.length} dependencies.`);

const scaleDb = await openDb();
await migrate(scaleDb);
console.log("\nSeeding scale graph...");
const seedStart = performance.now();
await seedGraph(scaleDb, scaleGraph);
console.log(`Seeded in ${(performance.now() - seedStart).toFixed(0)}ms.`);

const toyDb = await openDb();
await migrate(toyDb);
await seedGraph(toyDb, toyGraph);

const SAMPLE_SIZE = 150;
await investigate(scaleDb, scaleGraph, SAMPLE_SIZE);
await investigate(toyDb, toyGraph, SAMPLE_SIZE);

console.log("\n--- Correctness ---");
console.log(`${checksPassed} passed, ${checksFailed} failed`);
if (failureExamples.length > 0) {
  console.log("First failures:");
  for (const f of failureExamples) console.log(`  ${f}`);
}

console.log("\n--- Classification ---");
if (checksFailed > 0) {
  console.log(
    "CORRECTNESS FAILURE: at least one traversal produced a result that does not match the independently " +
      "computed expected answer at scale — a real bug, not a performance question. See failures above.",
  );
} else {
  console.log(
    `CORRECTNESS HOLDS: all ${checksPassed} checks across all eight traversals plus governanceOfElements matched ` +
      "their independently computed expected results at the tested scale.",
  );
}
console.log(
  "Compare the per-traversal avg ms/call lines above between the scale graph and the toy graph directly — " +
    "this script prints both, in the same run, on the same machine, rather than an isolated absolute number.",
);

await scaleDb.close();
await toyDb.close();
