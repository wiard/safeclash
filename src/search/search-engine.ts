import {
  AIConfigurationStore,
  type AIConfigurationAtom,
  compareCertificationLevels,
  isCertificationAtLeast,
} from "../registry/config-store.ts";
import { IntentionStore, type IntentionProfile } from "../registry/intention-store.ts";
import { parseSearchQuery, type IntentionSearchQuery } from "./query-parser.ts";
import {
  rankIntentionCandidates,
  type IntentionCandidate,
  type RankingBreakdown,
} from "./ranking.ts";

export type SearchResult = {
  intentionProfile: {
    intentionProfileId: string;
    domain: string;
    subdomain: string;
    riskLevel: IntentionProfile["riskLevel"];
    constraints: string[];
    summary: string;
  };
  bestConfiguration: {
    configId: string;
    version: string;
    model: string;
    promptArchitecture: string;
    capabilityConstraints: string[];
    certificateId: string | null;
    benchmarkContractId: string | null;
    runtimeEnvelopeHash: string | null;
    certificationLevel: AIConfigurationAtom["certificationLevel"];
    benchmarkScore: number;
  };
  rankingScore: number;
  score: number;
  ranking: RankingBreakdown;
};

export type SearchResponse = {
  query: IntentionSearchQuery;
  total: number;
  results: SearchResult[];
};

type RegistrySnapshot = {
  intentions: IntentionProfile[];
  configsByIntention: Map<string, AIConfigurationAtom[]>;
};

function compareConfigForSelection(a: AIConfigurationAtom, b: AIConfigurationAtom): number {
  const aSignal = a.rankingSignals.benchmarkScore + a.rankingSignals.runtimeReliability + a.rankingSignals.usageConfidence;
  const bSignal = b.rankingSignals.benchmarkScore + b.rankingSignals.runtimeReliability + b.rankingSignals.usageConfidence;
  if (aSignal !== bSignal) {
    return bSignal - aSignal;
  }

  const certificationDiff = compareCertificationLevels(b.certificationLevel, a.certificationLevel);
  if (certificationDiff !== 0) {
    return certificationDiff;
  }

  if (a.configId !== b.configId) {
    return a.configId.localeCompare(b.configId);
  }

  return a.version.localeCompare(b.version);
}

function includesAllConstraints(candidate: IntentionProfile, required: string[]): boolean {
  if (required.length === 0) {
    return true;
  }
  const set = new Set(candidate.constraints);
  return required.every((requiredConstraint) => set.has(requiredConstraint));
}

function isIntentionMatch(intention: IntentionProfile, query: IntentionSearchQuery): boolean {
  if (query.domain && intention.domain !== query.domain) {
    return false;
  }

  if (query.subdomain && intention.subdomain !== query.subdomain) {
    return false;
  }

  if (query.riskLevel && intention.riskLevel !== query.riskLevel) {
    return false;
  }

  return includesAllConstraints(intention, query.constraints);
}

function mapRankedResult(ranked: ReturnType<typeof rankIntentionCandidates>[number]): SearchResult {
  return {
    intentionProfile: {
      intentionProfileId: ranked.candidate.intention.intentionProfileId,
      domain: ranked.candidate.intention.domain,
      subdomain: ranked.candidate.intention.subdomain,
      riskLevel: ranked.candidate.intention.riskLevel,
      constraints: [...ranked.candidate.intention.constraints],
      summary: ranked.candidate.intention.summary,
    },
    bestConfiguration: {
      configId: ranked.candidate.bestConfiguration.configId,
      version: ranked.candidate.bestConfiguration.version,
      model: ranked.candidate.bestConfiguration.model,
      promptArchitecture: ranked.candidate.bestConfiguration.promptArchitecture,
      capabilityConstraints: [...ranked.candidate.bestConfiguration.capabilityConstraints],
      certificateId: ranked.candidate.bestConfiguration.certificateId ?? null,
      benchmarkContractId: ranked.candidate.bestConfiguration.benchmarkContractId ?? null,
      runtimeEnvelopeHash: ranked.candidate.bestConfiguration.runtimeEnvelopeHash ?? null,
      certificationLevel: ranked.candidate.bestConfiguration.certificationLevel,
      benchmarkScore: ranked.candidate.bestConfiguration.rankingSignals.benchmarkScore,
    },
    rankingScore: ranked.score,
    score: ranked.score,
    ranking: ranked.breakdown,
  };
}

export class SafeClashSearchEngine {
  private registry: RegistrySnapshot;
  private readonly intentionStore: IntentionStore;
  private readonly configurationStore: AIConfigurationStore;

  constructor(intentionStore: IntentionStore, configurationStore: AIConfigurationStore) {
    this.intentionStore = intentionStore;
    this.configurationStore = configurationStore;
    this.registry = { intentions: [], configsByIntention: new Map<string, AIConfigurationAtom[]>() };
    this.rebuildIndex();
  }

  rebuildIndex(): void {
    const intentions = this.intentionStore.listAll();
    const allConfigs = this.configurationStore.listAll();
    const configsByIntention = new Map<string, AIConfigurationAtom[]>();

    for (const config of allConfigs) {
      const current = configsByIntention.get(config.intentionProfileId);
      if (current) {
        current.push(config);
      } else {
        configsByIntention.set(config.intentionProfileId, [config]);
      }
    }

    for (const configs of configsByIntention.values()) {
      configs.sort(compareConfigForSelection);
    }

    this.registry = {
      intentions,
      configsByIntention,
    };
  }

  search(input: URLSearchParams | string): SearchResponse {
    const query = parseSearchQuery(input);
    const candidates: IntentionCandidate[] = [];

    for (const intention of this.registry.intentions) {
      if (!isIntentionMatch(intention, query)) {
        continue;
      }

      const configs = this.registry.configsByIntention.get(intention.intentionProfileId) ?? [];
      const bestConfiguration = configs.find(
        (config) =>
          config.status === "certified" && isCertificationAtLeast(config.certificationLevel, query.certificationAtLeast),
      );

      if (!bestConfiguration) {
        continue;
      }

      candidates.push({
        intention,
        bestConfiguration,
      });
    }

    const ranked = rankIntentionCandidates(candidates, query);
    const paged = ranked.slice(query.offset, query.offset + query.limit);

    return {
      query,
      total: ranked.length,
      results: paged.map(mapRankedResult),
    };
  }
}
