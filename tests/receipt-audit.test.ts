import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { merkleProof, merkleRoot, verifyMerkleProof } from "../src/audit/merkle-proof.ts";
import { ReceiptJournal } from "../src/audit/receipt-journal.ts";
import { createReceipt, hashReceipt } from "../src/audit/receipt.ts";
import { CapabilityRegistryStore } from "../src/registry/capability-store.ts";
import { DEFAULT_POLICY } from "../src/governance/policy-gate.ts";
import { RateLimiter } from "../src/governance/rate-limiter.ts";
import { SessionLedger } from "../src/governance/session-ledger.ts";
import {
  isGapDiscoveryAttestationActive,
  validateGapDiscoveryAttestation,
  type GapDiscoveryAttestation,
} from "../src/certification/gap-discovery-attestation.ts";
import { verifyGapDiscoveryReceiptArtifacts } from "../src/certification/gap-discovery-verifier.ts";
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

function createSourceAttestation(): GapDiscoveryAttestation {
  return {
    attestationId: "ATT-SOURCE-1",
    capabilityId: "GAP_DISCOVERY",
    issuer: {
      issuerId: "safeclash",
      issuerRef: "safeclash://issuers/safeclash",
    },
    issuedAt: "2026-03-09T10:00:00.000Z",
    expiresAt: "2026-06-01T00:00:00.000Z",
    trustMetadata: {
      status: "trusted",
      certificationLevel: "gold",
      operatorVisible: true,
      evidenceRef: "safeclash://attestations/ATT-SOURCE-1",
      registryVisibility: "public",
      certificationSurfaces: ["attestation", "receipt"],
      searchableTerms: ["gap", "signal"],
    },
    subject: {
      kind: "proposal_source",
      subjectId: "SOURCE-1",
      displayName: "Certified Gap Signal Feed",
      sourceKind: "signal_feed",
    },
    scope: {
      tenantId: "TENANT-1",
      workspaceId: "WORKSPACE-1",
      gapClasses: ["market_gap"],
      followUpClasses: ["operator_review", "proposal_brief"],
      proposalModes: ["screened"],
      searchableTerms: ["gap", "signal"],
    },
    governanceBinding: {
      authority: "openclashd-v2",
      policyRefs: ["safeclash://policies/gap-discovery-v1"],
      approvalRequired: true,
      receiptsRequired: true,
    },
    evidence: {
      registryRef: "safeclash://attestations/ATT-SOURCE-1",
      knowledgeRefs: ["safeclash://knowledge/gap-source/SOURCE-1"],
      priorReceiptRefs: [],
    },
    commercial: {
      pricingProfileId: "gap-discovery-standard",
      usageClass: "governed_discovery",
      registryVisibility: "public",
    },
    signature: {
      signer: "safeclash",
      alg: "ed25519",
      sig: "sig-source",
    },
  };
}

function createProcessorAttestation(): GapDiscoveryAttestation {
  return {
    ...createSourceAttestation(),
    attestationId: "ATT-PROCESSOR-1",
    subject: {
      kind: "proposal_processor",
      subjectId: "PROCESSOR-1",
      displayName: "Certified Proposal Processor",
      processorStage: "propose",
    },
    evidence: {
      registryRef: "safeclash://attestations/ATT-PROCESSOR-1",
      knowledgeRefs: ["safeclash://knowledge/gap-processor/PROCESSOR-1"],
      priorReceiptRefs: [],
    },
    signature: {
      signer: "safeclash",
      alg: "ed25519",
      sig: "sig-processor",
    },
  };
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
  assert.equal(receipt.governanceRef.proposalId, "PROP-1");
  assert.equal(receipt.capabilityEvidence, null);
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

test("Gap Discovery capability registry exposes governed certified capability", () => {
  const store = new CapabilityRegistryStore();
  const capability = store.getById("GAP_DISCOVERY");

  if (!capability) {
    throw new Error("expected GAP_DISCOVERY capability to exist");
  }
  assert.equal(capability.kind, "gap_discovery");
  assert.equal(capability.governanceAuthority, "openclashd-v2");
  assert.equal(capability.certification.attestationRequired, true);
  assert.equal(capability.certification.receiptsRequired, true);
  assert.equal(capability.pricingHints.usageClass, "governed_discovery");
  assert.equal(capability.followUpClasses[0].kernelApprovalRequired, true);
  assert.equal(capability.trustMetadata.status, "trusted");
});

test("Gap Discovery attestation validation enforces source and processor requirements", () => {
  const sourceAttestation = createSourceAttestation();
  const processorAttestation = createProcessorAttestation();

  assert.equal(validateGapDiscoveryAttestation(sourceAttestation).valid, true);
  assert.equal(validateGapDiscoveryAttestation(processorAttestation).valid, true);
  assert.equal(isGapDiscoveryAttestationActive(sourceAttestation, "2026-03-11T00:00:00.000Z"), true);
  assert.equal(isGapDiscoveryAttestationActive(processorAttestation, "2026-03-11T00:00:00.000Z"), true);
});

test("Gap Discovery receipt artifacts can be verified without bypassing governance", () => {
  const atom = baseAtom();
  const sourceAttestation = createSourceAttestation();
  const processorAttestation = createProcessorAttestation();
  const receipt = createReceipt(
    atom,
    "green",
    "approved",
    hashAtom(atom),
    1,
    "gold",
    "2026-03-09T10:00:01.000Z",
    {
      capabilityId: "GAP_DISCOVERY",
      capabilityRef: "safeclash://capabilities/GAP_DISCOVERY",
      sourceAttestationId: "ATT-SOURCE-1",
      sourceAttestationRef: "safeclash://attestations/ATT-SOURCE-1",
      processorAttestationId: "ATT-PROCESSOR-1",
      processorAttestationRef: "safeclash://attestations/ATT-PROCESSOR-1",
      pricingProfileId: "gap-discovery-standard",
      usageClass: "governed_discovery",
      trustMetadata: {
        status: "trusted",
        certificationLevel: "gold",
        operatorVisible: true,
        evidenceRef: "safeclash://receipts/receipt-gap-1",
        registryVisibility: "tenant",
        certificationSurfaces: ["attestation", "receipt"],
        searchableTerms: ["gap", "proposal", "market"],
      },
      authorizedFollowUp: {
        classId: "proposal_brief",
        classRef: "safeclash://capabilities/GAP_DISCOVERY/follow-up/proposal_brief",
        authority: "openclashd-v2",
        proposalId: "PROP-1",
        approvalId: "APP-1",
        actionRef: "ACTION-GAP-1",
      },
      searchableTerms: ["gap", "proposal", "market"],
    },
  );

  const capability = new CapabilityRegistryStore().getById("GAP_DISCOVERY");
  if (!capability) {
    throw new Error("expected GAP_DISCOVERY capability to exist");
  }
  const verification = verifyGapDiscoveryReceiptArtifacts({
    receipt,
    capability,
    attestations: [sourceAttestation, processorAttestation],
    at: "2026-03-11T00:00:00.000Z",
  });

  assert.equal(verification.valid, true);
  assert.equal(receipt.capabilityEvidence?.sourceAttestationId, "ATT-SOURCE-1");
  assert.equal(receipt.capabilityEvidence?.processorAttestationId, "ATT-PROCESSOR-1");
  assert.equal(receipt.capabilityEvidence?.authorizedFollowUp.classId, "proposal_brief");
  assert.equal(receipt.capabilityEvidence?.trustMetadata.status, "trusted");
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
    assert.deepEqual(journal.verifyChain(), { valid: true, brokenAt: null });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ReceiptJournal append enforces receipt hash chain", () => {
  const dir = mkdtempSync(join(tmpdir(), "safeclash-receipts-chain-"));
  try {
    const journal = new ReceiptJournal(join(dir, "receipts.jsonl"));
    const atom = baseAtom();
    const first = createReceipt(
      atom,
      "green",
      "approved",
      hashAtom(atom),
      1,
      "gold",
      "2026-03-09T10:00:01.000Z",
      null,
      null,
    );
    const firstResult = journal.append(first);
    const second = createReceipt(
      atom,
      "green",
      "approved",
      hashAtom(atom),
      2,
      "gold",
      "2026-03-09T10:00:02.000Z",
      null,
      firstResult.hash,
    );

    journal.append(second);
    assert.deepEqual(journal.verifyChain(), { valid: true, brokenAt: null });
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
