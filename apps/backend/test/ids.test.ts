import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertId,
  assertPrefixMatchesKind,
  InvalidIdError,
  isValidArchitectureElementId,
  isValidId,
  isValidWorkItemId,
} from "../src/ids/ids.js";

test("valid IDs accepted per §6.1 prefix table", () => {
  assert.equal(isValidId("prod.trade-platform", "product"), true);
  assert.equal(isValidId("dom.billing", "domain"), true);
  assert.equal(isValidId("subsys.invoice", "subsystem"), true);
  assert.equal(isValidId("comp.invoice-service", "component"), true);
  assert.equal(isValidId("cap.create-invoice", "capability"), true);
  assert.equal(isValidId("repo.billing-service", "repository"), true);
  assert.equal(isValidId("init.q1-billing", "initiative"), true);
  assert.equal(isValidId("epic.invoice-discounts", "epic"), true);
  assert.equal(isValidId("feat.invoice-discounts", "feature"), true);
  assert.equal(isValidId("task.invoice-discount-validation", "task"), true);
  assert.equal(isValidId("ac.discount-applied", "acceptanceCriterion"), true);
  assert.equal(isValidId("wpp.implementation", "workPackageProfile"), true);
  assert.equal(isValidId("role.implementer", "agentRole"), true);
});

test("invalid IDs rejected", () => {
  assert.equal(isValidId("Comp.InvoiceService", "component"), false, "uppercase");
  assert.equal(isValidId("widget.invoice-service", "component"), false, "wrong prefix");
  assert.equal(isValidId("compinvoiceservice", "component"), false, "no dot");
  assert.equal(isValidId("comp.invoice-", "component"), false, "trailing hyphen");
  assert.equal(isValidId("comp.-invoice", "component"), false, "leading hyphen");
  assert.equal(isValidId("comp..invoice", "component"), false, "double dot");
  assert.equal(isValidId("comp.invoice_service", "component"), false, "underscore not allowed");
  assert.equal(isValidId("", "component"), false, "empty string");
});

test("assertId throws InvalidIdError with the offending id and kind", () => {
  assert.throws(() => assertId("bad id", "component"), (err) => {
    assert.ok(err instanceof InvalidIdError);
    assert.equal(err.id, "bad id");
    assert.equal(err.kind, "component");
    return true;
  });
  assert.equal(assertId("comp.invoice-service", "component"), "comp.invoice-service");
});

test("architecture element IDs share one pattern across the four kinds", () => {
  assert.equal(isValidArchitectureElementId("prod.x"), true);
  assert.equal(isValidArchitectureElementId("dom.x"), true);
  assert.equal(isValidArchitectureElementId("subsys.x"), true);
  assert.equal(isValidArchitectureElementId("comp.x"), true);
  assert.equal(isValidArchitectureElementId("cap.x"), true);
  assert.equal(isValidArchitectureElementId("repo.x"), false, "repository is not an architecture element");
});

test("work item IDs share one pattern across the four kinds", () => {
  assert.equal(isValidWorkItemId("init.x"), true);
  assert.equal(isValidWorkItemId("epic.x"), true);
  assert.equal(isValidWorkItemId("feat.x"), true);
  assert.equal(isValidWorkItemId("task.x"), true);
  assert.equal(isValidWorkItemId("ac.x"), false, "acceptance criterion is not a work item");
});

test("assertPrefixMatchesKind catches an id/kind mismatch at the import boundary", () => {
  assert.throws(() => assertPrefixMatchesKind("cap.foo", "component"));
  assert.doesNotThrow(() => assertPrefixMatchesKind("comp.foo", "component"));
});
