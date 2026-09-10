import type { SqlExecutor } from "../db/sql-executor.js";

/**
 * Execution-owned run telemetry — raw evidence about a real agent run,
 * not analytics. A focused enhancement (not an iteration; see
 * `apps/backend/README.md`), prompted by the observation that
 * `execution.execution_run`'s `started_at`/`ended_at` columns have
 * existed since Iteration 0 and nothing has ever written to them, and
 * that once a real adapter (Iteration 6) exists, real execution facts
 * exist and were at risk of being lost with no record kept at all.
 *
 * Execution owns this table and this module (the schema, the record
 * shape, the write path). Runtime Integration adapters *populate* it —
 * they gather facts only they have access to (real token counts, real
 * timestamps) and call `recordRunTelemetry`, never the reverse. This
 * keeps the dependency direction §2.3 already declares (Runtime
 * Integration → Execution, inbound only) unchanged; nothing here imports
 * from `src/runtime/`, and every type below is a plain string, number,
 * Date, or null — no Claude-specific shape crosses into this module or
 * the `execution.run_telemetry` table.
 *
 * No cost calculation. No aggregation. No dashboards. This module
 * captures facts; it does not interpret them.
 */

export interface RunTelemetryInput {
  runId: string;
  workPackageId: string;
  runtimeAdapterId: string;

  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;

  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;

  workPackageSizeBytes: number | null;
  workPackageSizeTokens: number | null;
  capabilityCount: number | null;
  componentCount: number | null;
  repositoryCount: number | null;
  grantElementCount: number | null;
  grantRepositoryCount: number | null;

  accessedElementCount: number | null;
  accessedRepositoryCount: number | null;
}

/**
 * Insert-only (`revoke update, delete` in the migration) — a telemetry
 * row is written exactly once, from the driving adapter's `events()`
 * `finally` block, with whatever is known at that point. A run that never
 * reaches a terminal SDK result still gets a row (completedAt/tokens
 * null, everything known at `start()` time present) — a hard process
 * kill that skips the `finally` block entirely is the one case this
 * cannot protect against; not claimed otherwise.
 */
export async function recordRunTelemetry(db: SqlExecutor, input: RunTelemetryInput): Promise<void> {
  await db.query(
    `insert into execution.run_telemetry (
       run_id, work_package_id, runtime_adapter_id,
       started_at, completed_at, duration_ms,
       input_tokens, output_tokens, total_tokens,
       work_package_size_bytes, work_package_size_tokens,
       capability_count, component_count, repository_count,
       grant_element_count, grant_repository_count,
       accessed_element_count, accessed_repository_count
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      input.runId,
      input.workPackageId,
      input.runtimeAdapterId,
      input.startedAt.toISOString(),
      input.completedAt ? input.completedAt.toISOString() : null,
      input.durationMs,
      input.inputTokens,
      input.outputTokens,
      input.totalTokens,
      input.workPackageSizeBytes,
      input.workPackageSizeTokens,
      input.capabilityCount,
      input.componentCount,
      input.repositoryCount,
      input.grantElementCount,
      input.grantRepositoryCount,
      input.accessedElementCount,
      input.accessedRepositoryCount,
    ],
  );
}

export interface WorkPackageContextFacts {
  workPackageSizeBytes: number;
  /**
   * Always null today. No tokenizer is available: checked directly
   * against `@anthropic-ai/claude-agent-sdk`'s own type definitions
   * before writing this module — it exports no `countTokens` or
   * equivalent utility. Estimating a token count from byte length would
   * be inventing a metric, not measuring one; `workPackageSizeBytes` is
   * the real, measured fact this iteration has instead.
   */
  workPackageSizeTokens: null;
  capabilityCount: number | null;
  componentCount: number | null;
  repositoryCount: number | null;
}

/**
 * Derives context facts from a Work Package payload treated as opaque
 * (`Record<string, unknown>`, duck-typed) rather than importing
 * `OpaqueWorkPackage` from `src/runtime/port.ts` — keeps this module
 * import-free of anything under `src/runtime/`, so the "Runtime
 * Integration → Execution, never reversed" direction is not just
 * followed but structurally unable to be violated by accident here.
 */
export function deriveWorkPackageContextFacts(workPackage: Readonly<Record<string, unknown>>): WorkPackageContextFacts {
  const capabilities = Array.isArray(workPackage.capabilities) ? workPackage.capabilities : null;
  const components = Array.isArray(workPackage.components) ? workPackage.components : null;
  const repositories = Array.isArray(workPackage.repositories) ? workPackage.repositories : null;
  return {
    workPackageSizeBytes: Buffer.byteLength(JSON.stringify(workPackage), "utf8"),
    workPackageSizeTokens: null,
    capabilityCount: capabilities ? capabilities.length : null,
    componentCount: components ? components.length : null,
    repositoryCount: repositories ? repositories.length : null,
  };
}

export interface GrantContextFacts {
  grantElementCount: number;
  grantRepositoryCount: number;
}

/** Duck-typed for the same reason as `deriveWorkPackageContextFacts` — no import from `src/mcp/` or `src/runtime/`. */
export function deriveGrantContextFacts(grant: {
  allowedElementIds: readonly string[];
  allowedRepositoryIds: readonly string[];
}): GrantContextFacts {
  return {
    grantElementCount: grant.allowedElementIds.length,
    grantRepositoryCount: grant.allowedRepositoryIds.length,
  };
}
