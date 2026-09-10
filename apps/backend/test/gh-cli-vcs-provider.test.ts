import assert from "node:assert/strict";
import { test } from "node:test";
import { extractOwnerRepo, GhCliError, mapGhError } from "../src/repository/gh-cli-vcs-provider.js";

/**
 * Hermetic, offline tests of the two pure-function pieces of
 * `GhCliVcsProvider`: URL parsing and error classification. No network,
 * no real `gh` invocation — that's `src/cli/verify-github.ts`'s job (not
 * part of `npm test`; see `docs/history/iteration-5/REPORT.md` for why).
 *
 * `mapGhError`'s pattern matching is stderr-text-based, because
 * `gh repo create` has no `--json` output to check a structured field
 * against instead (checked directly against `gh repo create --help`
 * while building this — `docs/history/iteration-5/SCOPE.md` had assumed
 * `--json` would be available; it is not). That fragility is exactly why
 * it gets tested here explicitly, with fixtures approximating real `gh`
 * output as closely as this project could verify without a network call
 * per test run — not a guarantee that real `gh` output matches these
 * fixtures forever.
 */

test("extractOwnerRepo parses the owner/name out of gh repo create's URL output", () => {
  assert.equal(extractOwnerRepo("https://github.com/ketilaa/nexus-iter5-test\n"), "ketilaa/nexus-iter5-test");
  assert.equal(extractOwnerRepo("https://github.com/some-org/some-repo"), "some-org/some-repo");
});

test("extractOwnerRepo returns null for output it cannot parse", () => {
  assert.equal(extractOwnerRepo(""), null);
  assert.equal(extractOwnerRepo("something unexpected"), null);
});

test("mapGhError classifies a missing gh executable as not-installed", () => {
  const err = mapGhError({ code: "ENOENT", message: "spawn gh ENOENT" }, "gh repo create x --private");
  assert.ok(err instanceof GhCliError);
  assert.equal(err.reason, "not-installed");
});

test("mapGhError classifies an authentication failure as not-authenticated", () => {
  const err = mapGhError(
    { code: 1, stderr: "To use GitHub CLI in this environment, run `gh auth login`.\n" },
    "gh repo create x --private",
  );
  assert.equal(err.reason, "not-authenticated");
});

test("mapGhError classifies a name collision as name-taken", () => {
  const err = mapGhError(
    {
      code: 1,
      stderr:
        "HTTP 422: Repository creation failed. name already exists on this account (POST https://api.github.com/user/repos)\n",
    },
    "gh repo create x --private",
  );
  assert.equal(err.reason, "name-taken");
});

test("mapGhError classifies a network failure as network", () => {
  const err = mapGhError({ code: 1, stderr: "dial tcp: lookup api.github.com: no such host\nENOTFOUND\n" }, "gh repo create x --private");
  assert.equal(err.reason, "network");
});

test("mapGhError falls back to unknown for an unrecognized failure, rather than throwing during classification itself", () => {
  const err = mapGhError({ code: 1, stderr: "something gh has never said before" }, "gh repo create x --private");
  assert.equal(err.reason, "unknown");
});

test("GhCliError's message names the reason, the command, and the detail", () => {
  const err = mapGhError({ code: 1, stderr: "name already exists on this account" }, "gh repo create x --private");
  assert.match(err.message, /name-taken/);
  assert.match(err.message, /gh repo create x --private/);
  assert.match(err.message, /already exists/);
});
