/**
 * Real-GitHub CI workflow validity verification for Iteration 20
 * (`docs/history/iteration-20/SCOPE.md`). NOT part of `npm test` — real
 * network access, real `gh`/`git` credentials, a real, disposable GitHub
 * repository. Run explicitly: `npm run verify:github-workflow-valid`.
 *
 * This project's own `yaml` package agreeing that the fixed
 * `.github/workflows/nexus-alignment.yml` parses (checked hermetically in
 * `test/repository.test.ts`) is not the strongest possible evidence —
 * GitHub Actions' own YAML handling is. Workflows triggered by
 * `pull_request` are read from the PR's *base* branch, not the head
 * branch a PR was opened from, so merely opening a PR (Iteration 17's
 * own real demonstration) never actually exercises this. This script
 * pushes the fixed workflow via the real branch/PR mechanism
 * (unmodified), merges the PR onto the default branch, and then asks
 * GitHub's own Actions API whether it registered the workflow at all —
 * an invalid workflow file is silently never listed, not loudly
 * rejected, so a real listing is the only real confirmation.
 *
 * `--keep`: skip deletion and print a ready-to-run manual cleanup
 * command instead, so the repository can be inspected first.
 * `npm run verify:github-workflow-valid -- --keep`.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { openDb } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { deleteRepository, GhCliVcsProvider } from "../repository/gh-cli-vcs-provider.js";
import { declareRepository, generateProjection, provisionRepository, registerMapping } from "../repository/lifecycle.js";

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

console.log("=== Iteration 20 verification: does GitHub Actions itself accept the fixed CI workflow? ===\n");

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

const suffix = Date.now();
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('prod.iter20', 'product', null, 'Iteration 20')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('dom.iter20', 'domain', 'prod.iter20', 'Iteration 20')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('subsys.iter20', 'subsystem', 'dom.iter20', 'Iteration 20')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('comp.iter20-validation', 'component', 'subsys.iter20', 'Iteration 20 Validation')`);

const repoName = `nexus-iter20-workflow-valid-${suffix}`;
const repoId = `repo.iter20-workflow-valid-${suffix}`;
const provider = new GhCliVcsProvider("private");

console.log(`\n--- Provisioning one real, private repository: ${repoName} ---`);
await declareRepository(db, { id: repoId, name: repoName, provider: "gh-cli" });
await provisionRepository(db, repoId, provider);
await registerMapping(db, repoId, "comp.iter20-validation", true);

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

console.log("\n--- Rendering real projection files, including the Iteration 20-fixed CI workflow ---");
const files = await generateProjection(db, repoId, "v1");
const workflowFile = files.find((f) => f.path === ".github/workflows/nexus-alignment.yml");
check("generateProjection rendered the CI workflow file", !!workflowFile, files.map((f) => f.path));

console.log("\n--- Pushing a real branch and opening a real PR (Iteration 17's mechanism, unmodified) ---");
const branch = "nexus/bootstrap";
const { prUrl } = await provider.openPullRequestWithChanges({
  providerRef,
  branch,
  baseBranch,
  files,
  title: "Nexus bootstrap: initial managed projection",
  body: "Opened by Iteration 20's verify:github-workflow-valid script — validates the fixed CI workflow's real YAML validity by merging it onto the default branch.",
});
check("openPullRequestWithChanges returned a real PR URL", /^https:\/\/github\.com\//.test(prUrl), prUrl);

console.log("\n--- Merging the PR onto the default branch (workflows triggered by pull_request are read from the base branch, not the head) ---");
try {
  await execFileAsync("gh", ["pr", "merge", prUrl, "--merge", "--delete-branch=false"]);
  check("PR merged onto the default branch", true);
} catch (err) {
  check("PR merged onto the default branch", false, String(err));
}

console.log("\n--- Asking GitHub's own Actions API whether it registered the workflow at all ---");
console.log("(an invalid workflow file is silently never listed — not loudly rejected — so a real listing is the only real confirmation)");
try {
  const { stdout } = await execFileAsync("gh", [
    "api",
    `repos/${providerRef}/actions/workflows`,
  ]);
  const parsed = JSON.parse(stdout) as { total_count: number; workflows: Array<{ name: string; path: string; state: string }> };
  console.log("(GitHub's own workflow registry for this repository):");
  console.log(JSON.stringify(parsed, null, 2));
  const registered = parsed.workflows.find((w) => w.path === ".github/workflows/nexus-alignment.yml");
  check(
    "GitHub Actions registered nexus-alignment.yml as a real, active workflow",
    registered?.state === "active",
    registered ?? "not found in workflows list",
  );
} catch (err) {
  check("GitHub Actions workflow registry check", false, String(err));
}

console.log(`\n--- Repository left for inspection ---`);
console.log(`Repository: https://github.com/${providerRef}`);

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
