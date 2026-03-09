import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { Journal } from "../src/metering/journal.ts";
import { MeterIngest } from "../src/metering/meter-ingest.ts";
import {
  createAtomId,
  createUsageAtom,
  hashAtom,
  type UsageAtom,
  validateAtom,
} from "../src/metering/usage-atom.ts";

function createTempJournalPath(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "safeclash-metering-"));
  return { dir, path: join(dir, "atoms.jsonl") };
}

function baseAtom(overrides?: Partial<UsageAtom>): UsageAtom {
  return {
    atomId: "atom-1",
    configurationId: "CFG-101",
    sessionId: "SESSION-1",
    agentId: "AGENT-1",
    channel: "jeeves-iphone",
    action: "tool_exec",
    unitPriceMicros: 1000,
    quantity: 2,
    currency: "EUR",
    totalMicros: 2000,
    riskLevel: "low",
    governanceRef: {
      proposalId: "PROP-1",
      approvalId: "APP-1",
      consentGranted: true,
      policyDecision: "green",
    },
    prevAtomHash: null,
    timestamp: "2026-03-09T10:00:00.000Z",
    ...overrides,
  };
}

test("createUsageAtom produces valid atom with correct totalMicros", () => {
  const atom = createUsageAtom({
    configurationId: "CFG-101",
    sessionId: "SESSION-1",
    agentId: "AGENT-1",
    channel: "jeeves-iphone",
    action: "tool_exec",
    unitPriceMicros: 1000,
    quantity: 3,
    currency: "EUR",
    riskLevel: "low",
    governanceRef: {
      proposalId: "PROP-1",
      approvalId: "APP-1",
      consentGranted: true,
      policyDecision: "green",
    },
    prevAtomHash: null,
    timestamp: "2026-03-09T10:00:00.000Z",
  });
  assert.equal(atom.totalMicros, 3000);
  assert.equal(validateAtom(atom).valid, true);
});

test("createAtomId is deterministic (same input -> same output, 100 iterations)", () => {
  const expected = createAtomId("CFG-101", "SESSION-1", "2026-03-09T10:00:00.000Z");
  for (let i = 0; i < 100; i += 1) {
    assert.equal(createAtomId("CFG-101", "SESSION-1", "2026-03-09T10:00:00.000Z"), expected);
  }
});

test("hashAtom is deterministic", () => {
  const atom = baseAtom();
  const expected = hashAtom(atom);
  for (let i = 0; i < 100; i += 1) {
    assert.equal(hashAtom(atom), expected);
  }
});

test("validateAtom catches missing fields", () => {
  const atom = baseAtom({ atomId: "", configurationId: "", action: "" });
  const validation = validateAtom(atom);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("atomId is required"));
  assert.ok(validation.errors.includes("configurationId is required"));
  assert.ok(validation.errors.includes("action is required"));
});

test("validateAtom catches negative unitPriceMicros", () => {
  const validation = validateAtom(baseAtom({ unitPriceMicros: -1 }));
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("unitPriceMicros must be >= 0"));
});

test("validateAtom catches totalMicros mismatch", () => {
  const validation = validateAtom(baseAtom({ totalMicros: 1 }));
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("totalMicros mismatch"));
});

test("validateAtom catches invalid currency", () => {
  const validation = validateAtom(baseAtom({ currency: "BTC" as UsageAtom["currency"] }));
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("invalid currency"));
});

test("validateAtom catches invalid policyDecision", () => {
  const validation = validateAtom(
    baseAtom({
      governanceRef: {
        proposalId: "PROP-1",
        approvalId: "APP-1",
        consentGranted: true,
        policyDecision: "purple" as UsageAtom["governanceRef"]["policyDecision"],
      },
    }),
  );
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("invalid policyDecision"));
});

test("Journal append enforces chain (prevAtomHash must match)", () => {
  const temp = createTempJournalPath();
  try {
    const journal = new Journal(temp.path);
    const atom = baseAtom({ prevAtomHash: "wrong-hash" });
    assert.throws(() => journal.append(atom), /Chain broken/);
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
});

test("Journal append rejects broken chain", () => {
  const temp = createTempJournalPath();
  try {
    const journal = new Journal(temp.path);
    const first = baseAtom();
    const firstResult = journal.append(first);
    const second = baseAtom({
      atomId: "atom-2",
      timestamp: "2026-03-09T10:00:01.000Z",
      prevAtomHash: "not-the-first",
    });
    assert.notEqual(firstResult.hash, second.prevAtomHash);
    assert.throws(() => journal.append(second), /Chain broken/);
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
});

test("Journal verifyChain passes for valid chain", () => {
  const temp = createTempJournalPath();
  try {
    const journal = new Journal(temp.path);
    const first = baseAtom();
    const firstResult = journal.append(first);
    const second = baseAtom({
      atomId: "atom-2",
      timestamp: "2026-03-09T10:00:01.000Z",
      prevAtomHash: firstResult.hash,
    });
    journal.append(second);
    assert.deepEqual(journal.verifyChain(), { valid: true, brokenAt: null });
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
});

test("Journal verifyChain detects broken chain", () => {
  const temp = createTempJournalPath();
  try {
    const first = baseAtom();
    const second = baseAtom({
      atomId: "atom-2",
      timestamp: "2026-03-09T10:00:01.000Z",
      prevAtomHash: "invalid-prev",
    });
    writeFileSync(temp.path, `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`, "utf-8");
    const journal = new Journal(temp.path);
    assert.deepEqual(journal.verifyChain(), { valid: false, brokenAt: 1 });
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
});

test("MeterIngest accepts GREEN atom", () => {
  const temp = createTempJournalPath();
  try {
    const journal = new Journal(temp.path);
    const ingest = new MeterIngest(journal);
    const result = ingest.ingest(baseAtom());
    assert.equal(result.accepted, true);
    assert.equal(result.errors.length, 0);
    assert.equal(journal.readAll().length, 1);
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
});

test("MeterIngest rejects RED atom (but still logs)", () => {
  const temp = createTempJournalPath();
  try {
    const journal = new Journal(temp.path);
    const ingest = new MeterIngest(journal);
    const result = ingest.ingest(
      baseAtom({
        governanceRef: {
          proposalId: "PROP-1",
          approvalId: "APP-1",
          consentGranted: true,
          policyDecision: "red",
        },
      }),
    );
    assert.equal(result.accepted, false);
    assert.deepEqual(result.errors, ["blocked: red"]);
    assert.equal(journal.readAll().length, 1);
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
});

test("MeterIngest rejects ORANGE without consent (pending)", () => {
  const temp = createTempJournalPath();
  try {
    const journal = new Journal(temp.path);
    const ingest = new MeterIngest(journal);
    const result = ingest.ingest(
      baseAtom({
        governanceRef: {
          proposalId: "PROP-1",
          approvalId: "APP-1",
          consentGranted: false,
          policyDecision: "orange",
        },
      }),
    );
    assert.equal(result.accepted, false);
    assert.deepEqual(result.errors, ["pending: consent required"]);
    assert.equal(journal.readAll().length, 1);
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
});

test("MeterIngest accepts ORANGE with consent", () => {
  const temp = createTempJournalPath();
  try {
    const journal = new Journal(temp.path);
    const ingest = new MeterIngest(journal);
    const result = ingest.ingest(
      baseAtom({
        governanceRef: {
          proposalId: "PROP-1",
          approvalId: "APP-1",
          consentGranted: true,
          policyDecision: "orange",
        },
      }),
    );
    assert.equal(result.accepted, true);
    assert.deepEqual(result.errors, []);
    assert.equal(journal.readAll().length, 1);
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
});
