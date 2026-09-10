import type { SqlExecutor } from "../db/sql-executor.js";
import { assertId } from "../ids/ids.js";
import { RepositoryYaml } from "./schema.js";

/** Repository YAML import (Iteration 0 deliverable #4). */
export async function importRepository(
  db: SqlExecutor,
  doc: unknown,
): Promise<{ repositories: number; mappings: number }> {
  const data = RepositoryYaml.parse(doc);

  let mappings = 0;
  for (const r of data.repositories) {
    assertId(r.id, "repository");
    await db.query(
      `insert into repo.repository (id, name, provider, provider_ref, default_branch)
       values ($1, $2, $3, $4, $5)`,
      [r.id, r.name, r.provider, r.providerRef ?? null, r.defaultBranch],
    );
    for (const impl of r.implements) {
      await db.query(
        `insert into repo.repository_component (repository_id, component_id, is_primary)
         values ($1, $2, $3)`,
        [r.id, impl.component, impl.primary],
      );
      mappings += 1;
    }
    for (const anchor of r.fileAnchors) {
      await db.query(
        `insert into repo.file_anchor (repository_id, path_glob, element_id, note)
         values ($1, $2, $3, $4)`,
        [r.id, anchor.pathGlob, anchor.element, anchor.note ?? null],
      );
    }
  }

  return { repositories: data.repositories.length, mappings };
}
