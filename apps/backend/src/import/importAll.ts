import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { NexusDb } from "../db/client.js";
import { importArchitecture } from "./architecture.js";
import { importExecutionProfiles } from "./execution.js";
import { importRepository } from "./repository.js";
import { importWork } from "./work.js";

export interface SeedPaths {
  architecture: string;
  repository: string;
  work: string;
  execution: string;
}

async function loadYaml(filePath: string): Promise<unknown> {
  const text = await readFile(filePath, "utf8");
  return parseYaml(text);
}

/**
 * Runs the full seed import in the one order the model requires:
 * Architecture (elements must exist before anything references them) →
 * Repository (components must exist before `implements` mappings) →
 * Execution profiles (independent, but harmless here) → Work (capabilities
 * and repositories must exist before Tasks affect/override them).
 *
 * Runs inside one transaction: a partially-imported seed is worse than a
 * rejected one.
 */
export async function importAll(db: NexusDb, paths: SeedPaths) {
  const [architectureDoc, repositoryDoc, executionDoc, workDoc] = await Promise.all([
    loadYaml(paths.architecture),
    loadYaml(paths.repository),
    loadYaml(paths.execution),
    loadYaml(paths.work),
  ]);

  return db.transaction(async (tx) => {
    const architecture = await importArchitecture(tx, architectureDoc);
    const repository = await importRepository(tx, repositoryDoc);
    const execution = await importExecutionProfiles(tx, executionDoc);
    const work = await importWork(tx, workDoc);
    return { architecture, repository, execution, work };
  });
}
