import type { SqlExecutor } from "../db/sql-executor.js";
import type { AgentRuntimeAdapter } from "./port.js";

/**
 * Registration into `runtime.adapter_registration` / `adapter_role_support`
 * — the two tables that have existed, empty, since Iteration 0
 * (`db/migrations/0006_runtime.sql`). Registration is application-level
 * (a deploy/setup step), not a schema migration: an adapter is a code
 * artifact, not static reference data the way the role vocabulary
 * (`db/migrations/0010_runtime_role_vocabulary.sql`) is.
 */

export interface AdapterRegistrationConfig {
  displayName: string;
  config?: Record<string, unknown>;
}

export async function registerAdapter(
  db: SqlExecutor,
  adapter: AgentRuntimeAdapter,
  { displayName, config = {} }: AdapterRegistrationConfig,
): Promise<void> {
  await db.query(
    `insert into runtime.adapter_registration (id, display_name, config)
     values ($1, $2, $3)
     on conflict (id) do update set display_name = excluded.display_name, config = excluded.config`,
    [adapter.id, displayName, JSON.stringify(config)],
  );

  for (const roleId of adapter.capabilities().supportedRoles) {
    await db.query(
      `insert into runtime.adapter_role_support (adapter_id, role_id) values ($1, $2)
       on conflict do nothing`,
      [adapter.id, roleId],
    );
  }
}

export interface RegisteredAdapterRow {
  id: string;
  display_name: string;
  enabled: boolean;
}

export async function listAdaptersForRole(
  db: SqlExecutor,
  roleId: string,
): Promise<RegisteredAdapterRow[]> {
  const { rows } = await db.query<RegisteredAdapterRow>(
    `select ar.id, ar.display_name, ar.enabled
     from runtime.adapter_registration ar
     join runtime.adapter_role_support ars on ars.adapter_id = ar.id
     where ars.role_id = $1
     order by ar.id`,
    [roleId],
  );
  return rows;
}
