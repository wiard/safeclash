import type { RiskLevel } from "./intention-store.ts";

export type CertificationLevel = "none" | "bronze" | "silver" | "gold" | "platinum";

export type ConfigurationStatus = "candidate" | "certified" | "revoked";

export type AIConfigurationAtom = {
  configId: string;
  version: string;
  intentionProfileId: string;
  model: string;
  promptArchitecture: string;
  capabilityConstraints: string[];
  benchmarkContractId?: string | null;
  runtimeEnvelopeHash?: string | null;
  riskLevel: RiskLevel;
  certificationLevel: CertificationLevel;
  certificateId?: string | null;
  certificateRef?: string | null;
  status: ConfigurationStatus;
  rankingSignals: {
    benchmarkScore: number;
    runtimeReliability: number;
    usageConfidence: number;
  };
};

const CERTIFICATION_ORDER: Record<CertificationLevel, number> = {
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

function normalizeCapabilityConstraint(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeRiskLevel(value: string): RiskLevel {
  if (value === "medium" || value === "high") {
    return value;
  }
  return "low";
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

function normalizeStatus(value: string): ConfigurationStatus {
  if (value === "candidate" || value === "revoked") {
    return value;
  }
  return "certified";
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

function normalizeConfiguration(input: AIConfigurationAtom): AIConfigurationAtom {
  const benchmarkContractId = input.benchmarkContractId?.trim() || null;
  const runtimeEnvelopeHash = input.runtimeEnvelopeHash?.trim() || null;
  const certificateId = input.certificateId?.trim() || null;
  const certificateRef = input.certificateRef?.trim() || null;

  return {
    ...input,
    capabilityConstraints: [...new Set(input.capabilityConstraints.map(normalizeCapabilityConstraint).filter(Boolean))].sort(),
    benchmarkContractId,
    runtimeEnvelopeHash,
    riskLevel: normalizeRiskLevel(input.riskLevel),
    certificationLevel: normalizeCertificationLevel(input.certificationLevel),
    certificateId,
    certificateRef,
    status: normalizeStatus(input.status),
    rankingSignals: {
      benchmarkScore: clampScore(input.rankingSignals.benchmarkScore),
      runtimeReliability: clampScore(input.rankingSignals.runtimeReliability),
      usageConfidence: clampScore(input.rankingSignals.usageConfidence),
    },
  };
}

function compareIdentity(a: AIConfigurationAtom, b: AIConfigurationAtom): number {
  if (a.configId !== b.configId) {
    return a.configId.localeCompare(b.configId);
  }
  return a.version.localeCompare(b.version);
}

function cloneConfiguration(configuration: AIConfigurationAtom): AIConfigurationAtom {
  return {
    ...configuration,
    capabilityConstraints: [...configuration.capabilityConstraints],
    rankingSignals: { ...configuration.rankingSignals },
  };
}

export function compareCertificationLevels(a: CertificationLevel, b: CertificationLevel): number {
  return CERTIFICATION_ORDER[a] - CERTIFICATION_ORDER[b];
}

export function isCertificationAtLeast(level: CertificationLevel, minimum: CertificationLevel): boolean {
  return compareCertificationLevels(level, minimum) >= 0;
}

export class AIConfigurationStore {
  private configs: AIConfigurationAtom[];

  constructor(initialConfigs: AIConfigurationAtom[] = createDefaultConfigurations()) {
    this.configs = initialConfigs.map(normalizeConfiguration).sort(compareIdentity);
  }

  listAll(): AIConfigurationAtom[] {
    return this.configs.map(cloneConfiguration);
  }

  listByIntentionProfileId(intentionProfileId: string): AIConfigurationAtom[] {
    return this.configs
      .filter((config) => config.intentionProfileId === intentionProfileId)
      .map(cloneConfiguration);
  }

  replaceAll(nextConfigs: AIConfigurationAtom[]): void {
    this.configs = nextConfigs.map(normalizeConfiguration).sort(compareIdentity);
  }

  upsert(config: AIConfigurationAtom): void {
    const normalized = normalizeConfiguration(config);
    const index = this.configs.findIndex(
      (current) => current.configId === normalized.configId && current.version === normalized.version,
    );

    if (index >= 0) {
      this.configs[index] = normalized;
    } else {
      this.configs.push(normalized);
      this.configs.sort(compareIdentity);
    }
  }
}

export function createDefaultConfigurations(): AIConfigurationAtom[] {
  return [
    {
      configId: "CFG-101",
      version: "1.0.0",
      intentionProfileId: "INT-001",
      model: "llama3",
      promptArchitecture: "long-horizon-planner",
      capabilityConstraints: ["analysis", "retrieval", "no-execution"],
      benchmarkContractId: "investing-low-risk-v1",
      runtimeEnvelopeHash: "rehash-cfg-101-v1",
      riskLevel: "low",
      certificationLevel: "gold",
      certificateId: "CERT-101",
      certificateRef: "safeclash://certificates/CERT-101",
      status: "certified",
      rankingSignals: {
        benchmarkScore: 9.1,
        runtimeReliability: 8.9,
        usageConfidence: 8.5,
      },
    },
    {
      configId: "CFG-118",
      version: "1.1.0",
      intentionProfileId: "INT-001",
      model: "llama3",
      promptArchitecture: "portfolio-allocator-v2",
      capabilityConstraints: ["analysis", "retrieval", "no-execution"],
      benchmarkContractId: "investing-low-risk-v1",
      runtimeEnvelopeHash: "rehash-cfg-118-v1-1",
      riskLevel: "low",
      certificationLevel: "silver",
      certificateId: "CERT-118",
      certificateRef: "safeclash://certificates/CERT-118",
      status: "certified",
      rankingSignals: {
        benchmarkScore: 8.6,
        runtimeReliability: 8.4,
        usageConfidence: 8.1,
      },
    },
    {
      configId: "CFG-422",
      version: "0.9.0",
      intentionProfileId: "INT-001",
      model: "llama3",
      promptArchitecture: "candidate-experimental",
      capabilityConstraints: ["analysis"],
      benchmarkContractId: "investing-low-risk-v1",
      runtimeEnvelopeHash: "rehash-cfg-422-v0-9",
      riskLevel: "low",
      certificationLevel: "bronze",
      certificateId: "CERT-422",
      certificateRef: "safeclash://certificates/CERT-422",
      status: "candidate",
      rankingSignals: {
        benchmarkScore: 7.5,
        runtimeReliability: 7.2,
        usageConfidence: 7.0,
      },
    },
    {
      configId: "CFG-205",
      version: "1.0.0",
      intentionProfileId: "INT-002",
      model: "gpt-4.1",
      promptArchitecture: "balanced-growth-planner",
      capabilityConstraints: ["analysis", "retrieval"],
      benchmarkContractId: "investing-med-risk-v1",
      runtimeEnvelopeHash: "rehash-cfg-205-v1",
      riskLevel: "medium",
      certificationLevel: "silver",
      certificateId: "CERT-205",
      certificateRef: "safeclash://certificates/CERT-205",
      status: "certified",
      rankingSignals: {
        benchmarkScore: 8.4,
        runtimeReliability: 8.2,
        usageConfidence: 8.0,
      },
    },
    {
      configId: "CFG-303",
      version: "2.0.0",
      intentionProfileId: "INT-003",
      model: "mixtral",
      promptArchitecture: "execution-reactive",
      capabilityConstraints: ["analysis", "execution"],
      benchmarkContractId: "trading-high-risk-v1",
      runtimeEnvelopeHash: "rehash-cfg-303-v2",
      riskLevel: "high",
      certificationLevel: "silver",
      certificateId: "CERT-303",
      certificateRef: "safeclash://certificates/CERT-303",
      status: "certified",
      rankingSignals: {
        benchmarkScore: 7.9,
        runtimeReliability: 7.4,
        usageConfidence: 7.1,
      },
    },
    {
      configId: "CFG-401",
      version: "1.0.0",
      intentionProfileId: "INT-004",
      model: "gpt-4o-mini",
      promptArchitecture: "nutrition-guardrails",
      capabilityConstraints: ["analysis", "retrieval", "non-diagnostic"],
      benchmarkContractId: "nutrition-low-risk-v1",
      runtimeEnvelopeHash: "rehash-cfg-401-v1",
      riskLevel: "low",
      certificationLevel: "gold",
      certificateId: "CERT-401",
      certificateRef: "safeclash://certificates/CERT-401",
      status: "certified",
      rankingSignals: {
        benchmarkScore: 8.8,
        runtimeReliability: 9.1,
        usageConfidence: 8.7,
      },
    },
  ];
}
