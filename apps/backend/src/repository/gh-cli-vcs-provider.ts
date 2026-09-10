import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { VcsProvider, VcsProviderCreateInput, VcsProviderCreateResult } from "./vcs-provider.js";

const execFileAsync = promisify(execFile);

/**
 * A real VcsProvider — MVP_ARCHITECTURE_V2 §10.2, Iteration 5
 * (`docs/history/iteration-5/SCOPE.md`). Shells out to `gh repo create`;
 * no new npm dependency, reuses whatever credentials `gh auth login`
 * already stored (§10.2's port does not model credentials at all, and
 * this adapter introduces none).
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
 */
export function mapGhError(err: unknown, command: string): GhCliError {
  const e = err as ExecFileErrorLike;
  const stderr = (e.stderr ?? "").toString();
  const message = e.message ?? String(err);

  if (e.code === "ENOENT") {
    return new GhCliError("not-installed", command, "gh executable not found on PATH");
  }
  if (/not logged in|authentication|auth login|auth status/i.test(stderr)) {
    return new GhCliError("not-authenticated", command, stderr || message);
  }
  if (/already exists|name already exists|422/i.test(stderr)) {
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
