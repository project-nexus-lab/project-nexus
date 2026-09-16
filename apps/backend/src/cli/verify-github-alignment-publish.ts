/**
 * Real-GitHub Nexus-initiated alignment publishing verification for
 * Iteration 21 (`docs/history/iteration-21/SCOPE.md`), resolving
 * `docs/PROJECT_KNOWLEDGE.md`'s Open Question #7. NOT part of `npm test`
 * — real network access, real `gh`/`git` credentials, a real, disposable
 * GitHub repository. Run explicitly: `npm run
 * verify:github-alignment-publish`.
 *
 * Pushes a real repository carrying the new, smaller projection (no
 * `nexusBaseUrl`, no `.github/workflows/nexus-alignment.yml`), merges it
 * onto the default branch, then calls `verifyAndPublishAlignment`
 * against it twice: once while the repository's committed
 * `.nexus/repository.json` matches live Nexus state (expect a real
 * `success` Commit Status), and once after the live mapping is changed
 * out from under it without re-pushing (expect a real `failure` Commit
 * Status naming the mismatch). Both are independently confirmed via `gh
 * api repos/.../commits/{sha}/status` — the same
 * independent-verification bar every real-GitHub iteration this project
 * has used, not merely that the calls didn't throw.
 *
 * Also confirms `getFileAtRef` directly against real GitHub state: a
 * real SHA and real content for a file that exists, `null` for one that
 * doesn't (Acceptance Criterion 3).
 *
 * `--keep`: skip deletion and print a ready-to-run manual cleanup
 * command instead, so the repository can be inspected first.
 * `npm run verify:github-alignment-publish -- --keep`.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { openDb } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { verifyAndPublishAlignment } from "../graph/alignment.js";
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

interface CombinedStatus {
  state: string;
  statuses: Array<{ context: string; state: string; description: string }>;
}

async function fetchCombinedStatus(providerRef: string, sha: string): Promise<CombinedStatus> {
  const { stdout } = await execFileAsync("gh", ["api", `repos/${providerRef}/commits/${sha}/status`]);
  return JSON.parse(stdout) as CombinedStatus;
}

const keep = process.argv.includes("--keep");

console.log("=== Iteration 21 verification: Nexus verifies and publishes alignment from outside, via a real Commit Status ===\n");

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

await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('prod.iter21', 'product', null, 'Iteration 21')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('dom.iter21', 'domain', 'prod.iter21', 'Iteration 21')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('subsys.iter21', 'subsystem', 'dom.iter21', 'Iteration 21')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('comp.iter21-validation', 'component', 'subsys.iter21', 'Iteration 21 Validation')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('comp.iter21-extra', 'component', 'subsys.iter21', 'Iteration 21 Extra')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('cap.iter21-validation', 'capability', 'subsys.iter21', 'Iteration 21 Validation Capability')`);
await db.query(
  `insert into architecture.element_provision (component_id, capability_id, is_primary) values ('comp.iter21-validation', 'cap.iter21-validation', true)`,
);

const repoName = `nexus-iter21-alignment-publish-${suffix}`;
const repoId = `repo.iter21-alignment-publish-${suffix}`;
const provider = new GhCliVcsProvider("private");

console.log(`\n--- Provisioning one real, private repository: ${repoName} ---`);
await declareRepository(db, { id: repoId, name: repoName, provider: "gh-cli" });
await provisionRepository(db, repoId, provider);
await registerMapping(db, repoId, "comp.iter21-validation", true);

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

console.log("\n--- Rendering real projection files — the new, smaller baseline (no nexusBaseUrl, no CI workflow) ---");
const files = await generateProjection(db, repoId, "v1");
check(
  "generateProjection rendered exactly two files",
  files.length === 2 &&
    files.map((f) => f.path).every((p) => p === ".nexus/repository.json" || p === ".nexus/architecture.snapshot.json"),
  files.map((f) => f.path),
);

console.log("\n--- Pushing and merging a real branch onto the default branch (Iteration 17's mechanism, unmodified) ---");
const branch = "nexus/bootstrap";
const { prUrl } = await provider.openPullRequestWithChanges({
  providerRef,
  branch,
  baseBranch,
  files,
  title: "Nexus bootstrap: initial managed projection",
  body: "Opened by Iteration 21's verify:github-alignment-publish script.",
});
check("openPullRequestWithChanges returned a real PR URL", /^https:\/\/github\.com\//.test(prUrl), prUrl);

try {
  await execFileAsync("gh", ["pr", "merge", prUrl, "--merge", "--delete-branch=false"]);
  check("PR merged onto the default branch", true);
} catch (err) {
  check("PR merged onto the default branch", false, String(err));
}

console.log("\n--- getFileAtRef against real GitHub state (Acceptance Criterion 3) ---");
const existingFile = await provider.getFileAtRef(providerRef, ".nexus/repository.json", baseBranch);
check(
  "getFileAtRef returns real content and a real commit SHA for a file that exists",
  existingFile !== null && existingFile.content.includes(repoId) && /^[0-9a-f]{40}$/.test(existingFile.sha),
  existingFile ? { sha: existingFile.sha } : null,
);
const missingFile = await provider.getFileAtRef(providerRef, ".nexus/does-not-exist.json", baseBranch);
check("getFileAtRef returns null for a file that does not exist at that ref", missingFile === null, missingFile);

console.log("\n--- verifyAndPublishAlignment while the repository is genuinely aligned (expect success) ---");
const okResult = await verifyAndPublishAlignment(db, repoId, provider);
check("verifyAndPublishAlignment reports status: success", okResult.status === "success", okResult);
if (okResult.sha) {
  try {
    const combined = await fetchCombinedStatus(providerRef, okResult.sha);
    const posted = combined.statuses.find((s) => s.context === "nexus/alignment");
    check(
      "gh api independently confirms a real 'success' Commit Status was posted",
      posted?.state === "success" && posted.description === okResult.description,
      posted,
    );
  } catch (err) {
    check("gh api independently confirms the posted Commit Status", false, String(err));
  }
} else {
  check("verifyAndPublishAlignment resolved a real commit SHA to check the status against", false, okResult);
}

console.log("\n--- Changing live Nexus state out from under the already-pushed file (expect failure) ---");
// A direct SQL insert, not registerMapping() — the bootstrap state machine
// (`src/repository/lifecycle.ts`) has already moved this repository past
// 'mapped' by this point (generateProjection() advanced it to
// 'bootstrapped'), and registerMapping() rightly refuses a mapping change
// from there. What's being simulated here is live Nexus state drifting
// out from under an already-pushed, unchanged file — not a legal
// lifecycle transition — so it goes straight at the live mapping table
// `verifyRepositoryAlignment` itself reads.
await db.query(
  `insert into repo.repository_component (repository_id, component_id, is_primary) values ($1, 'comp.iter21-extra', false)`,
  [repoId],
);
const failResult = await verifyAndPublishAlignment(db, repoId, provider);
check("verifyAndPublishAlignment reports status: failure", failResult.status === "failure", failResult);
check(
  "the failure is a real mapping-mismatch, and its description names it",
  (failResult.verification?.failures ?? []).some((f) => f.code === "mapping-mismatch") &&
    failResult.description.includes("live mapping"),
  failResult.description,
);
if (failResult.sha) {
  try {
    const combined = await fetchCombinedStatus(providerRef, failResult.sha);
    const posted = combined.statuses.find((s) => s.context === "nexus/alignment");
    check(
      "gh api independently confirms the Commit Status now shows 'failure' with the same description",
      posted?.state === "failure" && posted.description === failResult.description,
      posted,
    );
  } catch (err) {
    check("gh api independently confirms the updated Commit Status", false, String(err));
  }
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
