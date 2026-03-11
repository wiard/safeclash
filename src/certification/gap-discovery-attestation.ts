import type {
  GapClass,
  GapDiscoveryFollowUpClassId,
  GapDiscoverySubjectKind,
} from "../registry/capability-store.ts";
import {
  normalizeTrustMetadata,
  type RegistryVisibility,
  type TrustMetadata,
} from "../trust/trust-metadata.ts";
export type SignatureAlgorithm = "ed25519" | "secp256k1";
export type GapDiscoverySourceKind = "operator_input" | "signal_feed" | "knowledge_base" | "external_provider";
export type GapDiscoveryProcessorStage = "ingest" | "normalize" | "rank" | "propose";

export type GapDiscoveryAttestation = {
  attestationId: string;
  capabilityId: string;
  issuer: {
    issuerId: string;
    issuerRef?: string | null;
  };
  issuedAt: string;
  expiresAt?: string | null;
  trustMetadata: TrustMetadata;
  subject: {
    kind: GapDiscoverySubjectKind;
    subjectId: string;
    version?: string | null;
    displayName?: string | null;
    sourceKind?: GapDiscoverySourceKind | null;
    processorStage?: GapDiscoveryProcessorStage | null;
  };
  scope: {
    tenantId?: string | null;
    workspaceId?: string | null;
    gapClasses: GapClass[];
    followUpClasses: GapDiscoveryFollowUpClassId[];
    proposalModes: string[];
    searchableTerms: string[];
  };
  governanceBinding: {
    authority: "openclashd-v2";
    policyRefs: string[];
    approvalRequired: boolean;
    receiptsRequired: boolean;
  };
  evidence: {
    registryRef?: string | null;
    knowledgeRefs: string[];
    priorReceiptRefs: string[];
  };
  commercial?: {
    pricingProfileId?: string | null;
    usageClass?: string | null;
    registryVisibility: RegistryVisibility;
  } | null;
  signature?: {
    signer: string;
    alg: SignatureAlgorithm;
    sig: string;
  } | null;
};

function normalizeRegistryVisibility(value: string): RegistryVisibility {
  if (value === "private" || value === "public") {
    return value;
  }
  return "tenant";
}

function normalizeSubjectKind(value: string): GapDiscoverySubjectKind {
  if (value === "proposal_processor") {
    return value;
  }
  return "proposal_source";
}

function normalizeGapClass(value: string): GapClass | null {
  if (
    value === "market_gap" ||
    value === "workflow_gap" ||
    value === "knowledge_gap" ||
    value === "control_gap"
  ) {
    return value;
  }
  return null;
}

function normalizeFollowUpClassId(value: string): GapDiscoveryFollowUpClassId | null {
  if (value === "operator_review" || value === "proposal_brief" || value === "knowledge_capture") {
    return value;
  }
  return null;
}

function normalizeSourceKind(value: string | null | undefined): GapDiscoverySourceKind | null {
  if (
    value === "operator_input" ||
    value === "signal_feed" ||
    value === "knowledge_base" ||
    value === "external_provider"
  ) {
    return value;
  }
  return null;
}

function normalizeProcessorStage(value: string | null | undefined): GapDiscoveryProcessorStage | null {
  if (value === "ingest" || value === "normalize" || value === "rank" || value === "propose") {
    return value;
  }
  return null;
}

function normalizeStringList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function normalizeSearchTerms(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
}

export function normalizeGapDiscoveryAttestation(input: GapDiscoveryAttestation): GapDiscoveryAttestation {
  return {
    ...input,
    attestationId: input.attestationId.trim(),
    capabilityId: input.capabilityId.trim(),
    issuer: {
      issuerId: input.issuer.issuerId.trim(),
      issuerRef: input.issuer.issuerRef?.trim() || null,
    },
    expiresAt: input.expiresAt?.trim() || null,
    trustMetadata: normalizeTrustMetadata(input.trustMetadata),
    subject: {
      kind: normalizeSubjectKind(input.subject.kind),
      subjectId: input.subject.subjectId.trim(),
      version: input.subject.version?.trim() || null,
      displayName: input.subject.displayName?.trim() || null,
      sourceKind: normalizeSourceKind(input.subject.sourceKind),
      processorStage: normalizeProcessorStage(input.subject.processorStage),
    },
    scope: {
      tenantId: input.scope.tenantId?.trim() || null,
      workspaceId: input.scope.workspaceId?.trim() || null,
      gapClasses: [...new Set(input.scope.gapClasses.map(normalizeGapClass).filter((value): value is GapClass => value !== null))].sort(),
      followUpClasses: [
        ...new Set(
          input.scope.followUpClasses
            .map(normalizeFollowUpClassId)
            .filter((value): value is GapDiscoveryFollowUpClassId => value !== null),
        ),
      ].sort(),
      proposalModes: normalizeStringList(input.scope.proposalModes),
      searchableTerms: normalizeSearchTerms(input.scope.searchableTerms),
    },
    governanceBinding: {
      authority: "openclashd-v2",
      policyRefs: normalizeStringList(input.governanceBinding.policyRefs),
      approvalRequired: Boolean(input.governanceBinding.approvalRequired),
      receiptsRequired: Boolean(input.governanceBinding.receiptsRequired),
    },
    evidence: {
      registryRef: input.evidence.registryRef?.trim() || null,
      knowledgeRefs: normalizeStringList(input.evidence.knowledgeRefs),
      priorReceiptRefs: normalizeStringList(input.evidence.priorReceiptRefs),
    },
    commercial: input.commercial
      ? {
          pricingProfileId: input.commercial.pricingProfileId?.trim() || null,
          usageClass: input.commercial.usageClass?.trim() || null,
          registryVisibility: normalizeRegistryVisibility(input.commercial.registryVisibility),
        }
      : null,
    signature: input.signature
      ? {
          signer: input.signature.signer.trim(),
          alg: input.signature.alg === "secp256k1" ? "secp256k1" : "ed25519",
          sig: input.signature.sig.trim(),
        }
      : null,
  };
}

export function validateGapDiscoveryAttestation(attestation: GapDiscoveryAttestation): { valid: boolean; errors: string[] } {
  const normalized = normalizeGapDiscoveryAttestation(attestation);
  const errors: string[] = [];

  if (!normalized.attestationId) {
    errors.push("attestationId is required");
  }
  if (!normalized.capabilityId) {
    errors.push("capabilityId is required");
  }
  if (!normalized.issuer.issuerId) {
    errors.push("issuer.issuerId is required");
  }
  if (!normalized.issuedAt) {
    errors.push("issuedAt is required");
  }
  if (!normalized.subject.subjectId) {
    errors.push("subject.subjectId is required");
  }
  if (normalized.trustMetadata.certificationSurfaces.length === 0) {
    errors.push("trustMetadata.certificationSurfaces must contain at least one surface");
  }
  if (normalized.subject.kind === "proposal_source" && !normalized.subject.sourceKind) {
    errors.push("subject.sourceKind is required for proposal_source");
  }
  if (normalized.subject.kind === "proposal_processor" && !normalized.subject.processorStage) {
    errors.push("subject.processorStage is required for proposal_processor");
  }
  if (normalized.scope.gapClasses.length === 0) {
    errors.push("scope.gapClasses must contain at least one class");
  }
  if (normalized.scope.followUpClasses.length === 0) {
    errors.push("scope.followUpClasses must contain at least one class");
  }
  if (normalized.governanceBinding.authority !== "openclashd-v2") {
    errors.push("governanceBinding.authority must be openclashd-v2");
  }
  if (!normalized.governanceBinding.approvalRequired) {
    errors.push("governanceBinding.approvalRequired must remain true");
  }
  if (!normalized.governanceBinding.receiptsRequired) {
    errors.push("governanceBinding.receiptsRequired must remain true");
  }

  return { valid: errors.length === 0, errors };
}

export function isGapDiscoveryAttestationActive(attestation: GapDiscoveryAttestation, at: string): boolean {
  const normalized = normalizeGapDiscoveryAttestation(attestation);
  if (normalized.trustMetadata.status !== "trusted") {
    return false;
  }
  if (!normalized.expiresAt) {
    return true;
  }
  return normalized.expiresAt >= at;
}
