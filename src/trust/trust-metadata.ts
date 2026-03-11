import type { CertificationLevel } from "../registry/config-store.ts";

export type TrustStatus = "trusted" | "restricted" | "revoked";
export type RegistryVisibility = "private" | "tenant" | "public";
export type CertificationSurface = "registry" | "attestation" | "receipt";

export type TrustMetadata = {
  status: TrustStatus;
  certificationLevel: CertificationLevel;
  operatorVisible: boolean;
  evidenceRef?: string | null;
  registryVisibility?: RegistryVisibility | null;
  certificationSurfaces: CertificationSurface[];
  searchableTerms: string[];
};

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

function normalizeTrustStatus(value: string): TrustStatus {
  if (value === "restricted" || value === "revoked") {
    return value;
  }
  return "trusted";
}

function normalizeRegistryVisibility(value: string | null | undefined): RegistryVisibility | null {
  if (value === "private" || value === "tenant" || value === "public") {
    return value;
  }
  return null;
}

function normalizeCertificationSurface(value: string): CertificationSurface | null {
  if (value === "registry" || value === "attestation" || value === "receipt") {
    return value;
  }
  return null;
}

function normalizeSearchTerms(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
}

export function normalizeTrustMetadata(input: TrustMetadata): TrustMetadata {
  return {
    status: normalizeTrustStatus(input.status),
    certificationLevel: normalizeCertificationLevel(input.certificationLevel),
    operatorVisible: Boolean(input.operatorVisible),
    evidenceRef: input.evidenceRef?.trim() || null,
    registryVisibility: normalizeRegistryVisibility(input.registryVisibility),
    certificationSurfaces: [
      ...new Set(
        input.certificationSurfaces
          .map(normalizeCertificationSurface)
          .filter((value): value is CertificationSurface => value !== null),
      ),
    ].sort(),
    searchableTerms: normalizeSearchTerms(input.searchableTerms),
  };
}
