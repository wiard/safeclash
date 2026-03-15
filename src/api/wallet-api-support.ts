import type { IncomingMessage } from "node:http";

export type WalletApiResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export const DEFAULT_WALLET_OWNER = "safeclash-operator";

export function toWalletApiUrl(urlOrPath: string): URL {
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    return new URL(urlOrPath);
  }
  return new URL(urlOrPath, "http://localhost");
}

export function walletJsonResponse(status: number, payload: unknown): WalletApiResponse {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload, null, 2)
  };
}

export function parseWalletJsonBody(body: string | undefined): Record<string, unknown> {
  if (!body || !body.trim()) {
    return {};
  }
  const parsed = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("wallet_body_must_be_object");
  }
  return parsed as Record<string, unknown>;
}

export function readWalletOwner(payload: Record<string, unknown>): string {
  const value = typeof payload.owner === "string" ? payload.owner.trim() : DEFAULT_WALLET_OWNER;
  return value || DEFAULT_WALLET_OWNER;
}

export function readWalletAmount(payload: Record<string, unknown>): number {
  if (typeof payload.amount !== "number" || !Number.isFinite(payload.amount)) {
    throw new Error("wallet_amount_required");
  }
  return payload.amount;
}

export function readWalletReason(payload: Record<string, unknown>): string {
  if (typeof payload.reason !== "string" || !payload.reason.trim()) {
    throw new Error("wallet_reason_required");
  }
  return payload.reason.trim();
}

export function readWalletProposalId(payload: Record<string, unknown>, fallback: string): string {
  if (typeof payload.proposal_id === "string" && payload.proposal_id.trim()) {
    return payload.proposal_id.trim();
  }
  return fallback;
}

export function readWalletOperator(payload: Record<string, unknown>): string {
  if (typeof payload.operator !== "string" || !payload.operator.trim()) {
    throw new Error("wallet_operator_required");
  }
  return payload.operator.trim();
}

export function readOptionalWalletClusterId(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.cluster_id === "string" && payload.cluster_id.trim()) {
    return payload.cluster_id.trim();
  }
  return undefined;
}

export function readOptionalWalletRegion(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.region === "string" && payload.region.trim()) {
    return payload.region.trim();
  }
  return undefined;
}

export function readOptionalWalletTimestamp(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.timestamp === "string" && payload.timestamp.trim()) {
    return payload.timestamp.trim();
  }
  return undefined;
}

export function readWalletLedgerLimit(value: string | null): number {
  if (!value) {
    return 10;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return 10;
  }
  return Math.min(parsed, 50);
}

export async function readWalletRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
