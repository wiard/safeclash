import type { IncomingMessage, ServerResponse } from "node:http";
import { AIConfigurationStore } from "../registry/config-store.ts";
import { IntentionStore } from "../registry/intention-store.ts";
import { SafeClashSearchEngine } from "../search/search-engine.ts";

export type ApiResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

const defaultIntentionStore = new IntentionStore();
const defaultConfigurationStore = new AIConfigurationStore();
const defaultEngine = new SafeClashSearchEngine(defaultIntentionStore, defaultConfigurationStore);

function toUrl(urlOrPath: string): URL {
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    return new URL(urlOrPath);
  }
  return new URL(urlOrPath, "http://localhost");
}

export function handleSearchApiRequest(
  urlOrPath: string,
  engine: SafeClashSearchEngine = defaultEngine,
): ApiResponse {
  const url = toUrl(urlOrPath);

  if (url.pathname !== "/api/search") {
    return {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Not Found" }, null, 2),
    };
  }

  const result = engine.search(url.searchParams);

  return {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(result, null, 2),
  };
}

export function nodeHttpSearchHandler(
  req: IncomingMessage,
  res: ServerResponse,
  engine: SafeClashSearchEngine = defaultEngine,
): void {
  const response = handleSearchApiRequest(req.url ?? "/api/search", engine);
  res.statusCode = response.status;
  for (const [name, value] of Object.entries(response.headers)) {
    res.setHeader(name, value);
  }
  res.end(response.body);
}

export { defaultConfigurationStore, defaultEngine, defaultIntentionStore };
