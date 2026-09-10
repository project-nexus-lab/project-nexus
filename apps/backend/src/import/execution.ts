import type { SqlExecutor } from "../db/sql-executor.js";
import { ExecutionYaml } from "./schema.js";

/**
 * Seeds `execution.work_package_profile` rows. Not one of the three named
 * import model deliverables, but Work Package generation (§11) needs at
 * least `wpp.implementation` to exist — required now, not speculative.
 */
export async function importExecutionProfiles(
  db: SqlExecutor,
  doc: unknown,
): Promise<{ profiles: number }> {
  const data = ExecutionYaml.parse(doc);

  for (const p of data.profiles) {
    await db.query(
      `insert into execution.work_package_profile
         (id, name, context_depth, include_all_providers, allow_ambiguous_repo)
       values ($1, $2, $3, $4, $5)`,
      [p.id, p.name, p.contextDepth, p.includeAllProviders, p.allowAmbiguousRepo],
    );
  }

  return { profiles: data.profiles.length };
}
