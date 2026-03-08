export type RiskLevel = "low" | "medium" | "high";

export type IntentionProfile = {
  intentionProfileId: string;
  domain: string;
  subdomain: string;
  riskLevel: RiskLevel;
  constraints: string[];
  summary: string;
  rankingSignals: {
    clashdScore: number;
    operatorTrust: number;
  };
};

function normalizePathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function normalizeConstraint(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeRiskLevel(value: string): RiskLevel {
  if (value === "medium" || value === "high") {
    return value;
  }
  return "low";
}

function clampScore(value: number): number {
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

function normalizeIntentionProfile(profile: IntentionProfile): IntentionProfile {
  return {
    ...profile,
    domain: normalizePathSegment(profile.domain),
    subdomain: normalizePathSegment(profile.subdomain),
    riskLevel: normalizeRiskLevel(profile.riskLevel),
    constraints: [...new Set(profile.constraints.map(normalizeConstraint).filter(Boolean))].sort(),
    rankingSignals: {
      clashdScore: clampScore(profile.rankingSignals.clashdScore),
      operatorTrust: clampScore(profile.rankingSignals.operatorTrust),
    },
  };
}

function compareIdentity(a: IntentionProfile, b: IntentionProfile): number {
  return a.intentionProfileId.localeCompare(b.intentionProfileId);
}

function cloneProfile(profile: IntentionProfile): IntentionProfile {
  return {
    ...profile,
    constraints: [...profile.constraints],
    rankingSignals: { ...profile.rankingSignals },
  };
}

export class IntentionStore {
  private profiles: IntentionProfile[];

  constructor(initialProfiles: IntentionProfile[] = createDefaultIntentionProfiles()) {
    this.profiles = initialProfiles.map(normalizeIntentionProfile).sort(compareIdentity);
  }

  listAll(): IntentionProfile[] {
    return this.profiles.map(cloneProfile);
  }

  replaceAll(nextProfiles: IntentionProfile[]): void {
    this.profiles = nextProfiles.map(normalizeIntentionProfile).sort(compareIdentity);
  }

  upsert(profile: IntentionProfile): void {
    const normalized = normalizeIntentionProfile(profile);
    const index = this.profiles.findIndex((current) => current.intentionProfileId === normalized.intentionProfileId);

    if (index >= 0) {
      this.profiles[index] = normalized;
    } else {
      this.profiles.push(normalized);
      this.profiles.sort(compareIdentity);
    }
  }
}

export function createDefaultIntentionProfiles(): IntentionProfile[] {
  return [
    {
      intentionProfileId: "INT-001",
      domain: "financial",
      subdomain: "investing",
      riskLevel: "low",
      constraints: ["long-term", "capital-preservation"],
      summary: "Long-horizon, low-volatility investing guidance.",
      rankingSignals: {
        clashdScore: 8.7,
        operatorTrust: 8.9,
      },
    },
    {
      intentionProfileId: "INT-002",
      domain: "financial",
      subdomain: "investing",
      riskLevel: "medium",
      constraints: ["balanced-growth", "diversification"],
      summary: "Balanced growth profile with moderate volatility tolerance.",
      rankingSignals: {
        clashdScore: 8.2,
        operatorTrust: 8.0,
      },
    },
    {
      intentionProfileId: "INT-003",
      domain: "financial",
      subdomain: "trading",
      riskLevel: "high",
      constraints: ["short-term", "active-management"],
      summary: "Active trading profile for high-risk operators.",
      rankingSignals: {
        clashdScore: 8.9,
        operatorTrust: 6.5,
      },
    },
    {
      intentionProfileId: "INT-004",
      domain: "health",
      subdomain: "nutrition",
      riskLevel: "low",
      constraints: ["evidence-based", "non-diagnostic"],
      summary: "Conservative nutrition assistant with strict safety boundaries.",
      rankingSignals: {
        clashdScore: 7.8,
        operatorTrust: 9.0,
      },
    },
  ];
}
