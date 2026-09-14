/**
 * Real-GitHub Technology Profile projection verification for Iteration 19
 * (`docs/history/iteration-19/SCOPE.md`). NOT part of `npm test` — real
 * network access, real `gh`/`git` credentials, a real, disposable GitHub
 * repository. Run explicitly: `npm run verify:github-technology-profile`.
 *
 * Creates a real, accepted Decision and a real Technology Profile,
 * assigns it to a real Product's `backend` category, provisions one
 * real, private repository, maps its primary component, then drives the
 * existing, unmodified `generateProjection()` to confirm the resolved
 * profile actually reaches a fourth generated file
 * (`.nexus/technology-profile.json`) — reusing Iteration 17's real
 * push/branch/PR mechanism unmodified, and independently verifying the
 * pushed PR's own file list and content via `gh pr view`, not just this
 * script's own return values.
 *
 * `--keep`: skip deletion and print a ready-to-run manual cleanup
 * command instead, so the repository/branch/PR can be inspected first.
 * `npm run verify:github-technology-profile -- --keep`.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assignTechnologyProfile, createTechnologyProfile } from "../architecture/technology-profile.js";
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

console.log("=== Iteration 19 verification: a resolved Technology Profile reaches a real, generated repository ===\n");

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

// Minimal architecture — one Product, one primary component.
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('prod.iter19', 'product', null, 'Iteration 19')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('dom.iter19', 'domain', 'prod.iter19', 'Iteration 19')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('subsys.iter19', 'subsystem', 'dom.iter19', 'Iteration 19')`);
await db.query(`insert into architecture.element (id, kind, parent_id, name) values ('comp.iter19-validation', 'component', 'subsys.iter19', 'Iteration 19 Validation')`);

console.log("\n--- Creating a real, accepted Decision and a real Technology Profile ---");
await db.query(
  `insert into architecture.decision (id, title, status, statement)
   values ('adr.iter19-backend-stack', 'Backend stack: Java 24 + Gradle', 'accepted', 'The backend category standardizes on Java 24 with Gradle.')`,
);
const { id: profileId } = await createTechnologyProfile(db, {
  id: `tech.iter19-java24-gradle-${suffix}`,
  category: "backend",
  language: "Java",
  languageVersion: "24",
  buildSystem: "Gradle",
  decisionId: "adr.iter19-backend-stack",
  authoredBy: "human:po",
});
await assignTechnologyProfile(db, { productId: "prod.iter19", category: "backend", profileId });
check("Technology Profile created and assigned to prod.iter19's backend category", true, profileId);

const repoName = `nexus-iter19-tech-profile-${suffix}`;
const repoId = `repo.iter19-tech-profile-${suffix}`;
const provider = new GhCliVcsProvider("private");

console.log(`\n--- Provisioning one real, private repository: ${repoName} ---`);
await declareRepository(db, { id: repoId, name: repoName, provider: "gh-cli" });
await provisionRepository(db, repoId, provider);
await registerMapping(db, repoId, "comp.iter19-validation", true); // primary — this is what generateProjection() resolves against

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
check(
  "generateProjection rendered exactly four files, including .nexus/technology-profile.json",
  files.length === 4 && files.some((f) => f.path === ".nexus/technology-profile.json"),
  files.map((f) => f.path),
);

console.log("\n--- Pushing a real branch and opening a real PR (Iteration 17's mechanism, unmodified) ---");
const branch = "nexus/bootstrap";
const { prUrl } = await provider.openPullRequestWithChanges({
  providerRef,
  branch,
  baseBranch,
  files,
  title: "Nexus bootstrap: initial managed projection, including a resolved Technology Profile",
  body: "Opened by Iteration 19's verify:github-technology-profile script — validates that a resolved Technology Profile actually reaches a real, generated repository.",
});
check("openPullRequestWithChanges returned a real PR URL", /^https:\/\/github\.com\//.test(prUrl), prUrl);

console.log("\n--- Independently verifying the PR's real file list and the technology-profile file's real content ---");
try {
  const { stdout } = await execFileAsync("gh", ["pr", "view", prUrl, "--json", "state,files"]);
  const parsed = JSON.parse(stdout) as { state: string; files: Array<{ path: string }> };
  check("gh pr view confirms the PR is OPEN", parsed.state === "OPEN", parsed.state);
  const prFilePaths = parsed.files.map((f) => f.path).sort();
  check(
    "the PR really contains .nexus/technology-profile.json alongside the other three files",
    prFilePaths.includes(".nexus/technology-profile.json") && prFilePaths.length === 4,
    prFilePaths,
  );

  const { stdout: rawContent } = await execFileAsync("gh", [
    "api",
    `repos/${providerRef}/contents/.nexus/technology-profile.json?ref=${branch}`,
    "--jq",
    ".content",
  ]);
  const realFileContent = Buffer.from(rawContent.trim(), "base64").toString("utf8");
  console.log("(the real, pushed .nexus/technology-profile.json content):");
  console.log(realFileContent);
  check(
    "the real pushed file's content matches what generateProjection() actually rendered",
    realFileContent.trim() === files.find((f) => f.path === ".nexus/technology-profile.json")?.content.trim(),
  );
} catch (err) {
  check("gh pr view / gh api independently confirms the PR's real content", false, String(err));
}

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
