import type { Receipt } from "../audit/receipt.ts";
import type { CapabilityRegistryEntry } from "../registry/capability-store.ts";
import {
  isGapDiscoveryAttestationActive,
  normalizeGapDiscoveryAttestation,
  type GapDiscoveryAttestation,
} from "./gap-discovery-attestation.ts";

export type GapDiscoveryVerificationResult = {
  valid: boolean;
  errors: string[];
};

export function verifyGapDiscoveryReceiptArtifacts(params: {
  receipt: Receipt;
  capability: CapabilityRegistryEntry | null;
  attestations: GapDiscoveryAttestation[];
  at: string;
}): GapDiscoveryVerificationResult {
  const { receipt, capability, at } = params;
  const errors: string[] = [];

  if (!receipt.governanceRef.proposalId || !receipt.governanceRef.approvalId) {
    errors.push("receipt must carry proposalId and approvalId");
  }

  if (!receipt.capabilityEvidence) {
    errors.push("receipt must include capabilityEvidence for gap discovery verification");
    return { valid: false, errors };
  }
  const capabilityEvidence = receipt.capabilityEvidence;

  if (!capability) {
    errors.push("capability registry entry is required");
    return { valid: false, errors };
  }

  if (capability.capabilityId !== capabilityEvidence.capabilityId) {
    errors.push("receipt capabilityId does not match registry entry");
  }
  if (capability.kind !== "gap_discovery") {
    errors.push("capability registry entry must be gap_discovery");
  }
  if (capability.status !== "active") {
    errors.push("capability registry entry must be active");
  }
  if (capability.governanceAuthority !== "openclashd-v2") {
    errors.push("capability registry entry must remain subordinate to openclashd-v2");
  }
  if (!capability.certification.attestationRequired) {
    errors.push("capability registry entry must require attestations");
  }
  if (!capability.certification.receiptsRequired) {
    errors.push("capability registry entry must require receipts");
  }
  if (capability.pricingHints.usageClass !== "governed_discovery") {
    errors.push("capability registry entry must declare usageClass governed_discovery");
  }
  if (
    capabilityEvidence.authorizedFollowUp.authority !== "openclashd-v2" ||
    capabilityEvidence.authorizedFollowUp.proposalId !== receipt.governanceRef.proposalId ||
    capabilityEvidence.authorizedFollowUp.approvalId !== receipt.governanceRef.approvalId
  ) {
    errors.push("authorized follow-up must resolve to the same kernel approval carried by the receipt");
  }

  const followUpClass = capability.followUpClasses.find(
    (entry) => entry.classId === capabilityEvidence.authorizedFollowUp.classId,
  );
  if (!followUpClass) {
    errors.push("authorized follow-up class must exist in the capability registry");
  } else if (followUpClass.status !== "active") {
    errors.push("authorized follow-up class must be active");
  }
  if (capabilityEvidence.usageClass !== capability.pricingHints.usageClass) {
    errors.push("receipt usageClass must match the capability registry usageClass");
  }

  const attestationsById = new Map(
    params.attestations.map((entry) => {
      const normalized = normalizeGapDiscoveryAttestation(entry);
      return [normalized.attestationId, normalized] as const;
    }),
  );

  const sourceAttestation = capabilityEvidence.sourceAttestationId
    ? attestationsById.get(capabilityEvidence.sourceAttestationId)
    : null;
  const processorAttestation = capabilityEvidence.processorAttestationId
    ? attestationsById.get(capabilityEvidence.processorAttestationId)
    : null;

  if (!sourceAttestation) {
    errors.push("source attestation is required");
  } else {
    if (sourceAttestation.subject.kind !== "proposal_source") {
      errors.push("source attestation must certify a proposal_source");
    }
    if (sourceAttestation.capabilityId !== capability.capabilityId) {
      errors.push("source attestation capabilityId mismatch");
    }
    if (!sourceAttestation.scope.followUpClasses.includes(capabilityEvidence.authorizedFollowUp.classId)) {
      errors.push("source attestation does not cover the authorized follow-up class");
    }
    if (!isGapDiscoveryAttestationActive(sourceAttestation, at)) {
      errors.push("source attestation is not active and trusted");
    }
  }

  if (!processorAttestation) {
    errors.push("processor attestation is required");
  } else {
    if (processorAttestation.subject.kind !== "proposal_processor") {
      errors.push("processor attestation must certify a proposal_processor");
    }
    if (processorAttestation.capabilityId !== capability.capabilityId) {
      errors.push("processor attestation capabilityId mismatch");
    }
    if (!processorAttestation.scope.followUpClasses.includes(capabilityEvidence.authorizedFollowUp.classId)) {
      errors.push("processor attestation does not cover the authorized follow-up class");
    }
    if (!isGapDiscoveryAttestationActive(processorAttestation, at)) {
      errors.push("processor attestation is not active and trusted");
    }
  }

  return { valid: errors.length === 0, errors };
}
