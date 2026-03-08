import type { IncomingMessage, ServerResponse } from "node:http";
import { AIConfigurationStore } from "../registry/config-store.ts";
import { EmergingIntentionStore, type EmergingIntentionState } from "../registry/emerging-intention-store.ts";
import { IntentionStore } from "../registry/intention-store.ts";
import { SafeClashSearchEngine } from "../search/search-engine.ts";
import {
  groupCategories,
  projectCertifiedItem,
  projectEmergingItems,
  selectFeaturedCertifiedItems,
} from "../browser/browser-projection.ts";

export type BrowserApiResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

type BrowserQuery = {
  domain?: string;
  subdomain?: string;
  state?: EmergingIntentionState;
  limitCertified: number;
  limitEmerging: number;
  limitFeatured: number;
};

const FEATURED_RULE = "Deploy-ready gold/platinum first, then highest-ranked deploy-ready certified items.";

const defaultIntentionStore = new IntentionStore();
const defaultConfigurationStore = new AIConfigurationStore();
const defaultEmergingStore = new EmergingIntentionStore();
const defaultSearchEngine = new SafeClashSearchEngine(defaultIntentionStore, defaultConfigurationStore);

function toUrl(urlOrPath: string): URL {
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    return new URL(urlOrPath);
  }
  return new URL(urlOrPath, "http://localhost");
}

function normalizePathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function parsePositiveInt(raw: string | null, fallback: number, max: number): number {
  if (raw === null) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function parseState(raw: string | null): EmergingIntentionState | undefined {
  if (raw === "emerging" || raw === "certified" || raw === "promoted") {
    return raw;
  }
  return undefined;
}

function parseBrowserQuery(params: URLSearchParams): BrowserQuery {
  return {
    domain: params.get("domain") ? normalizePathSegment(params.get("domain") as string) : undefined,
    subdomain: params.get("subdomain") ? normalizePathSegment(params.get("subdomain") as string) : undefined,
    state: parseState(params.get("state")),
    limitCertified: parsePositiveInt(params.get("limitCertified") ?? params.get("limit"), 24, 100),
    limitEmerging: parsePositiveInt(params.get("limitEmerging"), 12, 100),
    limitFeatured: parsePositiveInt(params.get("limitFeatured"), 6, 24),
  };
}

function buildBrowserHomePayload(query: BrowserQuery): Record<string, unknown> {
  const certifiedBase = defaultSearchEngine.search("limit=100");
  const certifiedItems = certifiedBase.results.map(projectCertifiedItem);
  const featuredItems = selectFeaturedCertifiedItems(certifiedItems, query.limitFeatured);
  const categories = groupCategories(certifiedItems);

  const emergingItems = projectEmergingItems(defaultEmergingStore.listAll(), {
    domain: query.domain,
    subdomain: query.subdomain,
    state: query.state,
  });

  return {
    browser: {
      featured: {
        rule: FEATURED_RULE,
        items: featuredItems,
      },
      categories,
      certified: {
        total: certifiedItems.length,
        items: certifiedItems.slice(0, query.limitCertified),
      },
      emerging: {
        total: emergingItems.length,
        items: emergingItems.slice(0, query.limitEmerging),
      },
    },
  };
}

function buildBrowserSearchPayload(url: URL, query: BrowserQuery): Record<string, unknown> {
  const certifiedResponse = defaultSearchEngine.search(url.searchParams);
  const certifiedItems = certifiedResponse.results.map(projectCertifiedItem);
  const featuredItems = selectFeaturedCertifiedItems(certifiedItems, query.limitFeatured);
  const categories = groupCategories(certifiedItems);

  const emergingItems = projectEmergingItems(defaultEmergingStore.listAll(), {
    domain: query.domain,
    subdomain: query.subdomain,
    state: query.state,
  });

  return {
    browserSearch: {
      query: certifiedResponse.query,
      featured: {
        rule: FEATURED_RULE,
        items: featuredItems,
      },
      categories,
      certified: {
        total: certifiedResponse.total,
        items: certifiedItems,
      },
      emerging: {
        total: emergingItems.length,
        items: emergingItems.slice(0, query.limitEmerging),
      },
    },
  };
}

export function handleBrowserHomeApiRequest(urlOrPath: string): BrowserApiResponse {
  const url = toUrl(urlOrPath);
  if (url.pathname !== "/api/browser/home") {
    return {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Not Found" }, null, 2),
    };
  }

  const payload = buildBrowserHomePayload(parseBrowserQuery(url.searchParams));
  return {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload, null, 2),
  };
}

export function handleBrowserSearchApiRequest(urlOrPath: string): BrowserApiResponse {
  const url = toUrl(urlOrPath);
  if (url.pathname !== "/api/browser/search") {
    return {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Not Found" }, null, 2),
    };
  }

  const query = parseBrowserQuery(url.searchParams);
  const payload = buildBrowserSearchPayload(url, query);
  return {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload, null, 2),
  };
}

export function nodeHttpBrowserApiHandler(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? "/api/browser/home";
  const route = toUrl(url).pathname;
  const response = route === "/api/browser/search" ? handleBrowserSearchApiRequest(url) : handleBrowserHomeApiRequest(url);

  res.statusCode = response.status;
  for (const [name, value] of Object.entries(response.headers)) {
    res.setHeader(name, value);
  }
  res.end(response.body);
}
