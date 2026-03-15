import { createHash, createHmac } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type SafeClashCurrency = "safe";
export type SafeClashWalletOperation = "create" | "credit" | "debit";

export interface SafeClashWallet {
  wallet_id: string;
  owner: string;
  created_at: string;
  balance: number;
  currency: SafeClashCurrency;
}

export interface SafeClashWalletLedgerEntry {
  timestamp: string;
  wallet_id: string;
  operation: SafeClashWalletOperation;
  amount: number;
  reason: string;
  receipt_id: string;
  owner?: string;
  created_at?: string;
  currency?: SafeClashCurrency;
  proposal_id?: string;
  cluster_id?: string;
  region?: string;
  operator?: string;
  signature?: string;
}

export interface SafeClashReceipt {
  receipt_id: string;
  wallet_id: string;
  proposal_id: string;
  cluster_id?: string;
  region?: string;
  operator: string;
  amount: number;
  timestamp: string;
  signature: string;
}

export interface SafeClashEconomyState {
  total_spend: number;
  active_wallets: number;
  regions_supported: string[];
}

export interface SafeClashWalletStore {
  createWallet(input: { owner: string; created_at?: string; balance?: number }): Promise<SafeClashWallet>;
  getWallet(walletId: string): SafeClashWallet | null;
  getWalletBalance(walletId: string): number;
  listWalletLedger(walletId: string, limit?: number): Array<SafeClashWalletLedgerEntry & { receipt?: SafeClashReceipt }>;
  listCollectiveLedger(limit?: number): Array<SafeClashWalletLedgerEntry & { receipt?: SafeClashReceipt }>;
  debitWallet(input: {
    wallet_id: string;
    amount: number;
    reason: string;
    proposal_id: string;
    cluster_id?: string;
    region?: string;
    operator: string;
    timestamp?: string;
  }): Promise<{ wallet: SafeClashWallet; receipt: SafeClashReceipt }>;
  creditWallet(input: {
    wallet_id: string;
    amount: number;
    reason: string;
    proposal_id: string;
    cluster_id?: string;
    region?: string;
    operator: string;
    timestamp?: string;
  }): Promise<{ wallet: SafeClashWallet; receipt: SafeClashReceipt }>;
  signReceipt(input: {
    wallet_id: string;
    proposal_id: string;
    cluster_id?: string;
    region?: string;
    operator: string;
    amount: number;
    timestamp?: string;
  }): SafeClashReceipt;
  getEconomyState(): SafeClashEconomyState;
  loadFromDisk(): Promise<number>;
  getLedgerPath(): string;
}

type WalletMutationInput = {
  wallet_id: string;
  amount: number;
  reason: string;
  proposal_id: string;
  cluster_id?: string;
  region?: string;
  operator: string;
  timestamp?: string;
};

type WalletReceiptInput = {
  wallet_id: string;
  proposal_id: string;
  cluster_id?: string;
  region?: string;
  operator: string;
  amount: number;
  timestamp?: string;
};

type NormalizedWalletReceiptInput = {
  wallet_id: string;
  proposal_id: string;
  cluster_id?: string;
  region?: string;
  operator: string;
  amount: number;
  timestamp: string;
};

const DEFAULT_BASE_DIR = join(homedir(), ".safeclash");
const DEFAULT_LEDGER_PATH = join(DEFAULT_BASE_DIR, "wallet-ledger.jsonl");
const DEFAULT_SIGNING_SECRET = process.env.SAFECLASH_WALLET_SECRET || "safeclash-local-wallet-secret";

const defaultStore = createSafeClashWalletStore();

export function createSafeClashWalletStore(input: {
  ledgerPath?: string;
  signingSecret?: string;
} = {}): SafeClashWalletStore {
  const ledgerPath = input.ledgerPath ?? DEFAULT_LEDGER_PATH;
  const signingSecret = input.signingSecret ?? DEFAULT_SIGNING_SECRET;
  const wallets = new Map<string, SafeClashWallet>();
  const ledgerEntries: SafeClashWalletLedgerEntry[] = [];
  let loaded = false;

  async function ensureLoaded(): Promise<void> {
    if (loaded) {
      return;
    }
    await loadFromDisk();
  }

  async function appendLedgerEntry(entry: SafeClashWalletLedgerEntry): Promise<void> {
    await mkdir(dirname(ledgerPath), { recursive: true });
    await appendFile(ledgerPath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  function recordEntry(entry: SafeClashWalletLedgerEntry): void {
    const normalized = normalizeLedgerEntry(entry);
    ledgerEntries.push(normalized);
    const existing = wallets.get(normalized.wallet_id);
    if (!existing) {
      wallets.set(normalized.wallet_id, {
        wallet_id: normalized.wallet_id,
        owner: normalized.owner ?? "unknown",
        created_at: normalized.created_at ?? normalized.timestamp,
        balance: 0,
        currency: normalized.currency ?? "safe"
      });
    }

    const wallet = wallets.get(normalized.wallet_id);
    if (!wallet) {
      throw new Error("wallet_missing_after_record");
    }

    if (normalized.owner) {
      wallet.owner = normalized.owner;
    }
    if (normalized.created_at) {
      wallet.created_at = normalized.created_at;
    }
    if (normalized.currency) {
      wallet.currency = normalized.currency;
    }

    if (normalized.operation === "create" || normalized.operation === "credit") {
      wallet.balance = roundAmount(wallet.balance + normalized.amount);
    } else {
      wallet.balance = roundAmount(wallet.balance - normalized.amount);
    }
  }

  async function createWallet(input: { owner: string; created_at?: string; balance?: number }): Promise<SafeClashWallet> {
    await ensureLoaded();
    const owner = normalizeText(input.owner);
    if (!owner) {
      throw new Error("wallet_owner_required");
    }

    const createdAt = normalizeTimestamp(input.created_at ?? new Date().toISOString());
    const initialBalance = roundAmount(input.balance ?? 0);
    if (initialBalance < 0) {
      throw new Error("wallet_balance_must_be_non_negative");
    }

    const walletId = createHash("sha256")
      .update(`${owner}:${createdAt}`, "utf8")
      .digest("hex");

    const existing = wallets.get(walletId);
    if (existing) {
      return cloneWallet(existing);
    }

    const createReceiptId = createHash("sha256")
      .update(`${walletId}:create:${createdAt}`, "utf8")
      .digest("hex");
    const entry: SafeClashWalletLedgerEntry = {
      timestamp: createdAt,
      wallet_id: walletId,
      operation: "create",
      amount: initialBalance,
      reason: `wallet_created:${owner}`,
      receipt_id: createReceiptId,
      owner,
      created_at: createdAt,
      currency: "safe"
    };

    recordEntry(entry);
    await appendLedgerEntry(entry);
    const wallet = wallets.get(walletId);
    if (!wallet) {
      throw new Error("wallet_creation_failed");
    }
    return cloneWallet(wallet);
  }

  function getWallet(walletId: string): SafeClashWallet | null {
    const wallet = wallets.get(walletId);
    return wallet ? cloneWallet(wallet) : null;
  }

  function getWalletBalance(walletId: string): number {
    return roundAmount(wallets.get(walletId)?.balance ?? 0);
  }

  function listWalletLedger(walletId: string, limit: number = 20): Array<SafeClashWalletLedgerEntry & { receipt?: SafeClashReceipt }> {
    const normalizedWalletId = normalizeText(walletId);
    const constrainedLimit = Math.max(1, Math.min(limit, 100));
    return ledgerEntries
      .filter((entry) => entry.wallet_id === normalizedWalletId)
      .map(cloneLedgerEntry)
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, constrainedLimit)
      .map((entry) => ({
        ...entry,
        receipt: projectLedgerReceipt(entry)
      }));
  }

  function listCollectiveLedger(limit: number = 50): Array<SafeClashWalletLedgerEntry & { receipt?: SafeClashReceipt }> {
    const constrainedLimit = Math.max(1, Math.min(limit, 500));
    return ledgerEntries
      .map(cloneLedgerEntry)
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, constrainedLimit)
      .map((entry) => ({
        ...entry,
        receipt: projectLedgerReceipt(entry)
      }));
  }

  function signReceipt(input: WalletReceiptInput): SafeClashReceipt {
    const normalized = normalizeWalletReceiptInput(input);
    const receiptPayload = buildWalletReceiptPayload(normalized);
    const receiptId = createHash("sha256")
      .update(JSON.stringify(receiptPayload), "utf8")
      .digest("hex");
    const signature = createHmac("sha256", signingSecret)
      .update(
        `${receiptId}:${normalized.wallet_id}:${normalized.proposal_id}:${normalized.cluster_id ?? ""}:${normalized.region ?? ""}:${normalized.operator}:${normalized.amount}:${normalized.timestamp}`,
        "utf8",
      )
      .digest("hex");

    return {
      receipt_id: receiptId,
      ...receiptPayload,
      signature
    };
  }

  async function applyWalletMutation(
    operation: "credit" | "debit",
    input: WalletMutationInput
  ): Promise<{ wallet: SafeClashWallet; receipt: SafeClashReceipt }> {
    await ensureLoaded();
    const wallet = wallets.get(normalizeText(input.wallet_id));
    if (!wallet) {
      throw new Error("wallet_not_found");
    }

    const amount = validatePositiveAmount(input.amount);
    if (operation === "debit" && wallet.balance < amount) {
      throw new Error("insufficient_wallet_balance");
    }

    const timestamp = normalizeTimestamp(input.timestamp ?? new Date().toISOString());
    const receipt = signReceipt({
      wallet_id: wallet.wallet_id,
      proposal_id: input.proposal_id,
      cluster_id: input.cluster_id,
      region: input.region,
      operator: input.operator,
      amount,
      timestamp
    });
    const entry: SafeClashWalletLedgerEntry = {
      timestamp,
      wallet_id: wallet.wallet_id,
      operation,
      amount,
      reason: normalizeReason(input.reason),
      receipt_id: receipt.receipt_id,
      proposal_id: input.proposal_id,
      cluster_id: normalizeOptionalText(input.cluster_id),
      region: normalizeOptionalText(input.region),
      operator: input.operator,
      signature: receipt.signature
    };

    recordEntry(entry);
    await appendLedgerEntry(entry);
    return {
      wallet: cloneWallet(wallet),
      receipt
    };
  }

  async function creditWallet(input: WalletMutationInput): Promise<{ wallet: SafeClashWallet; receipt: SafeClashReceipt }> {
    return applyWalletMutation("credit", input);
  }

  async function debitWallet(input: WalletMutationInput): Promise<{ wallet: SafeClashWallet; receipt: SafeClashReceipt }> {
    return applyWalletMutation("debit", input);
  }

  function getEconomyState(): SafeClashEconomyState {
    const activeWallets = new Set<string>();
    const regions = new Set<string>();
    let totalSpend = 0;

    for (const entry of ledgerEntries) {
      if (entry.operation !== "debit") {
        continue;
      }
      totalSpend = roundAmount(totalSpend + entry.amount);
      activeWallets.add(entry.wallet_id);
      if (entry.region) {
        regions.add(entry.region);
      }
    }

    return {
      total_spend: totalSpend,
      active_wallets: activeWallets.size,
      regions_supported: Array.from(regions).sort((left, right) => left.localeCompare(right))
    };
  }

  async function loadFromDisk(): Promise<number> {
    let loadedCount = 0;
    wallets.clear();
    ledgerEntries.length = 0;
    try {
      const raw = await readFile(ledgerPath, "utf8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        try {
          const parsed = JSON.parse(line) as SafeClashWalletLedgerEntry;
          recordEntry(parsed);
          loadedCount += 1;
        } catch {
          // Skip malformed lines to preserve append-only reads.
        }
      }
    } catch {
      loaded = true;
      return 0;
    }

    loaded = true;
    return loadedCount;
  }

  return {
    createWallet,
    getWallet,
    getWalletBalance,
    listWalletLedger,
    listCollectiveLedger,
    debitWallet,
    creditWallet,
    signReceipt,
    getEconomyState,
    loadFromDisk,
    getLedgerPath(): string {
      return ledgerPath;
    }
  };
}

export async function createWallet(input: { owner: string; created_at?: string; balance?: number }): Promise<SafeClashWallet> {
  return defaultStore.createWallet(input);
}

export function getWallet(walletId: string): SafeClashWallet | null {
  return defaultStore.getWallet(walletId);
}

export function getWalletBalance(walletId: string): number {
  return defaultStore.getWalletBalance(walletId);
}

export function listWalletLedger(
  walletId: string,
  limit?: number
): Array<SafeClashWalletLedgerEntry & { receipt?: SafeClashReceipt }> {
  return defaultStore.listWalletLedger(walletId, limit);
}

export function listCollectiveWalletLedger(
  limit?: number
): Array<SafeClashWalletLedgerEntry & { receipt?: SafeClashReceipt }> {
  return defaultStore.listCollectiveLedger(limit);
}

export async function creditWallet(input: {
  wallet_id: string;
  amount: number;
  reason: string;
  proposal_id: string;
  cluster_id?: string;
  region?: string;
  operator: string;
  timestamp?: string;
}): Promise<{ wallet: SafeClashWallet; receipt: SafeClashReceipt }> {
  return defaultStore.creditWallet(input);
}

export async function debitWallet(input: {
  wallet_id: string;
  amount: number;
  reason: string;
  proposal_id: string;
  cluster_id?: string;
  region?: string;
  operator: string;
  timestamp?: string;
}): Promise<{ wallet: SafeClashWallet; receipt: SafeClashReceipt }> {
  return defaultStore.debitWallet(input);
}

export function signReceipt(input: {
  wallet_id: string;
  proposal_id: string;
  cluster_id?: string;
  region?: string;
  operator: string;
  amount: number;
  timestamp?: string;
}): SafeClashReceipt {
  return defaultStore.signReceipt(input);
}

export function getEconomyState(): SafeClashEconomyState {
  return defaultStore.getEconomyState();
}

export async function loadWalletLedgerFromDisk(): Promise<number> {
  return defaultStore.loadFromDisk();
}

export function getWalletLedgerPath(): string {
  return defaultStore.getLedgerPath();
}

function normalizeLedgerEntry(entry: SafeClashWalletLedgerEntry): SafeClashWalletLedgerEntry {
  const timestamp = normalizeTimestamp(entry.timestamp);
  const walletId = normalizeText(entry.wallet_id);
  const reason = normalizeReason(entry.reason);
  const receiptId = normalizeText(entry.receipt_id);
  const amount = roundAmount(entry.amount);
  const operation = entry.operation;

  if (!walletId || !reason || !receiptId) {
    throw new Error("invalid_wallet_ledger_entry");
  }
  if (operation !== "create" && operation !== "credit" && operation !== "debit") {
    throw new Error("invalid_wallet_operation");
  }
  if (amount < 0) {
    throw new Error("wallet_amount_must_be_non_negative");
  }

  return {
    timestamp,
    wallet_id: walletId,
    operation,
    amount,
    reason,
    receipt_id: receiptId,
    owner: normalizeOptionalText(entry.owner),
    created_at: normalizeOptionalText(entry.created_at),
    currency: entry.currency === "safe" ? "safe" : undefined,
    proposal_id: normalizeOptionalText(entry.proposal_id),
    cluster_id: normalizeOptionalText(entry.cluster_id),
    region: normalizeOptionalText(entry.region),
    operator: normalizeOptionalText(entry.operator),
    signature: normalizeOptionalText(entry.signature)
  };
}

function projectLedgerReceipt(entry: SafeClashWalletLedgerEntry): SafeClashReceipt | undefined {
  if (!entry.proposal_id || !entry.operator || !entry.signature) {
    return undefined;
  }

  return {
    receipt_id: entry.receipt_id,
    wallet_id: entry.wallet_id,
    proposal_id: entry.proposal_id,
    ...(entry.cluster_id ? { cluster_id: entry.cluster_id } : {}),
    ...(entry.region ? { region: entry.region } : {}),
    operator: entry.operator,
    amount: entry.amount,
    timestamp: entry.timestamp,
    signature: entry.signature
  };
}

function normalizeWalletReceiptInput(input: WalletReceiptInput): NormalizedWalletReceiptInput {
  const normalized: NormalizedWalletReceiptInput = {
    wallet_id: normalizeText(input.wallet_id),
    proposal_id: normalizeText(input.proposal_id),
    cluster_id: normalizeOptionalText(input.cluster_id),
    region: normalizeOptionalText(input.region),
    operator: normalizeText(input.operator),
    amount: roundAmount(input.amount),
    timestamp: normalizeTimestamp(input.timestamp ?? new Date().toISOString())
  };

  if (!normalized.wallet_id || !normalized.proposal_id || !normalized.operator) {
    throw new Error("receipt_fields_required");
  }

  return normalized;
}

function buildWalletReceiptPayload(input: NormalizedWalletReceiptInput): Omit<SafeClashReceipt, "receipt_id" | "signature"> {
  return {
    wallet_id: input.wallet_id,
    proposal_id: input.proposal_id,
    ...(input.cluster_id ? { cluster_id: input.cluster_id } : {}),
    ...(input.region ? { region: input.region } : {}),
    operator: input.operator,
    amount: input.amount,
    timestamp: input.timestamp
  };
}

function validatePositiveAmount(amount: number): number {
  const normalized = roundAmount(amount);
  if (!(normalized > 0)) {
    throw new Error("wallet_amount_must_be_positive");
  }
  return normalized;
}

function roundAmount(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new Error("wallet_amount_must_be_finite");
  }
  return Number(amount.toFixed(2));
}

function cloneWallet(wallet: SafeClashWallet): SafeClashWallet {
  return {
    wallet_id: wallet.wallet_id,
    owner: wallet.owner,
    created_at: wallet.created_at,
    balance: wallet.balance,
    currency: wallet.currency
  };
}

function cloneLedgerEntry(entry: SafeClashWalletLedgerEntry): SafeClashWalletLedgerEntry {
  return {
    timestamp: entry.timestamp,
    wallet_id: entry.wallet_id,
    operation: entry.operation,
    amount: entry.amount,
    reason: entry.reason,
    receipt_id: entry.receipt_id,
    owner: entry.owner,
    created_at: entry.created_at,
    currency: entry.currency,
    proposal_id: entry.proposal_id,
    cluster_id: entry.cluster_id,
    region: entry.region,
    operator: entry.operator,
    signature: entry.signature
  };
}

function normalizeText(value: string): string {
  return value.trim();
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeReason(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("wallet_reason_required");
  }
  return normalized;
}

function normalizeTimestamp(value: string): string {
  const normalized = value.trim();
  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error("wallet_timestamp_invalid");
  }
  return normalized;
}
