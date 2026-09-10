/**
 * Real-GitHub verification for Iteration 5
 * (`docs/history/iteration-5/SCOPE.md`). NOT part of `npm test` —
 * requires real network access and real `gh` credentials, which would
 * break the hermetic, offline property every other test in this project
 * has kept since Iteration 0. Run explicitly: `npm run verify:github`.
 *
 * Creates exactly one real, private GitHub repository, drives the
 * unmodified bootstrap state machine (`src/repository/lifecycle.ts`)
 * against it via `GhCliVcsProvider`, deliberately triggers one real
 * failure (a name collision), and attempts to delete the repository
 * afterward. Deletion requires the `delete_repo` OAuth scope, which
 * `gh auth login`'s default `repo` scope does not include — checked
 * directly via `gh auth status` before doing anything mutating, not
 * assumed. If that scope is missing, this script still completes the
 * validation and prints exactly what to clean up by hand, rather than
 * silently leaving a repository nobody is told about.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { openDb } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { deleteRepository, GhCliError, GhCliVcsProvider } from "../repository/gh-cli-vcs-provider.js";
import {
  activateRepository,
  declareRepository,
  generateProjection,
  IllegalRepositoryTransitionError,
  provisionRepository,
  registerMapping,
} from "../repository/lifecycle.js";

const execFileAsync = promisify(execFile);

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  const mark = condition ? "PASS" : "FAIL";
  console.log(`[${mark}] ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`);
  if (!condition) failures += 1;
}

async function ghAuthStatus(): Promise<{ authenticated: boolean; scopes: string[] }> {
  try {
    const { stderr } = await execFileAsync("gh", ["auth", "status"]);
    const scopeMatch = stderr.match(/Token scopes:\s*(.+)/);
    const scopes = scopeMatch ? (scopeMatch[1] as string).split(",").map((s) => s.trim().replace(/'/g, "")) : [];
    return { authenticated: true, scopes };
  } catch {
    return { authenticated: false, scopes: [] };
  }
}

console.log("=== Iteration 5 verification: real GitHub-backed VcsProvider ===\n");

const auth = await ghAuthStatus();
check("gh is authenticated", auth.authenticated, auth.scopes);
if (!auth.authenticated) {
  console.log("\nCannot continue without gh authentication. Run `gh auth login` first.");
  process.exit(1);
}
const canDelete = auth.scopes.includes("delete_repo");
if (!canDelete) {
  console.log(
    "[WARN] current gh token lacks the 'delete_repo' scope — cleanup at the end of this run will fail and print manual cleanup instructions instead of silently leaving a repository behind.",
  );
}

const db = await openDb();
await migrate(db);

// Minimal architecture — this script is not about seed data, only about
// having exactly one real component to declare a repository against.
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('prod.iter5', 'product', null, 'Iteration 5')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('dom.iter5', 'domain', 'prod.iter5', 'Iteration 5')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('subsys.iter5', 'subsystem', 'dom.iter5', 'Iteration 5')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('comp.iter5-validation', 'component', 'subsys.iter5', 'Iteration 5 Validation')`);

const suffix = Date.now();
const repoName = `nexus-iter5-validation-${suffix}`;
const repoId = `repo.iter5-validation-${suffix}`;
const provider = new GhCliVcsProvider("private");

console.log(`\n--- Provisioning one real, private repository: ${repoName} ---`);
await declareRepository(db, { id: repoId, name: repoName, provider: "gh-cli" });
await provisionRepository(db, repoId, provider);

const { rows: afterProvision } = await db.query<{ provider_ref: string; bootstrap_state: string }>(
  `select provider_ref, bootstrap_state from repo.repository where id = $1`,
  [repoId],
);
const providerRef = afterProvision[0]?.provider_ref;
check("provisionRepository stored a real provider_ref", !!providerRef, providerRef);
check("bootstrap_state advanced to 'provisioned'", afterProvision[0]?.bootstrap_state === "provisioned");

// Independent verification — not just trusting our own success return.
if (providerRef) {
  try {
    const { stdout } = await execFileAsync("gh", ["repo", "view", providerRef, "--json", "nameWithOwner"]);
    const parsed = JSON.parse(stdout) as { nameWithOwner: string };
    check("gh repo view independently confirms the repository exists", parsed.nameWithOwner === providerRef, parsed);
  } catch (err) {
    check("gh repo view independently confirms the repository exists", false, String(err));
  }
}

console.log("\n--- Driving the rest of the state machine, unmodified ---");
await registerMapping(db, repoId, "comp.iter5-validation", true);
await generateProjection(db, repoId, "v1");
await activateRepository(db, repoId);
const { rows: final } = await db.query<{ bootstrap_state: string }>(
  `select bootstrap_state from repo.repository where id = $1`,
  [repoId],
);
check("state machine reached 'active' with zero changes to lifecycle.ts", final[0]?.bootstrap_state === "active");

console.log("\n--- Deliberately triggering a real failure: a name collision ---");
const collisionId = `repo.iter5-collision-${suffix}`;
await declareRepository(db, { id: collisionId, name: repoName, provider: "gh-cli" }); // same name, already taken
let collisionError: unknown;
try {
  await provisionRepository(db, collisionId, provider);
} catch (err) {
  collisionError = err;
}
check(
  "the collision is caught as a typed GhCliError with reason 'name-taken', not an unhandled exception",
  collisionError instanceof GhCliError && collisionError.reason === "name-taken",
  collisionError instanceof Error ? collisionError.message : collisionError,
);
const { rows: collisionState } = await db.query<{ bootstrap_state: string }>(
  `select bootstrap_state from repo.repository where id = $1`,
  [collisionId],
);
check(
  "the failed repository's bootstrap_state remains 'declared' — not silently advanced",
  collisionState[0]?.bootstrap_state === "declared",
  collisionState[0],
);

// Confirm the state machine's own transition guard also refuses reusing
// the collision-failed repository id, same as every other illegal
// transition tested against NoopVcsProvider in Iteration 4.
try {
  await provisionRepository(db, collisionId, provider);
  check("a repository stuck at 'declared' after a failed provision can be retried, not permanently stuck", true);
} catch (err) {
  check(
    "retrying provisionRepository on a still-declared repository is legal (not an IllegalRepositoryTransitionError)",
    !(err instanceof IllegalRepositoryTransitionError),
    err instanceof Error ? err.message : err,
  );
}

console.log("\n--- Cleanup ---");
if (providerRef) {
  try {
    await deleteRepository(providerRef);
    try {
      await execFileAsync("gh", ["repo", "view", providerRef]);
      check("cleanup: repository no longer exists after deletion", false, "gh repo view unexpectedly succeeded");
    } catch {
      check("cleanup: repository no longer exists after deletion", true);
    }
  } catch (err) {
    console.log(
      `[MANUAL CLEANUP REQUIRED] Could not delete ${providerRef} automatically ` +
        `(${err instanceof Error ? err.message : String(err)}). ` +
        `Delete it yourself: gh repo delete ${providerRef} --yes ` +
        `(requires: gh auth refresh -s delete_repo)`,
    );
  }
}
// The collision attempt's repository row never resulted in a real GitHub
// repository (the create call failed before one was made), so there is
// nothing to delete for collisionId.

await db.close();

console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`} ===`);
process.exit(failures === 0 ? 0 : 1);
