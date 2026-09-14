import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type {
  VcsProvider,
  VcsProviderCreateInput,
  VcsProviderCreateResult,
  VcsProviderOpenPullRequestInput,
  VcsProviderOpenPullRequestResult,
} from "./vcs-provider.js";

const execFileAsync = promisify(execFile);

/**
 * A real VcsProvider — MVP_ARCHITECTURE_V2 §10.2, Iteration 5
 * (`docs/history/iteration-5/SCOPE.md`: `create()`, shelling out to `gh
 * repo create`) and Iteration 17
 * (`docs/history/iteration-17/SCOPE.md`: `openPullRequestWithChanges()`,
 * shelling out to `git` and `gh pr create` to cover §10.2 step 5's
 * remaining push/branch/PR half). No new npm dependency for either — both
 * reuse whatever credentials `gh auth login` already stored (§10.2's port
 * does not model credentials at all, and this adapter introduces none).
 *
 * Kept deliberately separate from `vcs-provider.ts` (which holds the port
 * and `NoopVcsProvider`, used by every other test in this project): this
 * file is the only one with a real, external, non-hermetic side effect —
 * that boundary should be visible from the file layout, not just from
 * reading the code.
 */

export type GhCliErrorReason =
  | "not-installed"
  | "not-authenticated"
  | "name-taken"
  | "network"
  | "push-rejected"
  | "pr-exists"
  | "unknown";

export class GhCliError extends Error {
  constructor(
    public readonly reason: GhCliErrorReason,
    public readonly command: string,
    detail: string,
  ) {
    super(`gh CLI failed (${reason}) running \`${command}\`: ${detail}`);
    this.name = "GhCliError";
  }
}

interface ExecFileErrorLike {
  code?: number | string;
  stderr?: string;
  message?: string;
}

/**
 * `gh repo create` has no `--json` flag (checked directly against `gh
 * repo create --help` while building this, not assumed from
 * `docs/history/iteration-5/SCOPE.md`, which had assumed one existed —
 * the first concrete "contact with reality" finding this iteration
 * produced, before a single line of adapter code was written). Error
 * mapping is therefore stderr-pattern-based, which is inherently more
 * fragile than a structured error code would be — disclosed here, not
 * hidden, and named directly in `docs/history/iteration-5/REPORT.md`.
 *
 * Shared by every `gh`/`git` shell-out in this file (Iteration 17 extends
 * it to `git push`/`gh pr create` failures rather than writing a second,
 * divergent mapper) — `command` disambiguates `already exists` between a
 * repo-name collision (`gh repo create`) and an already-open PR for the
 * same branch (`gh pr create`), which read identically in `gh`'s own
 * stderr otherwise.
 */
export function mapGhError(err: unknown, command: string): GhCliError {
  const e = err as ExecFileErrorLike;
  const stderr = (e.stderr ?? "").toString();
  const message = e.message ?? String(err);

  if (e.code === "ENOENT") {
    return new GhCliError("not-installed", command, "gh executable not found on PATH");
  }
  if (/not logged in|authentication|auth login|auth status|could not read username|terminal prompts disabled/i.test(stderr)) {
    return new GhCliError("not-authenticated", command, stderr || message);
  }
  if (/protected branch|non-fast-forward|\[rejected\]/i.test(stderr)) {
    return new GhCliError("push-rejected", command, stderr || message);
  }
  if (/already exists|422/i.test(stderr)) {
    if (/pr create/.test(command)) {
      return new GhCliError("pr-exists", command, stderr || message);
    }
    return new GhCliError("name-taken", command, stderr || message);
  }
  if (/ENOTFOUND|ECONNREFUSED|network|timeout/i.test(stderr) || /ENOTFOUND|ECONNREFUSED/i.test(message)) {
    return new GhCliError("network", command, stderr || message);
  }
  return new GhCliError("unknown", command, stderr || message);
}

/** `gh repo create` prints the repository URL on success (no `--json`); extracts `owner/name` from it. */
export function extractOwnerRepo(stdout: string): string | null {
  const match = stdout.trim().match(/github\.com[/:]([^/\s]+\/[^/\s.]+)/i);
  return match ? (match[1] as string) : null;
}

/** `gh pr create` prints the PR's URL on success; extracts it verbatim. */
export function extractPrUrl(stdout: string): string | null {
  const match = stdout.trim().match(/https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/);
  return match ? match[0] : null;
}

export class GhCliVcsProvider implements VcsProvider {
  readonly id = "gh-cli";

  constructor(private readonly visibility: "private" | "public" = "private") {}

  async create(input: VcsProviderCreateInput): Promise<VcsProviderCreateResult> {
    const args = ["repo", "create", input.name, `--${this.visibility}`];
    let stdout: string;
    try {
      const result = await execFileAsync("gh", args);
      stdout = result.stdout;
    } catch (err) {
      throw mapGhError(err, `gh ${args.join(" ")}`);
    }

    const providerRef = extractOwnerRepo(stdout);
    if (!providerRef) {
      throw new GhCliError(
        "unknown",
        `gh ${args.join(" ")}`,
        `repository was likely created but its owner/name could not be parsed from output: ${JSON.stringify(stdout)}`,
      );
    }
    return { providerRef };
  }

  private async runGit(args: string[], cwd: string): Promise<string> {
    try {
      const result = await execFileAsync("git", args, { cwd });
      return result.stdout;
    } catch (err) {
      throw mapGhError(err, `git ${args.join(" ")}`);
    }
  }

  /**
   * §10.2 step 5's remaining half (Iteration 17,
   * `docs/history/iteration-17/SCOPE.md`): clone into a fresh temp
   * directory, establish an initial commit on the base branch if the
   * repository has none yet (a freshly `gh repo create`d repository has
   * zero commits and no branches — "What We Only Believe" #1), branch,
   * write the given files, commit, push, and open a real PR.
   *
   * `gh auth setup-git` is called defensively, every time, rather than
   * assumed already configured — idempotent and harmless if it already
   * is (see SCOPE.md's own named risk #2).
   */
  async openPullRequestWithChanges(
    input: VcsProviderOpenPullRequestInput,
  ): Promise<VcsProviderOpenPullRequestResult> {
    try {
      await execFileAsync("gh", ["auth", "setup-git"]);
    } catch (err) {
      throw mapGhError(err, "gh auth setup-git");
    }

    const workDir = await mkdtemp(join(tmpdir(), "nexus-bootstrap-"));
    try {
      await this.runGit(
        ["clone", `https://github.com/${input.providerRef}.git`, workDir],
        process.cwd(),
      );
      // A clone has no local git identity of its own to fall back on —
      // set one locally so `git commit` below cannot fail on a missing
      // global user.name/user.email, an unrelated prerequisite this
      // iteration's actual question does not concern itself with.
      await this.runGit(["config", "user.email", "nexus-bootstrap@localhost"], workDir);
      await this.runGit(["config", "user.name", "Nexus Bootstrap"], workDir);

      const hasCommits = await this.runGit(["rev-parse", "--verify", "HEAD"], workDir)
        .then(() => true)
        .catch(() => false);
      if (!hasCommits) {
        // Cloning an empty repository leaves HEAD symbolically pointing
        // at the remote's default branch name already (unborn, no commit
        // yet) — `checkout -b <baseBranch>` would fail claiming the
        // branch "already exists" in that case. Only create it if HEAD
        // doesn't already refer to it. `rev-parse --abbrev-ref HEAD`
        // requires HEAD to resolve to a real commit and fails outright
        // on an unborn branch ("ambiguous argument 'HEAD'") — checked
        // directly against a real freshly-cloned empty repository, not
        // assumed; `symbolic-ref` reads the ref pointer itself, no
        // history required.
        const currentBranch = (
          await this.runGit(["symbolic-ref", "--short", "HEAD"], workDir)
        ).trim();
        if (currentBranch !== input.baseBranch) {
          await this.runGit(["checkout", "-b", input.baseBranch], workDir);
        }
        await this.runGit(["commit", "--allow-empty", "-m", "Initial commit (Nexus bootstrap)"], workDir);
        await this.runGit(["push", "-u", "origin", input.baseBranch], workDir);
      }

      await this.runGit(["checkout", "-b", input.branch], workDir);

      for (const file of input.files) {
        const filePath = join(workDir, file.path);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, file.content, "utf8");
      }

      await this.runGit(["add", "-A"], workDir);
      await this.runGit(["commit", "-m", input.title], workDir);
      await this.runGit(["push", "-u", "origin", input.branch], workDir);

      let stdout: string;
      try {
        const result = await execFileAsync(
          "gh",
          [
            "pr",
            "create",
            "--title",
            input.title,
            "--body",
            input.body,
            "--head",
            input.branch,
            "--base",
            input.baseBranch,
          ],
          { cwd: workDir },
        );
        stdout = result.stdout;
      } catch (err) {
        throw mapGhError(err, "gh pr create");
      }

      const prUrl = extractPrUrl(stdout);
      if (!prUrl) {
        throw new GhCliError(
          "unknown",
          "gh pr create",
          `PR was likely opened but its URL could not be parsed from output: ${JSON.stringify(stdout)}`,
        );
      }
      return { prUrl };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}

/**
 * Not part of the VcsProvider port — the port has no delete method (§10.2
 * never describes deletion; it is not part of the bootstrap flow). Exists
 * only so the verification script can clean up after itself. Requires the
 * `delete_repo` OAuth scope, which `create` does not — checked directly
 * against `gh repo delete --help`, and not assumed to be already granted.
 */
export async function deleteRepository(ownerRepo: string): Promise<void> {
  try {
    await execFileAsync("gh", ["repo", "delete", ownerRepo, "--yes"]);
  } catch (err) {
    throw mapGhError(err, `gh repo delete ${ownerRepo} --yes`);
  }
}
