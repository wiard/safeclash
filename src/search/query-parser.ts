import type { CertificationLevel } from "../registry/config-store.ts";
import type { RiskLevel } from "../registry/intention-store.ts";

export type IntentionSearchQuery = {
  domain?: string;
  subdomain?: string;
  domainPath?: string;
  riskLevel?: RiskLevel;
  constraints: string[];
  capabilities: string[];
  certificationAtLeast: CertificationLevel;
  limit: number;
  offset: number;
};

// Backward-compatible alias for ACP-oriented modules that still import ACPQuery.
export type ACPQuery = IntentionSearchQuery;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function normalizePathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function normalizeDomainPath(path: string): string | undefined {
  const normalized = path
    .trim()
    .toLowerCase()
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");

  return normalized || undefined;
}

function normalizeCapability(capability: string): string {
  return capability.trim().toLowerCase();
}

function parseRiskLevel(rawValue: string | null): RiskLevel | undefined {
  if (rawValue === "low" || rawValue === "medium" || rawValue === "high") {
    return rawValue;
  }
  return undefined;
}

function parseCertificationLevel(rawValue: string | null): CertificationLevel {
  if (
    rawValue === "none" ||
    rawValue === "bronze" ||
    rawValue === "silver" ||
    rawValue === "gold" ||
    rawValue === "platinum"
  ) {
    return rawValue;
  }
  return "silver";
}

function parsePositiveInteger(rawValue: string | null, fallback: number): number {
  if (rawValue === null) {
    return fallback;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function parseCapabilities(params: URLSearchParams): string[] {
  const combined = [params.get("capabilities"), params.get("caps"), params.get("constraints")]
    .filter((value): value is string => value !== null)
    .join(",");

  const capabilities = combined
    .split(",")
    .map(normalizeCapability)
    .filter(Boolean);

  return [...new Set(capabilities)].sort();
}

function parseDomainAndSubdomain(params: URLSearchParams): { domain?: string; subdomain?: string; domainPath?: string } {
  const rawDomain = params.get("domain");
  const rawSubdomain = params.get("subdomain");
  const rawDomainPath = params.get("domainPath");

  const domain = rawDomain ? normalizePathSegment(rawDomain) : undefined;
  const subdomain = rawSubdomain ? normalizePathSegment(rawSubdomain) : undefined;

  if (domain && subdomain) {
    return {
      domain,
      subdomain,
      domainPath: `${domain}/${subdomain}`,
    };
  }

  const domainPath = normalizeDomainPath(rawDomainPath ?? rawDomain ?? "");

  if (!domainPath) {
    return {
      domain,
      subdomain,
      domainPath: undefined,
    };
  }

  const segments = domainPath.split("/");

  return {
    domain: domain ?? segments[0],
    subdomain: subdomain ?? segments[1],
    domainPath,
  };
}

export function parseSearchQuery(input: URLSearchParams | string): IntentionSearchQuery {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  const domainInfo = parseDomainAndSubdomain(params);

  const rawRisk = params.get("risk") ?? params.get("riskLevel");
  const riskLevel = parseRiskLevel(rawRisk);

  const rawCertification = params.get("certification") ?? params.get("minCert");
  const certificationAtLeast = parseCertificationLevel(rawCertification);

  const limit = Math.min(parsePositiveInteger(params.get("limit"), DEFAULT_LIMIT), MAX_LIMIT);
  const offset = parsePositiveInteger(params.get("offset"), 0);

  return {
    domain: domainInfo.domain,
    subdomain: domainInfo.subdomain,
    domainPath: domainInfo.domainPath,
    riskLevel,
    constraints: parseCapabilities(params),
    capabilities: parseCapabilities(params),
    certificationAtLeast,
    limit,
    offset,
  };
}
