import type { IncomingMessage, ServerResponse } from "node:http";
import { AIConfigurationStore } from "../registry/config-store.ts";
import {
  EmergingIntentionStore,
  type EmergingIntentionProfile,
  type EmergingIntentionState,
} from "../registry/emerging-intention-store.ts";

export type EmergingIntentionsApiResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

type EmergingQuery = {
  domain?: string;
  subdomain?: string;
  state?: EmergingIntentionState;
  limit: number;
};

type EmergingFeedItem = {
  intentionId: string;
  intentionPath: string;
  description: string;
  confidenceScore: number;
  state: EmergingIntentionState;
  sourceLineage: {
    sourceClusters: string[];
    linkedCells: string[];
    clashdSignalSummary: string;
  };
  marketSignals: {
    relatedIncomingToolCount: number;
    certifiedConfigurationExists: boolean;
  };
};

function toUrl(urlOrPath: string): URL {
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    return new URL(urlOrPath);
  }
  return new URL(urlOrPath, "http://localhost");
}

function normalizePathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function parseState(value: string | null): EmergingIntentionState | undefined {
  if (value === "emerging" || value === "certified" || value === "promoted") {
    return value;
  }
  return undefined;
}

function parseLimit(value: string | null): number {
  if (value === null) {
    return 20;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return 20;
  }
  return Math.min(parsed, 100);
}

function parseQuery(params: URLSearchParams): EmergingQuery {
  return {
    domain: params.get("domain") ? normalizePathSegment(params.get("domain") as string) : undefined,
    subdomain: params.get("subdomain") ? normalizePathSegment(params.get("subdomain") as string) : undefined,
    state: parseState(params.get("state")),
    limit: parseLimit(params.get("limit")),
  };
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

function compareFeedProfile(a: EmergingIntentionProfile, b: EmergingIntentionProfile): number {
  const stateDiff = stateRank(a.state) - stateRank(b.state);
  if (stateDiff !== 0) {
    return stateDiff;
  }

  if (a.confidenceScore !== b.confidenceScore) {
    return b.confidenceScore - a.confidenceScore;
  }

  return a.intentionId.localeCompare(b.intentionId);
}

function isMatch(profile: EmergingIntentionProfile, query: EmergingQuery): boolean {
  if (query.domain && profile.domain !== query.domain) {
    return false;
  }

  if (query.subdomain && profile.subdomain !== query.subdomain) {
    return false;
  }

  if (query.state && profile.state !== query.state) {
    return false;
  }

  return true;
}

function mapOperatorFeedItem(
  profile: EmergingIntentionProfile,
  configurationStore: AIConfigurationStore,
): EmergingFeedItem {
  const hasLinkedCertifiedConfiguration = profile.linkedIntentionProfileId
    ? configurationStore.listByIntentionProfileId(profile.linkedIntentionProfileId).some((config) => config.status === "certified")
    : false;

  return {
    intentionId: profile.intentionId,
    intentionPath: `${profile.domain}/${profile.subdomain}`,
    description: profile.description,
    confidenceScore: profile.confidenceScore,
    state: profile.state,
    sourceLineage: {
      sourceClusters: [...profile.sourceClusters],
      linkedCells: [...profile.linkedCells],
      clashdSignalSummary: profile.clashdSignalSummary,
    },
    marketSignals: {
      relatedIncomingToolCount: profile.relatedIncomingToolCount,
      certifiedConfigurationExists: profile.certifiedConfigurationExists || hasLinkedCertifiedConfiguration,
    },
  };
}

const defaultEmergingStore = new EmergingIntentionStore();
const defaultEmergingConfigurationStore = new AIConfigurationStore();

export function handleEmergingIntentionsApiRequest(
  urlOrPath: string,
  emergingStore: EmergingIntentionStore = defaultEmergingStore,
  configurationStore: AIConfigurationStore = defaultEmergingConfigurationStore,
): EmergingIntentionsApiResponse {
  const url = toUrl(urlOrPath);

  if (url.pathname !== "/api/intentions/emerging") {
    return {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Not Found" }, null, 2),
    };
  }

  const query = parseQuery(url.searchParams);
  const feedItems = emergingStore
    .listAll()
    .filter((profile) => isMatch(profile, query))
    .sort(compareFeedProfile)
    .slice(0, query.limit)
    .map((profile) => mapOperatorFeedItem(profile, configurationStore));

  return {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(
      {
        feed: {
          type: "emerging-intention-profiles",
          total: feedItems.length,
          query,
          items: feedItems,
        },
      },
      null,
      2,
    ),
  };
}

export function nodeHttpEmergingIntentionsHandler(
  req: IncomingMessage,
  res: ServerResponse,
  emergingStore: EmergingIntentionStore = defaultEmergingStore,
  configurationStore: AIConfigurationStore = defaultEmergingConfigurationStore,
): void {
  const response = handleEmergingIntentionsApiRequest(req.url ?? "/api/intentions/emerging", emergingStore, configurationStore);
  res.statusCode = response.status;
  for (const [header, value] of Object.entries(response.headers)) {
    res.setHeader(header, value);
  }
  res.end(response.body);
}

export { defaultEmergingConfigurationStore, defaultEmergingStore };
