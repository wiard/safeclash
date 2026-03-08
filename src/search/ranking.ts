import {
  type AIConfigurationAtom,
  compareCertificationLevels,
  type CertificationLevel,
} from "../registry/config-store.ts";
import type { IntentionProfile, RiskLevel } from "../registry/intention-store.ts";
import type { IntentionSearchQuery } from "./query-parser.ts";

const CLASHD_WEIGHT = 0.3;
const OPERATOR_TRUST_WEIGHT = 0.2;
const BENCHMARK_WEIGHT = 0.25;
const RELIABILITY_WEIGHT = 0.15;
const USAGE_CONFIDENCE_WEIGHT = 0.1;

const CERTIFICATION_BOOST: Record<CertificationLevel, number> = {
  none: 0,
  bronze: 0.15,
  silver: 0.4,
  gold: 0.8,
  platinum: 1.2,
};

const BASE_RISK_PENALTY: Record<RiskLevel, number> = {
  low: 0,
  medium: 0.25,
  high: 0.6,
};

export type RankingBreakdown = {
  intentionClashd: number;
  intentionTrust: number;
  benchmark: number;
  reliability: number;
  usageConfidence: number;
  certificationBoost: number;
  riskPenalty: number;
  total: number;
};

export type IntentionCandidate = {
  intention: IntentionProfile;
  bestConfiguration: AIConfigurationAtom;
};

export type RankedIntention = {
  candidate: IntentionCandidate;
  score: number;
  breakdown: RankingBreakdown;
};

function roundScore(value: number): number {
  return Number(value.toFixed(6));
}

function computeRiskPenalty(riskLevel: RiskLevel, query: IntentionSearchQuery): number {
  if (query.riskLevel) {
    return 0;
  }
  return BASE_RISK_PENALTY[riskLevel];
}

export function scoreIntentionCandidate(candidate: IntentionCandidate, query: IntentionSearchQuery): RankedIntention {
  const intentionClashd = candidate.intention.rankingSignals.clashdScore * CLASHD_WEIGHT;
  const intentionTrust = candidate.intention.rankingSignals.operatorTrust * OPERATOR_TRUST_WEIGHT;
  const benchmark = candidate.bestConfiguration.rankingSignals.benchmarkScore * BENCHMARK_WEIGHT;
  const reliability = candidate.bestConfiguration.rankingSignals.runtimeReliability * RELIABILITY_WEIGHT;
  const usageConfidence = candidate.bestConfiguration.rankingSignals.usageConfidence * USAGE_CONFIDENCE_WEIGHT;
  const certificationBoost = CERTIFICATION_BOOST[candidate.bestConfiguration.certificationLevel];
  const riskPenalty = computeRiskPenalty(candidate.intention.riskLevel, query);
  const total = intentionClashd + intentionTrust + benchmark + reliability + usageConfidence + certificationBoost - riskPenalty;

  return {
    candidate,
    score: roundScore(total),
    breakdown: {
      intentionClashd: roundScore(intentionClashd),
      intentionTrust: roundScore(intentionTrust),
      benchmark: roundScore(benchmark),
      reliability: roundScore(reliability),
      usageConfidence: roundScore(usageConfidence),
      certificationBoost: roundScore(certificationBoost),
      riskPenalty: roundScore(riskPenalty),
      total: roundScore(total),
    },
  };
}

function compareRankedIntention(a: RankedIntention, b: RankedIntention): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }

  const certificationDiff = compareCertificationLevels(
    b.candidate.bestConfiguration.certificationLevel,
    a.candidate.bestConfiguration.certificationLevel,
  );
  if (certificationDiff !== 0) {
    return certificationDiff;
  }

  if (a.candidate.intention.intentionProfileId !== b.candidate.intention.intentionProfileId) {
    return a.candidate.intention.intentionProfileId.localeCompare(b.candidate.intention.intentionProfileId);
  }

  if (a.candidate.bestConfiguration.configId !== b.candidate.bestConfiguration.configId) {
    return a.candidate.bestConfiguration.configId.localeCompare(b.candidate.bestConfiguration.configId);
  }

  return a.candidate.bestConfiguration.version.localeCompare(b.candidate.bestConfiguration.version);
}

export function rankIntentionCandidates(
  candidates: IntentionCandidate[],
  query: IntentionSearchQuery,
): RankedIntention[] {
  return candidates
    .map((candidate) => scoreIntentionCandidate(candidate, query))
    .sort(compareRankedIntention);
}
