import assert from "node:assert/strict";
import test from "node:test";

import { evaluate } from "../src/governance/evaluate.ts";
import { DEFAULT_POLICY, type PolicyConfig, type PolicyInput } from "../src/governance/policy-gate.ts";
import { RateLimiter } from "../src/governance/rate-limiter.ts";
import { SessionLedger } from "../src/governance/session-ledger.ts";

const baseInput: PolicyInput = {
  agentId: "AGENT-1",
  sessionId: "SESSION-1",
  channel: "jeeves-iphone",
  amount: 10_000,
  currency: "EUR",
  configurationId: "CFG-101",
  riskLevel: "low",
  timestamp: "2026-03-09T10:00:00.000Z",
};

function withPolicy(overrides?: Partial<PolicyConfig>): PolicyConfig {
  return {
    ...DEFAULT_POLICY,
    ...overrides,
    maxAmountPerTransaction: {
      ...DEFAULT_POLICY.maxAmountPerTransaction,
      ...(overrides?.maxAmountPerTransaction ?? {}),
    },
    maxAmountPerSession: {
      ...DEFAULT_POLICY.maxAmountPerSession,
      ...(overrides?.maxAmountPerSession ?? {}),
    },
    trustedChannels: overrides?.trustedChannels ?? [...DEFAULT_POLICY.trustedChannels],
    riskEscalation: overrides?.riskEscalation ?? { ...DEFAULT_POLICY.riskEscalation },
  };
}

test("GREEN: low risk, trusted channel, within budget", () => {
  const result = evaluate(
    baseInput,
    withPolicy(),
    new SessionLedger(),
    new RateLimiter(100),
    new Date(baseInput.timestamp).getTime(),
  );
  assert.equal(result.decision, "green");
  assert.equal(result.reason, "approved");
});

test("ORANGE: low risk, untrusted channel -> escalated", () => {
  const input = { ...baseInput, channel: "unknown-channel" };
  const result = evaluate(
    input,
    withPolicy(),
    new SessionLedger(),
    new RateLimiter(100),
    new Date(input.timestamp).getTime(),
  );
  assert.equal(result.decision, "orange");
  assert.equal(result.reason, "escalated: untrusted channel");
});

test("ORANGE: medium risk, trusted channel -> escalated", () => {
  const input = { ...baseInput, riskLevel: "medium" as const };
  const result = evaluate(
    input,
    withPolicy(),
    new SessionLedger(),
    new RateLimiter(100),
    new Date(input.timestamp).getTime(),
  );
  assert.equal(result.decision, "orange");
  assert.equal(result.reason, "escalated: medium risk");
});

test("RED: high risk -> blocked", () => {
  const input = { ...baseInput, riskLevel: "high" as const };
  const result = evaluate(
    input,
    withPolicy(),
    new SessionLedger(),
    new RateLimiter(100),
    new Date(input.timestamp).getTime(),
  );
  assert.equal(result.decision, "red");
  assert.equal(result.reason, "blocked: high risk");
});

test("RED: amount exceeds transaction limit", () => {
  const input = { ...baseInput, amount: 51_000_000 };
  const result = evaluate(
    input,
    withPolicy(),
    new SessionLedger(),
    new RateLimiter(100),
    new Date(input.timestamp).getTime(),
  );
  assert.equal(result.decision, "red");
  assert.match(result.reason, /exceeds max/);
});

test("RED: session budget exceeded", () => {
  const ledger = new SessionLedger();
  ledger.record("SESSION-1", "AGENT-1", 499_999_000, "EUR");
  const input = { ...baseInput, amount: 2_000 };
  const result = evaluate(
    input,
    withPolicy(),
    ledger,
    new RateLimiter(100),
    new Date(input.timestamp).getTime(),
  );
  assert.equal(result.decision, "red");
  assert.equal(result.reason, "session budget exceeded");
});

test("RED: rate limit exceeded", () => {
  const limiter = new RateLimiter(1, 60_000);
  const nowMs = new Date(baseInput.timestamp).getTime();
  limiter.record(baseInput.agentId, nowMs - 1);
  const result = evaluate(baseInput, withPolicy(), new SessionLedger(), limiter, nowMs);
  assert.equal(result.decision, "red");
  assert.equal(result.reason, "rate limit exceeded");
});

test("RED: max transactions per session exceeded", () => {
  const policy = withPolicy({ maxTransactionsPerSession: 1 });
  const ledger = new SessionLedger();
  ledger.record("SESSION-1", "AGENT-1", 1, "EUR");
  const result = evaluate(
    baseInput,
    policy,
    ledger,
    new RateLimiter(100),
    new Date(baseInput.timestamp).getTime(),
  );
  assert.equal(result.decision, "red");
  assert.equal(result.reason, "max transactions per session exceeded");
});

test("Deterministic: same input -> same output, 100 iterations", () => {
  const expected = evaluate(
    baseInput,
    withPolicy(),
    new SessionLedger(),
    new RateLimiter(100),
    new Date(baseInput.timestamp).getTime(),
  );
  for (let i = 0; i < 100; i += 1) {
    const result = evaluate(
      baseInput,
      withPolicy(),
      new SessionLedger(),
      new RateLimiter(100),
      new Date(baseInput.timestamp).getTime(),
    );
    assert.deepEqual(result, expected);
  }
});

test("Session ledger tracks cumulative spend correctly", () => {
  const ledger = new SessionLedger();
  ledger.record("SESSION-1", "AGENT-1", 2_000, "EUR");
  ledger.record("SESSION-1", "AGENT-1", 3_000, "EUR");
  ledger.record("SESSION-1", "AGENT-1", 500, "USD");
  const entry = ledger.get("SESSION-1", "AGENT-1");
  assert.ok(entry);
  assert.equal(entry.transactionCount, 3);
  assert.equal(entry.totalByCurrency.EUR, 5_000);
  assert.equal(entry.totalByCurrency.USD, 500);
});

test("Rate limiter allows within window, blocks beyond", () => {
  const limiter = new RateLimiter(2, 60_000);
  const nowMs = 100_000;
  assert.equal(limiter.check("AGENT-1", nowMs), true);
  limiter.record("AGENT-1", nowMs);
  assert.equal(limiter.check("AGENT-1", nowMs + 10), true);
  limiter.record("AGENT-1", nowMs + 20);
  assert.equal(limiter.check("AGENT-1", nowMs + 30), false);
});

test("Multiple agents in same session tracked separately", () => {
  const ledger = new SessionLedger();
  ledger.record("SESSION-1", "AGENT-1", 1_000, "EUR");
  ledger.record("SESSION-1", "AGENT-2", 2_000, "EUR");
  assert.equal(ledger.get("SESSION-1", "AGENT-1")?.totalByCurrency.EUR, 1_000);
  assert.equal(ledger.get("SESSION-1", "AGENT-2")?.totalByCurrency.EUR, 2_000);
});
