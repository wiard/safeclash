import { type ACP, isCertificationAtLeast } from "../registry/acp-store.ts";
import type { ACPQuery } from "./query-parser.ts";

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

function includesAllCapabilities(candidate: ACP, required: string[]): boolean {
  if (required.length === 0) {
    return true;
  }
  const capabilitySet = new Set(candidate.capabilities);
  return required.every((capability) => capabilitySet.has(capability));
}

function isDomainMatch(candidateDomainPath: string, requestedDomainPath?: string): boolean {
  if (!requestedDomainPath) {
    return true;
  }

  if (candidateDomainPath === requestedDomainPath) {
    return true;
  }

  return candidateDomainPath.startsWith(`${requestedDomainPath}/`);
}

export class ACPIndex {
  private all: ACP[];

  constructor(acps: ACP[] = []) {
    this.all = [];
    this.rebuild(acps);
  }

  rebuild(acps: ACP[]): void {
    this.all = acps.map(cloneACP).sort(compareACPIdentity);
  }

  query(query: ACPQuery): ACP[] {
    return this.all
      .filter((acp) => isDomainMatch(acp.domainPath, query.domainPath))
      .filter((acp) => (query.riskLevel ? acp.riskLevel === query.riskLevel : true))
      .filter((acp) => includesAllCapabilities(acp, query.capabilities))
      .filter((acp) => isCertificationAtLeast(acp.certificationLevel, query.certificationAtLeast))
      .map(cloneACP);
  }
}
