import test from "node:test";
import assert from "node:assert/strict";

import { handleBrowserHomeApiRequest, handleBrowserSearchApiRequest } from "../src/api/browser-api.ts";

function parseBody(body: string): any {
  return JSON.parse(body);
}

test("featured shelf projection is deterministic and deploy-ready", () => {
  const response = handleBrowserHomeApiRequest("/api/browser/home");
  assert.equal(response.status, 200);

  const payload = parseBody(response.body);
  const featured = payload.browser.featured.items;

  assert.ok(featured.length > 0);
  for (const item of featured) {
    assert.equal(item.deployReady, true);
  }
  assert.equal(
    payload.browser.featured.rule,
    "Deploy-ready gold/platinum first, then highest-ranked deploy-ready certified items.",
  );
});

test("category grouping is intention-first and stable", () => {
  const response = handleBrowserHomeApiRequest("/api/browser/home");
  const payload = parseBody(response.body);
  const categories = payload.browser.categories;

  const financial = categories.find((category: any) => category.categoryId === "financial");
  assert.ok(financial);
  assert.equal(financial.itemCount, 3);
  assert.ok(financial.subcategories.some((subcategory: any) => subcategory.subcategoryId === "investing"));
  assert.ok(financial.subcategories.some((subcategory: any) => subcategory.subcategoryId === "trading"));
});

test("certified browser item includes app-store and deploy provenance fields", () => {
  const response = handleBrowserHomeApiRequest("/api/browser/home");
  const payload = parseBody(response.body);
  const item = payload.browser.certified.items[0];

  assert.equal(typeof item.configId, "string");
  assert.equal(typeof item.intentionId, "string");
  assert.equal(typeof item.title, "string");
  assert.equal(typeof item.description, "string");
  assert.equal(typeof item.domain, "string");
  assert.equal(typeof item.subdomain, "string");
  assert.equal(typeof item.riskProfile, "string");
  assert.equal(typeof item.certificationLevel, "string");
  assert.equal(typeof item.rankingScore, "number");
  assert.equal(typeof item.benchmarkSummary, "string");
  assert.equal(typeof item.benchmarkScore, "number");
  assert.equal(typeof item.model, "string");
  assert.equal(typeof item.capabilitiesSummary, "string");
  assert.equal(typeof item.constraintsSummary, "string");
  assert.equal(typeof item.rankingExplanation, "string");
  assert.ok("certificateId" in item);
  assert.ok("benchmarkContractId" in item);
  assert.ok("runtimeEnvelopeHash" in item);
});

test("emerging browser item includes confidence and lineage fields", () => {
  const response = handleBrowserHomeApiRequest("/api/browser/home");
  const payload = parseBody(response.body);
  const item = payload.browser.emerging.items[0];

  assert.equal(typeof item.intentionId, "string");
  assert.equal(typeof item.title, "string");
  assert.equal(typeof item.description, "string");
  assert.equal(typeof item.domain, "string");
  assert.equal(typeof item.subdomain, "string");
  assert.equal(typeof item.confidenceScore, "number");
  assert.equal(typeof item.sourceSummary, "string");
  assert.ok(Array.isArray(item.sourceClusters));
  assert.ok(Array.isArray(item.linkedCells));
  assert.equal(typeof item.relatedIncomingToolCount, "number");
  assert.equal(typeof item.certifiedConfigurationExists, "boolean");
  assert.ok(["emerging", "certified", "promoted"].includes(item.state));
});

test("canonical deployment provenance remains available on certified cards", () => {
  const response = handleBrowserHomeApiRequest("/api/browser/home");
  const payload = parseBody(response.body);
  const cfg101 = payload.browser.certified.items.find((item: any) => item.configId === "CFG-101");

  assert.ok(cfg101);
  assert.equal(cfg101.certificateId, "CERT-101");
  assert.equal(cfg101.benchmarkContractId, "investing-low-risk-v1");
  assert.equal(cfg101.runtimeEnvelopeHash, "rehash-cfg-101-v1");
});

test("browser search preserves deterministic certified ordering", () => {
  const first = parseBody(handleBrowserSearchApiRequest("/api/browser/search?domain=financial&subdomain=investing").body);
  const second = parseBody(handleBrowserSearchApiRequest("/api/browser/search?domain=financial&subdomain=investing").body);

  const firstIds = first.browserSearch.certified.items.map((item: any) => item.intentionId);
  const secondIds = second.browserSearch.certified.items.map((item: any) => item.intentionId);

  assert.deepEqual(firstIds, ["INT-001", "INT-002"]);
  assert.deepEqual(firstIds, secondIds);
});
