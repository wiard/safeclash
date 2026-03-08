import test from "node:test";
import assert from "node:assert/strict";

import { handleSearchApiRequest } from "../src/api/search-api.ts";
import { AIConfigurationStore, type AIConfigurationAtom } from "../src/registry/config-store.ts";
import { IntentionStore, type IntentionProfile } from "../src/registry/intention-store.ts";
import { SafeClashSearchEngine } from "../src/search/search-engine.ts";

function parseBody(body: string): any {
  return JSON.parse(body);
}

test("certified search result includes canonical deployment provenance fields", () => {
  const response = handleSearchApiRequest("/api/search?domain=financial&subdomain=investing&risk=low");
  assert.equal(response.status, 200);

  const payload = parseBody(response.body);
  assert.equal(payload.total, 1);

  const result = payload.results[0];
  assert.equal(result.bestConfiguration.configId, "CFG-101");
  assert.equal(result.bestConfiguration.certificateId, "CERT-101");
  assert.equal(result.bestConfiguration.benchmarkContractId, "investing-low-risk-v1");
  assert.equal(result.bestConfiguration.runtimeEnvelopeHash, "rehash-cfg-101-v1");
  assert.equal(result.bestConfiguration.certificationLevel, "gold");
  assert.equal(result.bestConfiguration.benchmarkScore, 9.1);
  assert.equal(typeof result.rankingScore, "number");
});

test("missing provenance values are explicit nulls in the browser-facing shape", () => {
  const intentions: IntentionProfile[] = [
    {
      intentionProfileId: "INT-X1",
      domain: "financial",
      subdomain: "investing",
      riskLevel: "low",
      constraints: [],
      summary: "Test profile",
      rankingSignals: {
        clashdScore: 7,
        operatorTrust: 7,
      },
    },
  ];

  const configurations: AIConfigurationAtom[] = [
    {
      configId: "CFG-X1",
      version: "1.0.0",
      intentionProfileId: "INT-X1",
      model: "llama3",
      promptArchitecture: "test-arch",
      capabilityConstraints: ["analysis"],
      riskLevel: "low",
      certificationLevel: "silver",
      status: "certified",
      rankingSignals: {
        benchmarkScore: 8,
        runtimeReliability: 8,
        usageConfidence: 8,
      },
    },
  ];

  const engine = new SafeClashSearchEngine(new IntentionStore(intentions), new AIConfigurationStore(configurations));
  const result = engine.search("domain=financial&subdomain=investing&risk=low");

  assert.equal(result.total, 1);
  assert.equal(result.results[0].bestConfiguration.certificateId, null);
  assert.equal(result.results[0].bestConfiguration.benchmarkContractId, null);
  assert.equal(result.results[0].bestConfiguration.runtimeEnvelopeHash, null);
});

test("ranking order remains deterministic for financial/investing query", () => {
  const response = handleSearchApiRequest("/api/search?domain=financial&subdomain=investing");
  assert.equal(response.status, 200);

  const payload = parseBody(response.body);
  const intentionIds = payload.results.map((entry: any) => entry.intentionProfile.intentionProfileId);
  assert.deepEqual(intentionIds, ["INT-001", "INT-002"]);
  assert.ok(payload.results[0].rankingScore >= payload.results[1].rankingScore);
});
