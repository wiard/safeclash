import { createHash } from "node:crypto";
import type { UsageAtom } from "../metering/usage-atom.ts";
import type { GapDiscoveryFollowUpClassId } from "../registry/capability-store.ts";
import { normalizeTrustMetadata, type TrustMetadata } from "../trust/trust-metadata.ts";

export type AuthorizedFollowUp = {
  classId: GapDiscoveryFollowUpClassId;
  classRef: string | null;
  authority: "openclashd-v2";
  proposalId: string | null;
  approvalId: string | null;
  actionRef: string | null;
};

export type ReceiptCapabilityEvidence = {
  capabilityId: string;
  capabilityRef: string | null;
  sourceAttestationId: string | null;
  sourceAttestationRef: string | null;
  processorAttestationId: string | null;
  processorAttestationRef: string | null;
  pricingProfileId: string | null;
  usageClass: string | null;
  trustMetadata: TrustMetadata;
  authorizedFollowUp: AuthorizedFollowUp;
  searchableTerms: string[];
};

export type Receipt = {
  receiptId: string;
  atomId: string;
  configurationId: string;
  agentId: string;
  sessionId: string;
  channel: string;
  action: string;
  totalMicros: number;
  currency: string;
  decision: "green" | "orange" | "red" | "never";
  reason: string;
  atomHash: string;
  journalLine: number | null;
  certified: boolean;
  certificationLevel: "none" | "bronze" | "silver" | "gold" | "platinum";
  governanceRef: UsageAtom["governanceRef"];
  capabilityEvidence: ReceiptCapabilityEvidence | null;
  timestamp: string;
};

function normalizeCapabilityEvidence(
  evidence: ReceiptCapabilityEvidence | null | undefined,
): ReceiptCapabilityEvidence | null {
  if (!evidence) {
    return null;
  }

  return {
    capabilityId: evidence.capabilityId.trim(),
    capabilityRef: evidence.capabilityRef?.trim() || null,
    sourceAttestationId: evidence.sourceAttestationId?.trim() || null,
    sourceAttestationRef: evidence.sourceAttestationRef?.trim() || null,
    processorAttestationId: evidence.processorAttestationId?.trim() || null,
    processorAttestationRef: evidence.processorAttestationRef?.trim() || null,
    pricingProfileId: evidence.pricingProfileId?.trim() || null,
    usageClass: evidence.usageClass?.trim() || null,
    trustMetadata: normalizeTrustMetadata(evidence.trustMetadata),
    authorizedFollowUp: {
      classId: evidence.authorizedFollowUp.classId,
      classRef: evidence.authorizedFollowUp.classRef?.trim() || null,
      authority: "openclashd-v2",
      proposalId: evidence.authorizedFollowUp.proposalId?.trim() || null,
      approvalId: evidence.authorizedFollowUp.approvalId?.trim() || null,
      actionRef: evidence.authorizedFollowUp.actionRef?.trim() || null,
    },
    searchableTerms: [...new Set(evidence.searchableTerms.map((term) => term.trim().toLowerCase()).filter(Boolean))].sort(),
  };
}

export function createReceipt(
  atom: UsageAtom,
  decision: Receipt["decision"],
  reason: string,
  atomHash: string,
  journalLine: number | null,
  certificationLevel: Receipt["certificationLevel"],
  timestamp: string,
  capabilityEvidence?: ReceiptCapabilityEvidence | null,
): Receipt {
  const receiptId = createHash("sha256")
    .update(`${atom.atomId}:${decision}:${timestamp}`)
    .digest("hex")
    .slice(0, 16);

  return {
    receiptId,
    atomId: atom.atomId,
    configurationId: atom.configurationId,
    agentId: atom.agentId,
    sessionId: atom.sessionId,
    channel: atom.channel,
    action: atom.action,
    totalMicros: atom.totalMicros,
    currency: atom.currency,
    decision,
    reason,
    atomHash,
    journalLine,
    certified: decision === "green",
    certificationLevel,
    governanceRef: { ...atom.governanceRef },
    capabilityEvidence: normalizeCapabilityEvidence(capabilityEvidence),
    timestamp,
  };
}

export function hashReceipt(receipt: Receipt): string {
  const data = JSON.stringify(receipt, Object.keys(receipt).sort());
  return createHash("sha256").update(data).digest("hex");
}
