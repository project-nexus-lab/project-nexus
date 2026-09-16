import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { NexusDb } from "../src/db/client.js";
import { verifyAndPublishAlignment } from "../src/graph/alignment.js";
import { wrapManagedRegion } from "../src/repository/generate.js";
import { NoopVcsProvider } from "../src/repository/vcs-provider.js";
import type {
  VcsProvider,
  VcsProviderCommitStatusInput,
  VcsProviderCreateResult,
  VcsProviderFileAtRef,
  VcsProviderOpenPullRequestResult,
} from "../src/repository/vcs-provider.js";
import { seededDb } from "./helpers.js";

let db: NexusDb;
before(async () => {
  db = await seededDb();
});
after(async () => {
  await db.close();
});

/**
 * A minimal, non-real `VcsProvider` for hermetic tests: returns one canned
 * file (or `null`) and records every posted Commit Status. `NoopVcsProvider`
 * alone can't exercise most of `verifyAndPublishAlignment`'s branches — its
 * own `getFileAtRef` always returns `null`, which is exactly one of the six
 * branches this file tests (`create`/`openPullRequestWithChanges` are
 * neither called by `verifyAndPublishAlignment` nor needed by these tests,
 * so they throw if reached — a bug in the test, not a real code path).
 */
class FakeVcsProvider implements VcsProvider {
  readonly id = "fake";
  readonly posted: Array<{ providerRef: string; sha: string; input: VcsProviderCommitStatusInput }> = [];
  constructor(private readonly file: VcsProviderFileAtRef | null) {}

  async create(): Promise<VcsProviderCreateResult> {
    throw new Error("FakeVcsProvider.create is not used by these tests");
  }
  async openPullRequestWithChanges(): Promise<VcsProviderOpenPullRequestResult> {
    throw new Error("FakeVcsProvider.openPullRequestWithChanges is not used by these tests");
  }
  async getFileAtRef(): Promise<VcsProviderFileAtRef | null> {
    return this.file;
  }
  async postCommitStatus(providerRef: string, sha: string, input: VcsProviderCommitStatusInput): Promise<void> {
    this.posted.push({ providerRef, sha, input });
  }
}

const noop = new NoopVcsProvider();

test("an unknown repositoryId reports status: error and posts nothing", async () => {
  const result = await verifyAndPublishAlignment(db, "repo.does-not-exist", noop);
  assert.equal(result.status, "error");
  assert.match(result.description, /does not exist/);
  assert.equal(result.sha, null);
  assert.equal(result.verification, null);
});

test("a repository that has not been provisioned (no provider_ref) reports status: error and posts nothing", async () => {
  await db.query(
    `insert into repo.repository (id, name, provider) values ('repo.iter21-unprovisioned', 'unprovisioned', 'github')`,
  );
  const result = await verifyAndPublishAlignment(db, "repo.iter21-unprovisioned", noop);
  assert.equal(result.status, "error");
  assert.match(result.description, /has not been provisioned/);
  assert.equal(result.sha, null);
  assert.equal(result.verification, null);
});

test("a repository whose .nexus/repository.json is missing at its default branch reports status: error and posts nothing", async () => {
  // repo.billing-service is already provisioned in the seed
  // (provider_ref: acme/billing-service) — NoopVcsProvider.getFileAtRef
  // always returns null, exactly the "file missing at ref" branch.
  const result = await verifyAndPublishAlignment(db, "repo.billing-service", noop);
  assert.equal(result.status, "error");
  assert.match(result.description, /not found/);
  assert.equal(result.sha, null);
  assert.equal(result.verification, null);
});

test("a committed file with no managed region reports status: error, carries the real sha, and posts nothing", async () => {
  const fake = new FakeVcsProvider({ content: "no markers here at all", sha: "sha-no-region" });
  const result = await verifyAndPublishAlignment(db, "repo.billing-service", fake);
  assert.equal(result.status, "error");
  assert.match(result.description, /no managed region/);
  assert.equal(result.sha, "sha-no-region");
  assert.equal(result.verification, null);
  assert.deepEqual(fake.posted, []);
});

test("a managed region that is not valid JSON reports status: error and posts nothing", async () => {
  const fake = new FakeVcsProvider({ content: wrapManagedRegion("not json at all {{{"), sha: "sha-bad-json" });
  const result = await verifyAndPublishAlignment(db, "repo.billing-service", fake);
  assert.equal(result.status, "error");
  assert.match(result.description, /not valid JSON/);
  assert.equal(result.sha, "sha-bad-json");
  assert.equal(result.verification, null);
  assert.deepEqual(fake.posted, []);
});

test("a managed region with the wrong shape (InvalidAlignmentRequestError) reports status: error and posts nothing", async () => {
  const fake = new FakeVcsProvider({
    content: wrapManagedRegion(JSON.stringify({ repositoryId: "repo.billing-service" /* componentIds missing */ })),
    sha: "sha-wrong-shape",
  });
  const result = await verifyAndPublishAlignment(db, "repo.billing-service", fake);
  assert.equal(result.status, "error");
  assert.match(result.description, /does not match the expected shape/);
  assert.equal(result.sha, "sha-wrong-shape");
  assert.equal(result.verification, null);
  assert.deepEqual(fake.posted, []);
});

test("a repository whose committed file matches live Nexus state posts a real 'success' Commit Status", async () => {
  const fake = new FakeVcsProvider({
    content: wrapManagedRegion(
      JSON.stringify({
        repositoryId: "repo.billing-service",
        componentIds: ["comp.invoice-service"],
        schemaVersion: 3,
        templateVersion: "v1",
      }),
    ),
    sha: "sha-aligned",
  });
  const result = await verifyAndPublishAlignment(db, "repo.billing-service", fake);
  assert.equal(result.status, "success");
  assert.equal(result.sha, "sha-aligned");
  assert.deepEqual(result.verification, { ok: true, failures: [], warnings: [] });
  assert.deepEqual(fake.posted, [
    {
      providerRef: "acme/billing-service",
      sha: "sha-aligned",
      input: { state: "success", context: "nexus/alignment", description: result.description },
    },
  ]);
});

test("a repository whose committed file no longer matches live Nexus state posts a real 'failure' Commit Status naming the mismatch", async () => {
  const fake = new FakeVcsProvider({
    content: wrapManagedRegion(
      JSON.stringify({
        repositoryId: "repo.billing-service",
        componentIds: ["comp.invoice-service", "comp.payment-service"],
        schemaVersion: 3,
        templateVersion: "v1",
      }),
    ),
    sha: "sha-drifted",
  });
  const result = await verifyAndPublishAlignment(db, "repo.billing-service", fake);
  assert.equal(result.status, "failure");
  assert.equal(result.sha, "sha-drifted");
  assert.ok(result.verification && !result.verification.ok);
  assert.ok(result.verification?.failures.some((f) => f.code === "mapping-mismatch"));
  assert.match(result.description, /^alignment failed:/);
  assert.deepEqual(fake.posted, [
    {
      providerRef: "acme/billing-service",
      sha: "sha-drifted",
      input: { state: "failure", context: "nexus/alignment", description: result.description },
    },
  ]);
});

test("a failure description long enough to exceed GitHub's real 140-character commit-status limit (confirmed directly against a real repository during /review, not assumed) is truncated before posting, and the returned result matches exactly what was posted", async () => {
  const fake = new FakeVcsProvider({
    content: wrapManagedRegion(
      JSON.stringify({
        repositoryId: "repo.billing-service",
        componentIds: [
          "comp.invoice-service",
          "comp.iter21-ghost-one",
          "comp.iter21-ghost-two",
          "comp.iter21-ghost-three",
        ],
        schemaVersion: 3,
        templateVersion: "v1",
      }),
    ),
    sha: "sha-long-failure",
  });
  const result = await verifyAndPublishAlignment(db, "repo.billing-service", fake);
  assert.equal(result.status, "failure");
  assert.ok(
    result.description.length <= 140,
    `expected description truncated to at most 140 chars, got ${result.description.length}`,
  );
  assert.equal(fake.posted.length, 1);
  assert.equal(fake.posted[0]?.input.description, result.description);
});
