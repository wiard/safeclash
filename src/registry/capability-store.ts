import type { CertificationLevel } from "./config-store.ts";
import { normalizeTrustMetadata, type TrustMetadata } from "../trust/trust-metadata.ts";

export type CapabilityKind = "gap_discovery";
export type CapabilityStatus = "draft" | "active" | "revoked";
export type GapDiscoverySubjectKind = "proposal_source" | "proposal_processor";
export type GapClass = "market_gap" | "workflow_gap" | "knowledge_gap" | "control_gap";
export type GapDiscoveryFollowUpClassId = "operator_review" | "proposal_brief" | "knowledge_capture";
export type UsageMeterKind = "request" | "tool_exec" | "knowledge_artifact" | "lifecycle";
export type UsageMeterUnit = "count" | "ms" | "token" | "byte" | "event";

export type CapabilityUsageHint = {
  meterKind: UsageMeterKind;
  meterUnit: UsageMeterUnit;
  description: string;
  billableLater: boolean;
};

export type CapabilityPricingHint = {
  pricingProfileId?: string | null;
  usageClass?: string | null;
  settlementMode: "governed";
  notes?: string | null;
};

export type GapDiscoveryFollowUpClass = {
  classId: GapDiscoveryFollowUpClassId;
  name: string;
  description: string;
  status: CapabilityStatus;
  kernelApprovalRequired: true;
};

export type CapabilityRegistryEntry = {
  capabilityId: string;
  kind: CapabilityKind;
  name: string;
  description: string;
  status: CapabilityStatus;
  governanceAuthority: "openclashd-v2";
  supportedSubjectKinds: GapDiscoverySubjectKind[];
  supportedGapClasses: GapClass[];
  followUpClasses: GapDiscoveryFollowUpClass[];
  certification: {
    minCertificationLevel: CertificationLevel;
    attestationRequired: boolean;
    receiptsRequired: boolean;
    operatorVisible: boolean;
  };
  trustMetadata: TrustMetadata;
  registry: {
    namespace: string;
    provenanceRef?: string | null;
  };
  searchableTerms: string[];
  usageHints: CapabilityUsageHint[];
  pricingHints: CapabilityPricingHint;
};

function normalizeCapabilityStatus(value: string): CapabilityStatus {
  if (value === "draft" || value === "revoked") {
    return value;
  }
  return "active";
}

function normalizeGapSubjectKind(value: string): GapDiscoverySubjectKind | null {
  if (value === "proposal_source" || value === "proposal_processor") {
    return value;
  }
  return null;
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

function normalizeCertificationLevel(value: string): CertificationLevel {
  if (
    value === "none" ||
    value === "bronze" ||
    value === "silver" ||
    value === "gold" ||
    value === "platinum"
  ) {
    return value;
  }
  return "none";
}

function normalizeUsageMeterKind(value: string): UsageMeterKind {
  if (value === "request" || value === "knowledge_artifact" || value === "lifecycle") {
    return value;
  }
  return "tool_exec";
}

function normalizeUsageMeterUnit(value: string): UsageMeterUnit {
  if (value === "count" || value === "token" || value === "byte" || value === "event") {
    return value;
  }
  return "ms";
}

function normalizeUsageHint(hint: CapabilityUsageHint): CapabilityUsageHint {
  return {
    meterKind: normalizeUsageMeterKind(hint.meterKind),
    meterUnit: normalizeUsageMeterUnit(hint.meterUnit),
    description: hint.description.trim(),
    billableLater: Boolean(hint.billableLater),
  };
}

function normalizeFollowUpClass(input: GapDiscoveryFollowUpClass): GapDiscoveryFollowUpClass | null {
  const classId = normalizeFollowUpClassId(input.classId);
  if (!classId) {
    return null;
  }

  return {
    classId,
    name: input.name.trim(),
    description: input.description.trim(),
    status: normalizeCapabilityStatus(input.status),
    kernelApprovalRequired: true,
  };
}

function normalizeCapability(input: CapabilityRegistryEntry): CapabilityRegistryEntry {
  return {
    ...input,
    capabilityId: input.capabilityId.trim(),
    kind: "gap_discovery",
    name: input.name.trim(),
    description: input.description.trim(),
    status: normalizeCapabilityStatus(input.status),
    governanceAuthority: "openclashd-v2",
    supportedSubjectKinds: [
      ...new Set(input.supportedSubjectKinds.map(normalizeGapSubjectKind).filter((value): value is GapDiscoverySubjectKind => value !== null)),
    ].sort(),
    supportedGapClasses: [
      ...new Set(input.supportedGapClasses.map(normalizeGapClass).filter((value): value is GapClass => value !== null)),
    ].sort(),
    followUpClasses: input.followUpClasses
      .map(normalizeFollowUpClass)
      .filter((value): value is GapDiscoveryFollowUpClass => value !== null)
      .sort((a, b) => a.classId.localeCompare(b.classId)),
    certification: {
      minCertificationLevel: normalizeCertificationLevel(input.certification.minCertificationLevel),
      attestationRequired: Boolean(input.certification.attestationRequired),
      receiptsRequired: Boolean(input.certification.receiptsRequired),
      operatorVisible: Boolean(input.certification.operatorVisible),
    },
    trustMetadata: normalizeTrustMetadata(input.trustMetadata),
    registry: {
      namespace: input.registry.namespace.trim(),
      provenanceRef: input.registry.provenanceRef?.trim() || null,
    },
    searchableTerms: [...new Set(input.searchableTerms.map((term) => term.trim().toLowerCase()).filter(Boolean))].sort(),
    usageHints: input.usageHints.map(normalizeUsageHint),
    pricingHints: {
      pricingProfileId: input.pricingHints.pricingProfileId?.trim() || null,
      usageClass: input.pricingHints.usageClass?.trim() || null,
      settlementMode: "governed",
      notes: input.pricingHints.notes?.trim() || null,
    },
  };
}

function compareIdentity(a: CapabilityRegistryEntry, b: CapabilityRegistryEntry): number {
  return a.capabilityId.localeCompare(b.capabilityId);
}

function cloneCapability(entry: CapabilityRegistryEntry): CapabilityRegistryEntry {
  return {
    ...entry,
    supportedSubjectKinds: [...entry.supportedSubjectKinds],
    supportedGapClasses: [...entry.supportedGapClasses],
    followUpClasses: entry.followUpClasses.map((followUpClass) => ({ ...followUpClass })),
    searchableTerms: [...entry.searchableTerms],
    certification: { ...entry.certification },
    trustMetadata: {
      ...entry.trustMetadata,
      certificationSurfaces: [...entry.trustMetadata.certificationSurfaces],
      searchableTerms: [...entry.trustMetadata.searchableTerms],
    },
    registry: { ...entry.registry },
    usageHints: entry.usageHints.map((hint) => ({ ...hint })),
    pricingHints: { ...entry.pricingHints },
  };
}

export class CapabilityRegistryStore {
  private capabilities: CapabilityRegistryEntry[];

  constructor(initialEntries: CapabilityRegistryEntry[] = createDefaultCapabilities()) {
    this.capabilities = initialEntries.map(normalizeCapability).sort(compareIdentity);
  }

  listAll(): CapabilityRegistryEntry[] {
    return this.capabilities.map(cloneCapability);
  }

  getById(capabilityId: string): CapabilityRegistryEntry | null {
    const match = this.capabilities.find((entry) => entry.capabilityId === capabilityId.trim());
    return match ? cloneCapability(match) : null;
  }

  replaceAll(nextEntries: CapabilityRegistryEntry[]): void {
    this.capabilities = nextEntries.map(normalizeCapability).sort(compareIdentity);
  }

  upsert(entry: CapabilityRegistryEntry): void {
    const normalized = normalizeCapability(entry);
    const index = this.capabilities.findIndex((current) => current.capabilityId === normalized.capabilityId);

    if (index >= 0) {
      this.capabilities[index] = normalized;
    } else {
      this.capabilities.push(normalized);
      this.capabilities.sort(compareIdentity);
    }
  }
}

export function createDefaultCapabilities(): CapabilityRegistryEntry[] {
  return [
    {
      capabilityId: "GAP_DISCOVERY",
      kind: "gap_discovery",
      name: "Gap Discovery",
      description: "Certified identification, ranking, and proposal assembly of governed gaps for operator review.",
      status: "active",
      governanceAuthority: "openclashd-v2",
      supportedSubjectKinds: ["proposal_source", "proposal_processor"],
      supportedGapClasses: ["market_gap", "workflow_gap", "knowledge_gap", "control_gap"],
      followUpClasses: [
        {
          classId: "operator_review",
          name: "Operator Review",
          description: "Present a governed discovery finding for explicit human review.",
          status: "active",
          kernelApprovalRequired: true,
        },
        {
          classId: "proposal_brief",
          name: "Proposal Brief",
          description: "Package a governed discovery finding into a brief for kernel routing.",
          status: "active",
          kernelApprovalRequired: true,
        },
        {
          classId: "knowledge_capture",
          name: "Knowledge Capture",
          description: "Persist approved discovery evidence into the knowledge loop after kernel authorization.",
          status: "active",
          kernelApprovalRequired: true,
        },
      ],
      certification: {
        minCertificationLevel: "silver",
        attestationRequired: true,
        receiptsRequired: true,
        operatorVisible: true,
      },
      trustMetadata: {
        status: "trusted",
        certificationLevel: "silver",
        operatorVisible: true,
        evidenceRef: "safeclash://capabilities/GAP_DISCOVERY",
        registryVisibility: "public",
        certificationSurfaces: ["registry", "attestation", "receipt"],
        searchableTerms: ["gap", "governed", "trust"],
      },
      registry: {
        namespace: "safeclash/capabilities/gap-discovery",
        provenanceRef: "safeclash://capabilities/GAP_DISCOVERY",
      },
      searchableTerms: ["certified", "discovery", "gap", "governed", "proposal", "trust"],
      usageHints: [
        {
          meterKind: "request",
          meterUnit: "count",
          description: "Per discovery run or scan window accepted by governance.",
          billableLater: true,
        },
        {
          meterKind: "tool_exec",
          meterUnit: "ms",
          description: "Processor runtime for scoring or proposal synthesis.",
          billableLater: true,
        },
        {
          meterKind: "knowledge_artifact",
          meterUnit: "event",
          description: "Committed proposal or attestation artifact written into the knowledge loop.",
          billableLater: true,
        },
      ],
      pricingHints: {
        pricingProfileId: "gap-discovery-standard",
        usageClass: "governed_discovery",
        settlementMode: "governed",
        notes: "Pricing remains optional; usage atoms and registry search terms are reserved for later rollout.",
      },
    },
  ];
}
