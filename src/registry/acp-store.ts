export type RiskLevel = "low" | "medium" | "high";

export type CertificationLevel = "none" | "bronze" | "silver" | "gold" | "platinum";

export type ACPRankingSignals = {
  clashdScore: number;
  benchmarkScore: number;
  operatorTrust: number;
};

export type ACP = {
  acpId: string;
  version: string;
  domainPath: string;
  capabilities: string[];
  riskLevel: RiskLevel;
  model: string;
  promptArchitecture: string;
  benchmarkProfile: string;
  certificationLevel: CertificationLevel;
  provenance: string;
  rankingSignals: ACPRankingSignals;
};

const CERTIFICATION_ORDER: Record<CertificationLevel, number> = {
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

function normalizeDomainPath(path: string): string {
  return path
    .trim()
    .toLowerCase()
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");
}

function normalizeCapability(capability: string): string {
  return capability.trim().toLowerCase();
}

function normalizeRiskLevel(riskLevel: string): RiskLevel {
  if (riskLevel === "medium" || riskLevel === "high") {
    return riskLevel;
  }
  return "low";
}

function normalizeCertificationLevel(level: string): CertificationLevel {
  if (
    level === "none" ||
    level === "bronze" ||
    level === "silver" ||
    level === "gold" ||
    level === "platinum"
  ) {
    return level;
  }
  return "none";
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

function normalizeACP(input: ACP): ACP {
  return {
    ...input,
    domainPath: normalizeDomainPath(input.domainPath),
    capabilities: [...new Set(input.capabilities.map(normalizeCapability).filter(Boolean))].sort(),
    riskLevel: normalizeRiskLevel(input.riskLevel),
    certificationLevel: normalizeCertificationLevel(input.certificationLevel),
    rankingSignals: {
      clashdScore: clampScore(input.rankingSignals.clashdScore),
      benchmarkScore: clampScore(input.rankingSignals.benchmarkScore),
      operatorTrust: clampScore(input.rankingSignals.operatorTrust),
    },
  };
}

function compareACPIdentity(a: ACP, b: ACP): number {
  if (a.acpId !== b.acpId) {
    return a.acpId.localeCompare(b.acpId);
  }
  return a.version.localeCompare(b.version);
}

function cloneACP(acp: ACP): ACP {
  return {
    ...acp,
    capabilities: [...acp.capabilities],
    rankingSignals: { ...acp.rankingSignals },
  };
}

export function compareCertificationLevels(a: CertificationLevel, b: CertificationLevel): number {
  return CERTIFICATION_ORDER[a] - CERTIFICATION_ORDER[b];
}

export function isCertificationAtLeast(level: CertificationLevel, minimum: CertificationLevel): boolean {
  return compareCertificationLevels(level, minimum) >= 0;
}

export class ACPStore {
  private acps: ACP[];

  constructor(initialAcps: ACP[] = createDefaultACPs()) {
    this.acps = initialAcps.map(normalizeACP).sort(compareACPIdentity);
  }

  listAll(): ACP[] {
    return this.acps.map(cloneACP);
  }

  replaceAll(acps: ACP[]): void {
    this.acps = acps.map(normalizeACP).sort(compareACPIdentity);
  }

  upsert(acp: ACP): void {
    const normalized = normalizeACP(acp);
    const index = this.acps.findIndex((current) => current.acpId === normalized.acpId && current.version === normalized.version);

    if (index >= 0) {
      this.acps[index] = normalized;
    } else {
      this.acps.push(normalized);
      this.acps.sort(compareACPIdentity);
    }
  }
}

export function createDefaultACPs(): ACP[] {
  return [
    {
      acpId: "ACP-101",
      version: "1.0.0",
      domainPath: "financial/investing",
      capabilities: ["analysis", "retrieval"],
      riskLevel: "low",
      model: "llama3",
      promptArchitecture: "long-horizon-planner",
      benchmarkProfile: "investing-low-risk-v1",
      certificationLevel: "gold",
      provenance: "safeclash://certificates/CERT-101",
      rankingSignals: {
        clashdScore: 8.8,
        benchmarkScore: 9.1,
        operatorTrust: 8.7,
      },
    },
    {
      acpId: "ACP-118",
      version: "1.1.0",
      domainPath: "financial/investing",
      capabilities: ["analysis", "retrieval"],
      riskLevel: "low",
      model: "llama3",
      promptArchitecture: "portfolio-allocator-v2",
      benchmarkProfile: "investing-low-risk-v1",
      certificationLevel: "silver",
      provenance: "safeclash://certificates/CERT-118",
      rankingSignals: {
        clashdScore: 8.4,
        benchmarkScore: 8.5,
        operatorTrust: 8.2,
      },
    },
    {
      acpId: "ACP-202",
      version: "2.0.0",
      domainPath: "financial/trading",
      capabilities: ["analysis", "execution"],
      riskLevel: "high",
      model: "mixtral",
      promptArchitecture: "execution-reactive",
      benchmarkProfile: "trading-high-risk-v1",
      certificationLevel: "silver",
      provenance: "safeclash://certificates/CERT-202",
      rankingSignals: {
        clashdScore: 9.1,
        benchmarkScore: 7.9,
        operatorTrust: 6.4,
      },
    },
    {
      acpId: "ACP-305",
      version: "1.0.0",
      domainPath: "health/nutrition",
      capabilities: ["analysis", "advisory"],
      riskLevel: "medium",
      model: "gpt-4.1",
      promptArchitecture: "guarded-diet-planner",
      benchmarkProfile: "nutrition-med-risk-v1",
      certificationLevel: "gold",
      provenance: "safeclash://certificates/CERT-305",
      rankingSignals: {
        clashdScore: 8.1,
        benchmarkScore: 8.8,
        operatorTrust: 8.6,
      },
    },
    {
      acpId: "ACP-410",
      version: "1.2.0",
      domainPath: "legal/compliance",
      capabilities: ["retrieval", "summarization"],
      riskLevel: "low",
      model: "gpt-4o-mini",
      promptArchitecture: "policy-cross-checker",
      benchmarkProfile: "legal-low-risk-v2",
      certificationLevel: "platinum",
      provenance: "safeclash://certificates/CERT-410",
      rankingSignals: {
        clashdScore: 8.0,
        benchmarkScore: 9.3,
        operatorTrust: 9.2,
      },
    },
    {
      acpId: "ACP-422",
      version: "0.9.0",
      domainPath: "financial/investing",
      capabilities: ["analysis"],
      riskLevel: "low",
      model: "llama3",
      promptArchitecture: "candidate-experimental",
      benchmarkProfile: "investing-low-risk-v1",
      certificationLevel: "bronze",
      provenance: "safeclash://certificates/CERT-422",
      rankingSignals: {
        clashdScore: 7.2,
        benchmarkScore: 7.5,
        operatorTrust: 7.0,
      },
    },
  ];
}
