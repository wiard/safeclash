import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { DEFAULT_POLICY, type PolicyConfig } from "../src/governance/policy-gate.ts";
import { RateLimiter } from "../src/governance/rate-limiter.ts";
import { SessionLedger } from "../src/governance/session-ledger.ts";
import { Journal } from "../src/metering/journal.ts";
import { MeterIngest } from "../src/metering/meter-ingest.ts";
import { PaymentEngine, type PaymentRequest } from "../src/payment-engine.ts";

function createHarness(options?: {
  policy?: PolicyConfig;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
}): {
  dir: string;
  journal: Journal;
  ledger: SessionLedger;
  engine: PaymentEngine;
} {
  const dir = mkdtempSync(join(tmpdir(), "safeclash-payment-"));
  const journal = new Journal(join(dir, "atoms.jsonl"));
  const ledger = new SessionLedger();
  const rateLimiter = new RateLimiter(options?.rateLimitMax ?? 100, options?.rateLimitWindowMs ?? 60_000);
  const meterIngest = new MeterIngest(journal);
  const engine = new PaymentEngine({
    policy: options?.policy ?? DEFAULT_POLICY,
    sessionLedger: ledger,
    rateLimiter,
    meterIngest,
    journal,
  });
  return { dir, journal, ledger, engine };
}

function baseRequest(overrides?: Partial<PaymentRequest>): PaymentRequest {
  return {
    configurationId: "CFG-101",
    sessionId: "SESSION-1",
    agentId: "AGENT-1",
    channel: "jeeves-iphone",
    action: "tool_exec",
    unitPriceMicros: 1_000,
    quantity: 1,
    currency: "EUR",
    riskLevel: "low",
    timestamp: "2026-03-09T10:00:00.000Z",
    ...overrides,
  };
}

test("Process GREEN payment -> accepted, atom in journal", () => {
  const harness = createHarness();
  try {
    const result = harness.engine.process(baseRequest());
    assert.equal(result.accepted, true);
    assert.equal(result.decision, "green");
    assert.equal(harness.journal.readAll().length, 1);
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("Process RED payment (high risk) -> rejected, still in journal", () => {
  const harness = createHarness();
  try {
    const result = harness.engine.process(baseRequest({ riskLevel: "high" }));
    assert.equal(result.accepted, false);
    assert.equal(result.decision, "red");
    assert.equal(harness.journal.readAll().length, 1);
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("Process ORANGE payment -> rejected (pending consent)", () => {
  const harness = createHarness();
  try {
    const result = harness.engine.process(baseRequest({ channel: "third-party-cli" }));
    assert.equal(result.accepted, false);
    assert.equal(result.decision, "orange");
    assert.deepEqual(result.errors, ["pending: consent required"]);
    assert.equal(harness.journal.readAll().length, 1);
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("Multiple payments drain session budget -> eventually RED", () => {
  const smallBudgetPolicy: PolicyConfig = {
    ...DEFAULT_POLICY,
    maxAmountPerSession: { ...DEFAULT_POLICY.maxAmountPerSession, EUR: 3_000 },
  };
  const harness = createHarness({ policy: smallBudgetPolicy });
  try {
    const r1 = harness.engine.process(baseRequest({ timestamp: "2026-03-09T10:00:00.000Z" }));
    const r2 = harness.engine.process(baseRequest({ timestamp: "2026-03-09T10:00:01.000Z" }));
    const r3 = harness.engine.process(baseRequest({ timestamp: "2026-03-09T10:00:02.000Z" }));
    const r4 = harness.engine.process(baseRequest({ timestamp: "2026-03-09T10:00:03.000Z" }));
    assert.equal(r1.accepted, true);
    assert.equal(r2.accepted, true);
    assert.equal(r3.accepted, true);
    assert.equal(r4.accepted, false);
    assert.equal(r4.decision, "red");
    assert.equal(r4.reason, "session budget exceeded");
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("Rapid payments trigger rate limit -> RED", () => {
  const harness = createHarness({ rateLimitMax: 2, rateLimitWindowMs: 60_000 });
  try {
    const first = harness.engine.process(baseRequest({ timestamp: "2026-03-09T10:00:00.000Z" }));
    const second = harness.engine.process(baseRequest({ timestamp: "2026-03-09T10:00:00.100Z" }));
    const third = harness.engine.process(baseRequest({ timestamp: "2026-03-09T10:00:00.200Z" }));
    assert.equal(first.decision, "green");
    assert.equal(second.decision, "green");
    assert.equal(third.decision, "red");
    assert.equal(third.reason, "rate limit exceeded");
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("Journal chain intact after multiple payments", () => {
  const harness = createHarness();
  try {
    harness.engine.process(baseRequest({ timestamp: "2026-03-09T10:00:00.000Z" }));
    harness.engine.process(baseRequest({ timestamp: "2026-03-09T10:00:01.000Z", channel: "unknown" }));
    harness.engine.process(baseRequest({ timestamp: "2026-03-09T10:00:02.000Z", riskLevel: "high" }));
    assert.deepEqual(harness.journal.verifyChain(), { valid: true, brokenAt: null });
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("Session ledger tracks cumulative correctly", () => {
  const harness = createHarness();
  try {
    harness.engine.process(baseRequest({ timestamp: "2026-03-09T10:00:00.000Z", unitPriceMicros: 2_000 }));
    harness.engine.process(baseRequest({ timestamp: "2026-03-09T10:00:01.000Z", unitPriceMicros: 3_000 }));
    harness.engine.process(baseRequest({ timestamp: "2026-03-09T10:00:02.000Z", riskLevel: "high" }));
    const entry = harness.ledger.get("SESSION-1", "AGENT-1");
    assert.ok(entry);
    assert.equal(entry.transactionCount, 2);
    assert.equal(entry.totalByCurrency.EUR, 5_000);
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("Deterministic: same sequence -> same results", () => {
  const runSequence = (): Array<{ accepted: boolean; decision: string; reason: string; errors: string[] }> => {
    const harness = createHarness({ rateLimitMax: 100 });
    try {
      return [
        harness.engine.process(baseRequest({ timestamp: "2026-03-09T10:00:00.000Z" })),
        harness.engine.process(baseRequest({ timestamp: "2026-03-09T10:00:01.000Z", channel: "unknown" })),
        harness.engine.process(baseRequest({ timestamp: "2026-03-09T10:00:02.000Z", riskLevel: "high" })),
      ].map((result) => ({
        accepted: result.accepted,
        decision: result.decision,
        reason: result.reason,
        errors: result.errors,
      }));
    } finally {
      rmSync(harness.dir, { recursive: true, force: true });
    }
  };

  const first = runSequence();
  const second = runSequence();
  assert.deepEqual(first, second);
});

test("security_remediation requires explicit approval_decision", () => {
  const harness = createHarness();
  try {
    const result = harness.engine.process(
      baseRequest({
        capability: "security_remediation",
        proposalId: "PROP-SEC-1",
        securitySignalId: "SIG-SEC-1",
        remediationApplied: "rotate credential",
      }),
    );

    assert.equal(result.accepted, false);
    assert.equal(result.decision, "never");
    assert.equal(result.reason, "approval_decision_required");
    assert.equal(result.statusCode, 403);
    assert.equal(result.executionReceipt, null);
    assert.equal(harness.journal.readAll().length, 1);
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("security_remediation rejects auto-remediation", () => {
  const harness = createHarness();
  try {
    const result = harness.engine.process(
      baseRequest({
        capability: "security_remediation",
        proposalId: "PROP-SEC-2",
        securitySignalId: "SIG-SEC-2",
        remediationApplied: "patch dependency",
        autoRemediation: true,
        approvalDecision: {
          decision: "approve",
          actor: "operator@jeeves",
          reason: "reviewed and approved",
          timestamp: "2026-03-12T12:00:00.000Z",
        },
      }),
    );

    assert.equal(result.accepted, false);
    assert.equal(result.decision, "never");
    assert.equal(result.reason, "auto_remediation_forbidden");
    assert.equal(result.statusCode, 403);
    assert.equal(result.executionReceipt, null);
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("approved security_remediation produces execution_receipt", () => {
  const harness = createHarness();
  try {
    const result = harness.engine.process(
      baseRequest({
        capability: "security_remediation",
        proposalId: "PROP-SEC-3",
        securitySignalId: "SIG-SEC-3",
        remediationApplied: "revoke leaked token",
        approvalDecision: {
          decision: "approve",
          actor: "operator@jeeves",
          reason: "confirmed exposure path",
          timestamp: "2026-03-12T12:05:00.000Z",
        },
      }),
    );

    assert.equal(result.accepted, true);
    assert.equal(result.decision, "green");
    assert.equal(result.reason, "security_remediation_approved");
    assert.equal(result.statusCode, 200);
    assert.ok(result.executionReceipt);
    assert.equal(result.executionReceipt?.proposal_id, "PROP-SEC-3");
    assert.equal(result.executionReceipt?.capability, "security_remediation");
    assert.equal(result.executionReceipt?.security_signal_id, "SIG-SEC-3");
    assert.equal(result.executionReceipt?.remediation_applied, "revoke leaked token");
    assert.equal(result.executionReceipt?.approved_by, "operator@jeeves");
    assert.equal(result.executionReceipt?.timestamp, "2026-03-09T10:00:00.000Z");
    assert.equal(harness.journal.readAll().length, 1);
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});
