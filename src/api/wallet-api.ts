import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createSafeClashWalletStore,
  type SafeClashWalletStore
} from "../wallet/safeclash-wallet.ts";
import {
  DEFAULT_WALLET_OWNER,
  parseWalletJsonBody,
  readOptionalWalletClusterId,
  readOptionalWalletRegion,
  readOptionalWalletTimestamp,
  readWalletAmount,
  readWalletLedgerLimit,
  readWalletOperator,
  readWalletOwner,
  readWalletProposalId,
  readWalletReason,
  readWalletRequestBody,
  toWalletApiUrl,
  walletJsonResponse,
  type WalletApiResponse
} from "./wallet-api-support.ts";

const defaultWalletStore = createSafeClashWalletStore();

export async function handleWalletApiRequest(input: {
  method: string;
  urlOrPath: string;
  body?: string;
  store?: SafeClashWalletStore;
}): Promise<WalletApiResponse> {
  const url = toWalletApiUrl(input.urlOrPath);
  const method = input.method.toUpperCase();
  const store = input.store ?? defaultWalletStore;

  if (url.pathname === "/api/wallet" && method === "GET") {
    const wallet = await ensureWallet(store, url.searchParams.get("owner") ?? DEFAULT_WALLET_OWNER);
    return walletJsonResponse(200, { wallet });
  }

  if (url.pathname === "/api/wallet/ledger" && method === "GET") {
    const wallet = await ensureWallet(store, url.searchParams.get("owner") ?? DEFAULT_WALLET_OWNER);
    const limit = readWalletLedgerLimit(url.searchParams.get("limit"));
    return walletJsonResponse(200, {
      wallet_id: wallet.wallet_id,
      entries: store.listWalletLedger(wallet.wallet_id, limit)
    });
  }

  if (url.pathname === "/api/wallet/ledger/all" && method === "GET") {
    await store.loadFromDisk();
    const limit = readWalletLedgerLimit(url.searchParams.get("limit"));
    return walletJsonResponse(200, {
      entries: store.listCollectiveLedger(limit)
    });
  }

  if (url.pathname === "/api/economy/state" && method === "GET") {
    await store.loadFromDisk();
    return walletJsonResponse(200, store.getEconomyState());
  }

  if (url.pathname === "/api/wallet/credit" && method === "POST") {
    const payload = parseWalletJsonBody(input.body);
    const wallet = await ensureWallet(store, readWalletOwner(payload));
    const result = await store.creditWallet({
      wallet_id: wallet.wallet_id,
      amount: readWalletAmount(payload),
      reason: readWalletReason(payload),
      proposal_id: readWalletProposalId(payload, "wallet.credit"),
      cluster_id: readOptionalWalletClusterId(payload),
      region: readOptionalWalletRegion(payload),
      operator: readWalletOperator(payload),
      timestamp: readOptionalWalletTimestamp(payload)
    });
    return walletJsonResponse(200, result);
  }

  if (url.pathname === "/api/wallet/debit" && method === "POST") {
    const payload = parseWalletJsonBody(input.body);
    const wallet = await ensureWallet(store, readWalletOwner(payload));
    const result = await store.debitWallet({
      wallet_id: wallet.wallet_id,
      amount: readWalletAmount(payload),
      reason: readWalletReason(payload),
      proposal_id: readWalletProposalId(payload, "wallet.debit"),
      cluster_id: readOptionalWalletClusterId(payload),
      region: readOptionalWalletRegion(payload),
      operator: readWalletOperator(payload),
      timestamp: readOptionalWalletTimestamp(payload)
    });
    return walletJsonResponse(200, result);
  }

  return walletJsonResponse(404, { error: "Not Found" });
}

export async function nodeHttpWalletHandler(
  req: IncomingMessage,
  res: ServerResponse,
  store: SafeClashWalletStore = defaultWalletStore
): Promise<void> {
  try {
    const body = await readWalletRequestBody(req);
    const response = await handleWalletApiRequest({
      method: req.method ?? "GET",
      urlOrPath: req.url ?? "/api/wallet",
      body,
      store
    });
    res.statusCode = response.status;
    for (const [header, value] of Object.entries(response.headers)) {
      res.setHeader(header, value);
    }
    res.end(response.body);
  } catch (error) {
    const response = walletJsonResponse(400, {
      error: error instanceof Error ? error.message : String(error)
    });
    res.statusCode = response.status;
    for (const [header, value] of Object.entries(response.headers)) {
      res.setHeader(header, value);
    }
    res.end(response.body);
  }
}

export { defaultWalletStore };

async function ensureWallet(store: SafeClashWalletStore, owner: string) {
  await store.loadFromDisk();
  const createdAt = "2026-03-13T00:00:00.000Z";
  return store.createWallet({ owner, created_at: createdAt, balance: 0 });
}
