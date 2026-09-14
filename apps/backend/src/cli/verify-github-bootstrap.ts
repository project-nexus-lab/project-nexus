/**
 * Real-GitHub push/branch/PR verification for Iteration 17
 * (`docs/history/iteration-17/SCOPE.md`). NOT part of `npm test` — real
 * network access, real `gh`/`git` credentials, a real, disposable GitHub
 * repository. Run explicitly: `npm run verify:github-bootstrap`.
 *
 * Provisions one real, private repository, drives the existing,
 * unmodified state machine through `generateProjection` to obtain real
 * rendered files, then calls the new `VcsProvider.openPullRequestWithChanges`
 * method with those exact files against the same real repository,
 * independently verifies the PR exists via `gh pr view`, deliberately
 * triggers one real failure (a second PR attempt for the same branch),
 * and — unless `--keep` is passed — deletes the whole repository
 * afterward (branch and PR included), mirroring
 * `verify-github.ts`'s (Iteration 5) own structure and auth-scope-aware
 * cleanup discipline.
 *
 * `--keep`: skip deletion and print a ready-to-run manual cleanup
 * command instead, so the repository/branch/PR can be inspected first.
 * `npm run verify:github-bootstrap -- --keep`.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { openDb } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { deleteRepository, GhCliError, GhCliVcsProvider } from "../repository/gh-cli-vcs-provider.js";
import { generateProjection, provisionRepository, registerMapping, declareRepository } from "../repository/lifecycle.js";

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

const keep = process.argv.includes("--keep");

console.log("=== Iteration 17 verification: push/branch/PR against a real repository ===\n");

const auth = await ghAuthStatus();
check("gh is authenticated", auth.authenticated, auth.scopes);
if (!auth.authenticated) {
  console.log("\nCannot continue without gh authentication. Run `gh auth login` first.");
  process.exit(1);
}
const canDelete = auth.scopes.includes("delete_repo");
if (!canDelete && !keep) {
  console.log(
    "[WARN] current gh token lacks the 'delete_repo' scope — cleanup at the end of this run will fail and print manual cleanup instructions instead of silently leaving a repository behind.",
  );
}

const db = await openDb();
await migrate(db);

// Minimal architecture — this script is not about seed data, only about
// having exactly one real component/repository pair to bootstrap.
const suffix = Date.now();
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('prod.iter17', 'product', null, 'Iteration 17')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('dom.iter17', 'domain', 'prod.iter17', 'Iteration 17')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('subsys.iter17', 'subsystem', 'dom.iter17', 'Iteration 17')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('comp.iter17-validation', 'component', 'subsys.iter17', 'Iteration 17 Validation')`);

const repoName = `nexus-iter17-bootstrap-${suffix}`;
const repoId = `repo.iter17-bootstrap-${suffix}`;
const provider = new GhCliVcsProvider("private");

console.log(`\n--- Provisioning one real, private repository: ${repoName} ---`);
await declareRepository(db, { id: repoId, name: repoName, provider: "gh-cli" });
await provisionRepository(db, repoId, provider);
await registerMapping(db, repoId, "comp.iter17-validation", true);

const { rows: repoRow } = await db.query<{ provider_ref: string; default_branch: string }>(
  `select provider_ref, default_branch from repo.repository where id = $1`,
  [repoId],
);
const providerRef = repoRow[0]?.provider_ref;
const baseBranch = repoRow[0]?.default_branch ?? "main";
check("provisionRepository stored a real provider_ref", !!providerRef, providerRef);
if (!providerRef) {
  console.log("\nCannot continue: no provider_ref to push against.");
  process.exit(1);
}

console.log("\n--- Rendering real projection files via the existing, unmodified generateProjection ---");
const files = await generateProjection(db, repoId, "v1");
check("generateProjection rendered files", files.length > 0, files.map((f) => f.path));

console.log("\n--- Pushing a real branch and opening a real PR (the new step this iteration adds) ---");
const branch = "nexus/bootstrap";
const { prUrl } = await provider.openPullRequestWithChanges({
  providerRef,
  branch,
  baseBranch,
  files,
  title: "Nexus bootstrap: initial managed projection",
  body: "Opened by Iteration 17's verify:github-bootstrap script — validates §10.2 step 5's push/branch/PR flow against a real repository.",
});
check("openPullRequestWithChanges returned a real PR URL", /^https:\/\/github\.com\//.test(prUrl), prUrl);

console.log("\n--- Independently verifying the PR and its contents, not just trusting our own return value ---");
try {
  const { stdout } = await execFileAsync("gh", [
    "pr",
    "view",
    prUrl,
    "--json",
    "state,headRefName,baseRefName,files",
  ]);
  const parsed = JSON.parse(stdout) as {
    state: string;
    headRefName: string;
    baseRefName: string;
    files: Array<{ path: string }>;
  };
  check("gh pr view confirms the PR is OPEN", parsed.state === "OPEN", parsed.state);
  check("gh pr view confirms the head/base branches", parsed.headRefName === branch && parsed.baseRefName === baseBranch, parsed);
  const prFilePaths = parsed.files.map((f) => f.path).sort();
  const renderedFilePaths = files.map((f) => f.path).sort();
  check(
    "the PR's real file list matches exactly what generateProjection rendered",
    JSON.stringify(prFilePaths) === JSON.stringify(renderedFilePaths),
    { prFilePaths, renderedFilePaths },
  );
} catch (err) {
  check("gh pr view independently confirms the PR", false, String(err));
}

console.log("\n--- Deliberately triggering a real failure: a second PR for the same branch ---");
// Real finding, checked directly rather than assumed: this always fails
// as a *push* rejection (non-fast-forward), not a 'pr-exists' gh error --
// openPullRequestWithChanges creates a fresh local branch from the base
// branch's HEAD every call, so a second invocation for a branch that
// already has a bootstrap commit on the remote diverges from it, and the
// push is rejected before `gh pr create` is ever reached. Incremental/
// repeat bootstrap pushes are an explicit deferral
// (docs/history/iteration-17/SCOPE.md) -- this confirms repeating the
// operation fails cleanly, as a typed condition, not that it succeeds.
let secondPrError: unknown;
try {
  await provider.openPullRequestWithChanges({
    providerRef,
    branch,
    baseBranch,
    files,
    title: "Duplicate attempt",
    body: "Should fail: this branch already has a bootstrap commit on the remote.",
  });
} catch (err) {
  secondPrError = err;
}
check(
  "the duplicate attempt is caught as a typed GhCliError with reason 'push-rejected', not an unhandled exception",
  secondPrError instanceof GhCliError && secondPrError.reason === "push-rejected",
  secondPrError instanceof Error ? secondPrError.message : secondPrError,
);

console.log(`\n--- Repository and PR left for inspection ---`);
console.log(`Repository: https://github.com/${providerRef}`);
console.log(`Pull request: ${prUrl}`);

if (keep) {
  console.log(
    `\n[KEPT] --keep was passed — nothing was deleted. Clean up manually when you're done:\n` +
      `  gh repo delete ${providerRef} --yes`,
  );
} else {
  console.log("\n--- Cleanup ---");
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

await db.close();

console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`} ===`);
process.exit(failures === 0 ? 0 : 1);
