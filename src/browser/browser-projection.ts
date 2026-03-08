import { type EmergingIntentionProfile, type EmergingIntentionState } from "../registry/emerging-intention-store.ts";
import type { SearchResult } from "../search/search-engine.ts";

const CATEGORY_METADATA: Record<string, { categoryId: string; title: string; description: string }> = {
  financial: {
    categoryId: "financial",
    title: "Financial",
    description: "Investing, trading, and planning assistants under governed safety constraints.",
  },
  legal: {
    categoryId: "legal",
    title: "Legal",
    description: "Policy, compliance, and legal reasoning assistants.",
  },
  research: {
    categoryId: "research",
    title: "Research",
    description: "Discovery and synthesis assistants for scientific and technical workflows.",
  },
  education: {
    categoryId: "education",
    title: "Education",
    description: "Teaching and coaching assistants with operator-defined boundaries.",
  },
  operations: {
    categoryId: "operations",
    title: "Operations",
    description: "Execution planning and operations copilots for day-to-day work.",
  },
  security: {
    categoryId: "security",
    title: "Security",
    description: "Threat analysis and security governance assistants.",
  },
};

type CertificationLevel = SearchResult["bestConfiguration"]["certificationLevel"];

const CERTIFICATION_WEIGHT: Record<CertificationLevel, number> = {
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

export type BrowserCertifiedItem = {
  configId: string;
  intentionId: string;
  title: string;
  description: string;
  domain: string;
  subdomain: string;
  riskProfile: string;
  certificationLevel: CertificationLevel;
  rankingScore: number;
  benchmarkSummary: string;
  benchmarkScore: number;
  model: string;
  capabilitiesSummary: string;
  constraintsSummary: string;
  runtimeEnvelopeHash: string | null;
  certificateId: string | null;
  benchmarkContractId: string | null;
  publisherSummary: string | null;
  pricingSummary: string | null;
  deployReady: boolean;
  rankingExplanation: string;
};

export type BrowserEmergingItem = {
  intentionId: string;
  title: string;
  description: string;
  domain: string;
  subdomain: string;
  confidenceScore: number;
  sourceSummary: string;
  sourceClusters: string[];
  linkedCells: string[];
  relatedIncomingToolCount: number;
  certifiedConfigurationExists: boolean;
  state: EmergingIntentionState;
};

export type BrowserCategory = {
  categoryId: string;
  title: string;
  description: string;
  itemCount: number;
  subcategories: Array<{
    subcategoryId: string;
    title: string;
    itemCount: number;
  }>;
};

function toTitleCase(value: string): string {
  return value
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function toSafeSummary(values: string[]): string {
  if (values.length === 0) {
    return "Not specified";
  }
  return values.join(", ");
}

function buildRankingExplanation(result: SearchResult): string {
  return `Ranked by intention trust (${result.ranking.intentionTrust}), benchmark (${result.ranking.benchmark}), certification boost (${result.ranking.certificationBoost}).`;
}

function resolveCategory(domain: string): { categoryId: string; title: string; description: string } {
  const known = CATEGORY_METADATA[domain];
  if (known) {
    return known;
  }
  const title = toTitleCase(domain);
  return {
    categoryId: domain,
    title,
    description: `${title} assistants discovered and certified in SafeClash.`,
  };
}

export function projectCertifiedItem(result: SearchResult): BrowserCertifiedItem {
  const deployReady =
    result.bestConfiguration.configId.length > 0 &&
    result.bestConfiguration.certificateId !== null &&
    result.bestConfiguration.benchmarkContractId !== null &&
    result.bestConfiguration.runtimeEnvelopeHash !== null;

  return {
    configId: result.bestConfiguration.configId,
    intentionId: result.intentionProfile.intentionProfileId,
    title: `${toTitleCase(result.intentionProfile.subdomain)} ${toTitleCase(result.intentionProfile.riskLevel)} Risk Assistant`,
    description: result.intentionProfile.summary,
    domain: result.intentionProfile.domain,
    subdomain: result.intentionProfile.subdomain,
    riskProfile: result.intentionProfile.riskLevel,
    certificationLevel: result.bestConfiguration.certificationLevel,
    rankingScore: result.rankingScore,
    benchmarkSummary: result.bestConfiguration.benchmarkContractId
      ? `Validated against ${result.bestConfiguration.benchmarkContractId}`
      : "Benchmark contract unavailable",
    benchmarkScore: result.bestConfiguration.benchmarkScore,
    model: result.bestConfiguration.model,
    capabilitiesSummary: toSafeSummary(result.bestConfiguration.capabilityConstraints),
    constraintsSummary: toSafeSummary(result.intentionProfile.constraints),
    runtimeEnvelopeHash: result.bestConfiguration.runtimeEnvelopeHash,
    certificateId: result.bestConfiguration.certificateId,
    benchmarkContractId: result.bestConfiguration.benchmarkContractId,
    publisherSummary: result.bestConfiguration.publisherSummary,
    pricingSummary: result.bestConfiguration.pricingSummary,
    deployReady,
    rankingExplanation: buildRankingExplanation(result),
  };
}

function compareFeatured(a: BrowserCertifiedItem, b: BrowserCertifiedItem): number {
  const aWeight = CERTIFICATION_WEIGHT[a.certificationLevel];
  const bWeight = CERTIFICATION_WEIGHT[b.certificationLevel];
  if (aWeight !== bWeight) {
    return bWeight - aWeight;
  }

  if (a.rankingScore !== b.rankingScore) {
    return b.rankingScore - a.rankingScore;
  }

  return a.configId.localeCompare(b.configId);
}

export function selectFeaturedCertifiedItems(items: BrowserCertifiedItem[], limit: number): BrowserCertifiedItem[] {
  const deployable = items.filter((item) => item.deployReady);
  const primary = deployable.filter(
    (item) => item.certificationLevel === "gold" || item.certificationLevel === "platinum",
  );

  const rankedPrimary = [...primary].sort(compareFeatured);
  if (rankedPrimary.length >= limit) {
    return rankedPrimary.slice(0, limit);
  }

  const selectedIds = new Set(rankedPrimary.map((item) => item.configId));
  const supplements = deployable.filter((item) => !selectedIds.has(item.configId)).sort(compareFeatured);
  return [...rankedPrimary, ...supplements].slice(0, limit);
}

export function groupCategories(certifiedItems: BrowserCertifiedItem[]): BrowserCategory[] {
  const categories = new Map<
    string,
    {
      categoryId: string;
      title: string;
      description: string;
      itemCount: number;
      subcategories: Map<string, { subcategoryId: string; title: string; itemCount: number }>;
    }
  >();

  for (const item of certifiedItems) {
    const categoryMeta = resolveCategory(item.domain);
    const existingCategory = categories.get(categoryMeta.categoryId);
    const category =
      existingCategory ??
      {
        ...categoryMeta,
        itemCount: 0,
        subcategories: new Map<string, { subcategoryId: string; title: string; itemCount: number }>(),
      };

    category.itemCount += 1;

    const existingSubcategory = category.subcategories.get(item.subdomain);
    if (existingSubcategory) {
      existingSubcategory.itemCount += 1;
    } else {
      category.subcategories.set(item.subdomain, {
        subcategoryId: item.subdomain,
        title: toTitleCase(item.subdomain),
        itemCount: 1,
      });
    }

    categories.set(categoryMeta.categoryId, category);
  }

  return [...categories.values()]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((category) => ({
      categoryId: category.categoryId,
      title: category.title,
      description: category.description,
      itemCount: category.itemCount,
      subcategories: [...category.subcategories.values()].sort((a, b) => a.title.localeCompare(b.title)),
    }));
}

function stateRank(state: EmergingIntentionState): number {
  if (state === "emerging") {
    return 0;
  }
  if (state === "certified") {
    return 1;
  }
  return 2;
}

function compareEmerging(a: BrowserEmergingItem, b: BrowserEmergingItem): number {
  const stateDiff = stateRank(a.state) - stateRank(b.state);
  if (stateDiff !== 0) {
    return stateDiff;
  }

  if (a.confidenceScore !== b.confidenceScore) {
    return b.confidenceScore - a.confidenceScore;
  }

  return a.intentionId.localeCompare(b.intentionId);
}

export function projectEmergingItems(
  profiles: EmergingIntentionProfile[],
  options: { domain?: string; subdomain?: string; state?: EmergingIntentionState } = {},
): BrowserEmergingItem[] {
  return profiles
    .filter((profile) => (options.domain ? profile.domain === options.domain : true))
    .filter((profile) => (options.subdomain ? profile.subdomain === options.subdomain : true))
    .filter((profile) => (options.state ? profile.state === options.state : true))
    .map((profile) => ({
      intentionId: profile.intentionId,
      title: `${toTitleCase(profile.subdomain)} Candidate`,
      description: profile.description,
      domain: profile.domain,
      subdomain: profile.subdomain,
      confidenceScore: profile.confidenceScore,
      sourceSummary: profile.clashdSignalSummary,
      sourceClusters: [...profile.sourceClusters],
      linkedCells: [...profile.linkedCells],
      relatedIncomingToolCount: profile.relatedIncomingToolCount,
      certifiedConfigurationExists: profile.certifiedConfigurationExists,
      state: profile.state,
    }))
    .sort(compareEmerging);
}
