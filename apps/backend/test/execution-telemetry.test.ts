import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { NexusDb } from "../src/db/client.js";
import {
  deriveGrantContextFacts,
  deriveWorkPackageContextFacts,
  recordRunTelemetry,
} from "../src/execution/telemetry.js";
import { generateUlid } from "../src/ids/ids.js";
import { freshDb } from "./helpers.js";

let db: NexusDb;
before(async () => {
  db = await freshDb();
});
after(async () => {
  await db.close();
});

test("deriveWorkPackageContextFacts counts real fields and measures real byte size", () => {
  const workPackage = { capabilities: ["cap.a", "cap.b"], components: ["comp.a"], repositories: [] };
  const facts = deriveWorkPackageContextFacts(workPackage);
  assert.equal(facts.capabilityCount, 2);
  assert.equal(facts.componentCount, 1);
  assert.equal(facts.repositoryCount, 0);
  assert.equal(facts.workPackageSizeBytes, Buffer.byteLength(JSON.stringify(workPackage), "utf8"));
});

test("deriveWorkPackageContextFacts.workPackageSizeTokens is always null — no tokenizer exists, never estimated", () => {
  const facts = deriveWorkPackageContextFacts({ capabilities: [], components: [], repositories: [] });
  assert.equal(facts.workPackageSizeTokens, null);
});

test("deriveWorkPackageContextFacts returns null counts, not zero, for a field that is entirely absent", () => {
  const facts = deriveWorkPackageContextFacts({});
  assert.equal(facts.capabilityCount, null);
  assert.equal(facts.componentCount, null);
  assert.equal(facts.repositoryCount, null);
});

test("deriveGrantContextFacts counts the real grant arrays", () => {
  const facts = deriveGrantContextFacts({ allowedElementIds: ["comp.a", "comp.b"], allowedRepositoryIds: ["repo.a"] });
  assert.deepEqual(facts, { grantElementCount: 2, grantRepositoryCount: 1 });
});

test("recordRunTelemetry: a full row round-trips through the real schema, nulls stay null", async () => {
  const runId = `run.${generateUlid()}`;
  const startedAt = new Date("2026-01-01T00:00:00.000Z");
  const completedAt = new Date("2026-01-01T00:00:05.000Z");
  await recordRunTelemetry(db, {
    runId,
    workPackageId: "wp.test-telemetry",
    runtimeAdapterId: "claude-sdk",
    startedAt,
    completedAt,
    durationMs: 5000,
    inputTokens: 120,
    outputTokens: 40,
    totalTokens: 160,
    workPackageSizeBytes: 512,
    workPackageSizeTokens: null,
    capabilityCount: 1,
    componentCount: 1,
    repositoryCount: 0,
    grantElementCount: 1,
    grantRepositoryCount: 0,
    accessedElementCount: 1,
    accessedRepositoryCount: null,
  });

  const { rows } = await db.query<Record<string, unknown>>(
    `select * from execution.run_telemetry where run_id = $1`,
    [runId],
  );
  const row = rows[0];
  assert.ok(row, "expected a row to exist");
  assert.equal(row.work_package_id, "wp.test-telemetry");
  assert.equal(row.runtime_adapter_id, "claude-sdk");
  assert.equal(Number(row.duration_ms), 5000);
  assert.equal(Number(row.input_tokens), 120);
  assert.equal(Number(row.output_tokens), 40);
  assert.equal(Number(row.total_tokens), 160);
  assert.equal(row.work_package_size_tokens, null);
  assert.equal(row.accessed_repository_count, null);
});

test("recordRunTelemetry: a run that never reached a terminal result still leaves a row (started_at known, the rest null)", async () => {
  const runId = `run.${generateUlid()}`;
  await recordRunTelemetry(db, {
    runId,
    workPackageId: "wp.test-incomplete",
    runtimeAdapterId: "claude-sdk",
    startedAt: new Date(),
    completedAt: null,
    durationMs: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    workPackageSizeBytes: 100,
    workPackageSizeTokens: null,
    capabilityCount: 0,
    componentCount: 0,
    repositoryCount: 0,
    grantElementCount: 0,
    grantRepositoryCount: 0,
    accessedElementCount: 0,
    accessedRepositoryCount: null,
  });

  const { rows } = await db.query<Record<string, unknown>>(
    `select completed_at, duration_ms, input_tokens from execution.run_telemetry where run_id = $1`,
    [runId],
  );
  assert.deepEqual(rows[0], { completed_at: null, duration_ms: null, input_tokens: null });
});

test("execution.run_telemetry.run_id rejects an id that does not match run.<ulid>, the same pattern execution_run.id already enforces", async () => {
  await assert.rejects(
    () =>
      recordRunTelemetry(db, {
        runId: "run.not-a-ulid",
        workPackageId: "wp.test-bad-id",
        runtimeAdapterId: "claude-sdk",
        startedAt: new Date(),
        completedAt: null,
        durationMs: null,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        workPackageSizeBytes: null,
        workPackageSizeTokens: null,
        capabilityCount: null,
        componentCount: null,
        repositoryCount: null,
        grantElementCount: null,
        grantRepositoryCount: null,
        accessedElementCount: null,
        accessedRepositoryCount: null,
      }),
    /check constraint|violates/,
  );
});

test("execution.run_telemetry has no cost column — no cost calculation is captured, by design", async () => {
  const { rows } = await db.query<{ column_name: string }>(
    `select column_name from information_schema.columns where table_schema = 'execution' and table_name = 'run_telemetry'`,
  );
  const columns = rows.map((r) => r.column_name);
  assert.ok(!columns.some((c) => c.includes("cost")), `expected no cost-related column, found: ${columns.join(", ")}`);
});
