export type EmergingIntentionState = "emerging" | "certified" | "promoted";

export type EmergingIntentionProfile = {
  intentionId: string;
  linkedIntentionProfileId?: string;
  domain: string;
  subdomain: string;
  description: string;
  confidenceScore: number;
  sourceClusters: string[];
  linkedCells: string[];
  clashdSignalSummary: string;
  state: EmergingIntentionState;
  relatedIncomingToolCount: number;
  certifiedConfigurationExists: boolean;
};

function normalizePathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function clampZeroToTen(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 10) {
    return 10;
  }
  return value;
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function normalizeState(value: string): EmergingIntentionState {
  if (value === "certified" || value === "promoted") {
    return value;
  }
  return "emerging";
}

function normalizeEmergingProfile(input: EmergingIntentionProfile): EmergingIntentionProfile {
  return {
    ...input,
    domain: normalizePathSegment(input.domain),
    subdomain: normalizePathSegment(input.subdomain),
    confidenceScore: clampZeroToTen(input.confidenceScore),
    sourceClusters: [...new Set(input.sourceClusters.map((entry) => entry.trim()).filter(Boolean))].sort(),
    linkedCells: [...new Set(input.linkedCells.map((entry) => entry.trim()).filter(Boolean))].sort(),
    state: normalizeState(input.state),
    relatedIncomingToolCount: normalizeCount(input.relatedIncomingToolCount),
    certifiedConfigurationExists: Boolean(input.certifiedConfigurationExists),
  };
}

function compareIdentity(a: EmergingIntentionProfile, b: EmergingIntentionProfile): number {
  return a.intentionId.localeCompare(b.intentionId);
}

function cloneProfile(profile: EmergingIntentionProfile): EmergingIntentionProfile {
  return {
    ...profile,
    sourceClusters: [...profile.sourceClusters],
    linkedCells: [...profile.linkedCells],
  };
}

export class EmergingIntentionStore {
  private profiles: EmergingIntentionProfile[];

  constructor(initialProfiles: EmergingIntentionProfile[] = createDefaultEmergingIntentionProfiles()) {
    this.profiles = initialProfiles.map(normalizeEmergingProfile).sort(compareIdentity);
  }

  listAll(): EmergingIntentionProfile[] {
    return this.profiles.map(cloneProfile);
  }

  replaceAll(nextProfiles: EmergingIntentionProfile[]): void {
    this.profiles = nextProfiles.map(normalizeEmergingProfile).sort(compareIdentity);
  }

  upsert(profile: EmergingIntentionProfile): void {
    const normalized = normalizeEmergingProfile(profile);
    const index = this.profiles.findIndex((current) => current.intentionId === normalized.intentionId);

    if (index >= 0) {
      this.profiles[index] = normalized;
    } else {
      this.profiles.push(normalized);
      this.profiles.sort(compareIdentity);
    }
  }
}

export function createDefaultEmergingIntentionProfiles(): EmergingIntentionProfile[] {
  return [
    {
      intentionId: "EMR-001",
      linkedIntentionProfileId: "INT-001",
      domain: "financial",
      subdomain: "investing",
      description: "Long-term income allocation with drawdown-aware rebalancing.",
      confidenceScore: 8.6,
      sourceClusters: ["paperfeed:portfolio-2026", "repo-scan:allocation-agents"],
      linkedCells: ["cell-finance-core", "cell-risk-guardrails"],
      clashdSignalSummary: "Signal convergence across portfolio optimization and risk-control clusters.",
      state: "emerging",
      relatedIncomingToolCount: 4,
      certifiedConfigurationExists: true,
    },
    {
      intentionId: "EMR-002",
      domain: "financial",
      subdomain: "tax-planning",
      description: "Tax-aware portfolio transitions with jurisdiction-aware constraints.",
      confidenceScore: 7.9,
      sourceClusters: ["paperfeed:tax-portfolio", "agent-observe:planner-candidates"],
      linkedCells: ["cell-finance-core", "cell-compliance"],
      clashdSignalSummary: "Growing signal volume, moderate forensics confidence, strong operator relevance.",
      state: "emerging",
      relatedIncomingToolCount: 3,
      certifiedConfigurationExists: false,
    },
    {
      intentionId: "EMR-003",
      linkedIntentionProfileId: "INT-003",
      domain: "financial",
      subdomain: "trading",
      description: "Intraday event-response trading copilots with strict execution guardrails.",
      confidenceScore: 7.2,
      sourceClusters: ["repo-scan:execution-agents", "paperfeed:event-driven-trading"],
      linkedCells: ["cell-finance-core", "cell-market-data"],
      clashdSignalSummary: "High novelty, mixed reliability; governance review still active.",
      state: "certified",
      relatedIncomingToolCount: 2,
      certifiedConfigurationExists: true,
    },
    {
      intentionId: "EMR-004",
      linkedIntentionProfileId: "INT-004",
      domain: "health",
      subdomain: "nutrition",
      description: "Condition-aware meal planning with conservative evidence thresholds.",
      confidenceScore: 8.3,
      sourceClusters: ["paperfeed:nutrition-evidence", "dataset-scan:meal-guidelines"],
      linkedCells: ["cell-health-safety", "cell-evidence-review"],
      clashdSignalSummary: "Consistent evidence quality and low-risk usage profile.",
      state: "promoted",
      relatedIncomingToolCount: 5,
      certifiedConfigurationExists: true,
    },
  ];
}
