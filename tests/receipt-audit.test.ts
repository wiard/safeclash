import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { merkleProof, merkleRoot, verifyMerkleProof } from "../src/audit/merkle-proof.ts";
import { ReceiptJournal } from "../src/audit/receipt-journal.ts";
import { createReceipt, hashReceipt } from "../src/audit/receipt.ts";
import { DEFAULT_POLICY } from "../src/governance/policy-gate.ts";
import { RateLimiter } from "../src/governance/rate-limiter.ts";
import { SessionLedger } from "../src/governance/session-ledger.ts";
import { Journal } from "../src/metering/journal.ts";
import { MeterIngest } from "../src/metering/meter-ingest.ts";
import { createUsageAtom, hashAtom } from "../src/metering/usage-atom.ts";
import { PaymentEngine } from "../src/payment-engine.ts";

function baseAtom() {
  return createUsageAtom({
    configurationId: "CFG-101",
    sessionId: "SESSION-1",
    agentId: "AGENT-1",
    channel: "jeeves-iphone",
    action: "tool_exec",
    unitPriceMicros: 1_000,
    quantity: 2,
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
}

test("createReceipt produces valid receipt with correct fields", () => {
  const atom = baseAtom();
  const atomHash = hashAtom(atom);
  const receipt = createReceipt(
    atom,
    "green",
    "approved",
    atomHash,
    1,
    "gold",
    "2026-03-09T10:00:01.000Z",
  );
  assert.equal(receipt.atomId, atom.atomId);
  assert.equal(receipt.totalMicros, atom.totalMicros);
  assert.equal(receipt.certified, true);
  assert.equal(receipt.certificationLevel, "gold");
});

test("receiptId is deterministic", () => {
  const atom = baseAtom();
  const hash = hashAtom(atom);
  const first = createReceipt(atom, "green", "approved", hash, 1, "gold", "2026-03-09T10:00:01.000Z");
  const second = createReceipt(atom, "green", "approved", hash, 1, "gold", "2026-03-09T10:00:01.000Z");
  assert.equal(first.receiptId, second.receiptId);
});

test("hashReceipt is deterministic", () => {
  const atom = baseAtom();
  const receipt = createReceipt(
    atom,
    "green",
    "approved",
    hashAtom(atom),
    1,
    "silver",
    "2026-03-09T10:00:01.000Z",
  );
  const expected = hashReceipt(receipt);
  for (let i = 0; i < 100; i += 1) {
    assert.equal(hashReceipt(receipt), expected);
  }
});

test("ReceiptJournal append + readAll round-trip", () => {
  const dir = mkdtempSync(join(tmpdir(), "safeclash-receipts-"));
  try {
    const journal = new ReceiptJournal(join(dir, "receipts.jsonl"));
    const atom = baseAtom();
    const receipt = createReceipt(
      atom,
      "green",
      "approved",
      hashAtom(atom),
      1,
      "gold",
      "2026-03-09T10:00:01.000Z",
    );
    const appendResult = journal.append(receipt);
    const rows = journal.readAll();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].receiptId, receipt.receiptId);
    assert.equal(journal.getLastHash(), appendResult.hash);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("merkleRoot of single hash returns that hash", () => {
  const hash = createHash("sha256").update("x").digest("hex");
  assert.equal(merkleRoot([hash]), hash);
});

test("merkleRoot of multiple hashes is deterministic", () => {
  const hashes = ["a", "b", "c"].map((value) => createHash("sha256").update(value).digest("hex"));
  const first = merkleRoot(hashes);
  const second = merkleRoot(hashes);
  assert.equal(first, second);
});

test("merkleProof + verifyMerkleProof validates correctly", () => {
  const hashes = ["a", "b", "c", "d"].map((value) => createHash("sha256").update(value).digest("hex"));
  const root = merkleRoot(hashes);
  const proof = merkleProof(hashes, 2);
  assert.equal(verifyMerkleProof(hashes[2], proof, root, 2), true);
});

test("verifyMerkleProof rejects wrong hash", () => {
  const hashes = ["a", "b", "c", "d"].map((value) => createHash("sha256").update(value).digest("hex"));
  const root = merkleRoot(hashes);
  const proof = merkleProof(hashes, 1);
  const wrong = createHash("sha256").update("wrong").digest("hex");
  assert.equal(verifyMerkleProof(wrong, proof, root, 1), false);
});

test("Full flow: payment -> usage atom -> journal -> receipt -> receipt journal -> merkle", () => {
  const dir = mkdtempSync(join(tmpdir(), "safeclash-full-flow-"));
  try {
    const atomJournal = new Journal(join(dir, "atoms.jsonl"));
    const receiptJournal = new ReceiptJournal(join(dir, "receipts.jsonl"));
    const engine = new PaymentEngine({
      policy: DEFAULT_POLICY,
      sessionLedger: new SessionLedger(),
      rateLimiter: new RateLimiter(100),
      meterIngest: new MeterIngest(atomJournal),
      journal: atomJournal,
    });

    const payment = engine.process({
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
    });

    assert.equal(payment.accepted, true);
    const atoms = atomJournal.readAll();
    assert.equal(atoms.length, 1);

    const atom = atoms[0];
    const atomHash = hashAtom(atom);
    const receipt = createReceipt(
      atom,
      payment.decision,
      payment.reason,
      atomHash,
      1,
      payment.accepted ? "gold" : "none",
      "2026-03-09T10:00:01.000Z",
    );
    receiptJournal.append(receipt);

    const receiptHashes = receiptJournal.readAll().map((row) => hashReceipt(row));
    const root = merkleRoot(receiptHashes);
    const proof = merkleProof(receiptHashes, 0);
    assert.equal(verifyMerkleProof(receiptHashes[0], proof, root, 0), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
