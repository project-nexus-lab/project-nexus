import type { NexusDb } from "../db/client.js";
import { governanceOfElements, impactOf, implementationPath, resolve } from "../graph/traversals.js";
import { canonicalize, contentHash, type JsonValue } from "./canonicalize.js";

const SCHEMA_VERSION = 2;

export type GateFailureReason =
  | "task-not-found"
  | "task-not-ready"
  | "no-affected-capabilities"
  | "no-acceptance-criteria"
  | "element-not-found"
  | "retired-without-succession"
  | "unprovided-capability"
  | "mapping-missing"
  | "ambiguous-repository";

/**
 * Raised by the §11.2 step-1 gate. Per §11.2, a gate failure whose reason is
 * "missing architecture" (`unprovided-capability`, `mapping-missing`) is, in
 * the full v2 design, the trigger for drafting an ArchitectureChangeProposal
 * (§5.4) rather than a bare error. Proposal drafting is out of the iteration
 * 0 scope (explicitly deferred), so this error is the whole observable
 * behaviour here — the `reason` field is what a future §5.4 handler would
 * switch on.
 */
export class WorkPackageGateError extends Error {
  constructor(
    public readonly reason: GateFailureReason,
    message: string,
  ) {
    super(message);
    this.name = "WorkPackageGateError";
  }
}

export interface WorkPackagePayload {
  id: string;
  schemaVersion: number;
  profile: string;
  task: string;
  feature: string;
  capabilities: string[];
  components: string[];
  repositories: string[];
  files: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  decisions: string[];
}

export interface WorkPackageResult {
  id: string;
  seq: number;
  taskId: string;
  profileId: string;
  contentHash: string;
  payload: WorkPackagePayload;
  /** false when an existing immutable package was returned instead of inserting a new one (§11.1 idempotency). */
  created: boolean;
  /**
   * impactOf(component, profile.context_depth) for every resolved component,
   * union'd (§11.2 step 4). Not part of WORK_PACKAGE_SPEC.md's payload — it
   * exists to bound a future run-scoped MCP grant (§9.5: "grant = WP
   * elements ∪ impactOf(components, context_depth + 1)"), which is out of
   * iteration-0 scope. Surfaced here rather than discarded so the step is
   * genuinely executed, not merely documented.
   */
  impactedComponents: string[];
}

interface TaskRow {
  id: string;
  kind: string;
  title: string;
  status: string;
  parent_id: string | null;
}

interface ProfileRow {
  id: string;
  context_depth: number;
  include_all_providers: boolean;
  allow_ambiguous_repo: boolean;
}

interface ElementRow {
  id: string;
  status: string;
}

/**
 * Resolves each id through succession (§5.5, §8.4 `resolve`) and rejects any
 * id whose resolved (active) form is `retired` — the "no referenced element
 * is retired without succession" gate clause (§11.2 step 1 / step 2).
 */
async function resolveAndCheckRetired(db: NexusDb, ids: string[]): Promise<string[]> {
  const resolved = new Set<string>();
  for (const id of ids) {
    const successors = await resolve(db, id);
    for (const successorId of successors) {
      const { rows } = await db.query<ElementRow>(
        `select id, status from architecture.element where id = $1`,
        [successorId],
      );
      const element = rows[0];
      if (!element) {
        throw new WorkPackageGateError("element-not-found", `element ${successorId} does not exist`);
      }
      if (element.status === "retired") {
        throw new WorkPackageGateError(
          "retired-without-succession",
          `element ${successorId} is retired with no successor`,
        );
      }
      resolved.add(successorId);
    }
  }
  return [...resolved];
}

/**
 * buildWorkPackage(taskId, profileId) — MVP_ARCHITECTURE_V2 §11.
 *
 * Pure with respect to graph state: same graph + same task + same profile
 * always yields the same content hash, so repeated calls return the same
 * immutable row rather than inserting a duplicate (§11.1).
 */
export async function buildWorkPackage(
  db: NexusDb,
  taskId: string,
  profileId: string,
): Promise<WorkPackageResult> {
  // --- Step 1: Gate ---------------------------------------------------
  const taskRows = await db.query<TaskRow>(
    `select id, kind, title, status, parent_id from work.work_item where id = $1`,
    [taskId],
  );
  const task = taskRows.rows[0];
  if (!task || task.kind !== "task") {
    throw new WorkPackageGateError("task-not-found", `task ${taskId} does not exist`);
  }
  if (task.status !== "ready") {
    throw new WorkPackageGateError(
      "task-not-ready",
      `task ${taskId} is '${task.status}', not 'ready'`,
    );
  }

  const profileRows = await db.query<ProfileRow>(
    `select id, context_depth, include_all_providers, allow_ambiguous_repo
     from execution.work_package_profile where id = $1`,
    [profileId],
  );
  const profile = profileRows.rows[0];
  if (!profile) {
    throw new WorkPackageGateError(
      "element-not-found",
      `work package profile ${profileId} does not exist`,
    );
  }

  const acRows = await db.query<{ id: string }>(
    `select id from work.acceptance_criterion where work_item_id = $1 order by ordinal`,
    [taskId],
  );
  if (acRows.rows.length === 0) {
    throw new WorkPackageGateError(
      "no-acceptance-criteria",
      `task ${taskId} has zero AcceptanceCriteria`,
    );
  }

  // --- Step 2: Resolve succession, Step 3: Traverse --------------------
  const pathRows = await implementationPath(db, taskId);
  if (pathRows.length === 0) {
    throw new WorkPackageGateError(
      "no-affected-capabilities",
      `task ${taskId} affects zero capabilities`,
    );
  }

  const affectedCapabilities = [...new Set(pathRows.map((r) => r.capability_id))];
  const resolvedCapabilities = await resolveAndCheckRetired(db, affectedCapabilities);

  // Select providing components per capability: primary provider, unless the
  // profile widens to all providers, or no provider is flagged primary.
  // Rows with a null component_id are capabilities with zero providers
  // (implementation_path LEFT JOINs so they still appear) — they contribute
  // no candidate and fall through to the unprovided-capability gate below.
  const componentsByCapability = new Map<string, { id: string; isPrimary: boolean }[]>();
  for (const row of pathRows) {
    if (!row.component_id) continue;
    const list = componentsByCapability.get(row.capability_id) ?? [];
    list.push({ id: row.component_id, isPrimary: row.provider_is_primary ?? false });
    componentsByCapability.set(row.capability_id, list);
  }

  const selectedComponentIds = new Set<string>();
  for (const capabilityId of resolvedCapabilities) {
    const providers = componentsByCapability.get(capabilityId) ?? [];
    if (providers.length === 0) {
      throw new WorkPackageGateError(
        "unprovided-capability",
        `capability ${capabilityId} has no provider`,
      );
    }
    if (profile.include_all_providers) {
      for (const p of providers) selectedComponentIds.add(p.id);
      continue;
    }
    const primary = providers.find((p) => p.isPrimary);
    if (primary) {
      selectedComponentIds.add(primary.id);
    } else {
      // No provider flagged primary: fall back to the full set rather than
      // silently dropping a capability the gate already confirmed is provided.
      for (const p of providers) selectedComponentIds.add(p.id);
    }
  }

  const resolvedComponents = await resolveAndCheckRetired(db, [...selectedComponentIds]);

  // --- Step 4: Bound (impactOf) ----------------------------------------
  // Not part of the WORK_PACKAGE_SPEC.md payload — it exists to feed a
  // future run-scoped MCP grant (§9.5). context_depth defaults to 0, so this
  // is normally empty; still genuinely executed, not just documented.
  const impactedComponents = new Set<string>();
  for (const componentId of resolvedComponents) {
    for (const impact of await impactOf(db, componentId, profile.context_depth)) {
      impactedComponents.add(impact.component_id);
    }
  }

  // --- Repository resolution (§4.3) -------------------------------------
  const overrideRows = await db.query<{ repository_id: string }>(
    `select repository_id from work.work_item_repository where work_item_id = $1`,
    [taskId],
  );

  let repositories: string[];
  if (overrideRows.rows.length > 0) {
    repositories = [...new Set(overrideRows.rows.map((r) => r.repository_id))];
  } else {
    const set = new Set<string>();
    for (const componentId of resolvedComponents) {
      const mapped = await db.query<{ repository_id: string; is_primary: boolean }>(
        `select repository_id, is_primary from repo.repository_component where component_id = $1`,
        [componentId],
      );
      if (mapped.rows.length === 0) {
        throw new WorkPackageGateError(
          "mapping-missing",
          `component ${componentId} has no mapped repository`,
        );
      }
      const primary = mapped.rows.find((r) => r.is_primary);
      if (primary) {
        set.add(primary.repository_id);
      } else if (mapped.rows.length === 1 && mapped.rows[0]) {
        set.add(mapped.rows[0].repository_id);
      } else if (profile.allow_ambiguous_repo) {
        for (const r of mapped.rows) set.add(r.repository_id);
      } else {
        throw new WorkPackageGateError(
          "ambiguous-repository",
          `component ${componentId} has multiple mapped repositories and no primary; profile forbids ambiguity`,
        );
      }
    }
    repositories = [...set];
  }

  // --- Step 5: Anchor (files, §13 Alternative A) ------------------------
  const anchorElementIds = [...resolvedCapabilities, ...resolvedComponents];
  const fileRows =
    repositories.length > 0 && anchorElementIds.length > 0
      ? await db.query<{ path_glob: string }>(
          `select distinct path_glob from repo.file_anchor
           where repository_id = any($1) and element_id = any($2)`,
          [repositories, anchorElementIds],
        )
      : { rows: [] as { path_glob: string }[] };
  const files = fileRows.rows.map((r) => r.path_glob);

  // --- Step 6: Govern ----------------------------------------------------
  const { decisions, constraints } = await governanceOfElements(db, anchorElementIds);

  // --- Step 7: Frame -------------------------------------------------------
  if (!task.parent_id) {
    throw new WorkPackageGateError("element-not-found", `task ${taskId} has no parent feature`);
  }
  const feature = task.parent_id;

  // --- Step 8: Canonicalise + hash ----------------------------------------
  const content: Omit<WorkPackagePayload, "id"> = {
    schemaVersion: SCHEMA_VERSION,
    profile: profileId,
    task: taskId,
    feature,
    capabilities: resolvedCapabilities,
    components: resolvedComponents,
    repositories,
    files,
    constraints,
    acceptanceCriteria: acRows.rows.map((r) => r.id),
    decisions,
  };
  const hash = contentHash(content as unknown as JsonValue);

  // --- Step 9: Persist (insert-only, idempotent) --------------------------
  return db.transaction(async (tx) => {
    const existing = await tx.query<{ id: string; seq: number; payload: WorkPackagePayload }>(
      `select id, seq, payload from execution.work_package
       where task_id = $1 and profile_id = $2 and content_hash = $3`,
      [taskId, profileId, hash],
    );
    const found = existing.rows[0];
    if (found) {
      return {
        id: found.id,
        seq: found.seq,
        taskId,
        profileId,
        contentHash: hash,
        payload: found.payload,
        created: false,
        impactedComponents: [...impactedComponents],
      };
    }

    const seqRows = await tx.query<{ seq: string }>(
      `select nextval('execution.work_package_seq') as seq`,
    );
    const seq = Number(seqRows.rows[0]!.seq);
    const id = `wp.${seq}`;
    const payload = canonicalize({ id, ...content } as unknown as JsonValue) as unknown as WorkPackagePayload;

    await tx.query(
      `insert into execution.work_package
         (id, seq, task_id, profile_id, content_hash, payload, schema_version)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, seq, taskId, profileId, hash, JSON.stringify(payload), String(SCHEMA_VERSION)],
    );

    return {
      id,
      seq,
      taskId,
      profileId,
      contentHash: hash,
      payload,
      created: true,
      impactedComponents: [...impactedComponents],
    };
  });
}
