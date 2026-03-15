import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createSafeClashWalletStore } from "../src/wallet/safeclash-wallet.ts";

function createHarness() {
  const dir = mkdtempSync(join(tmpdir(), "safeclash-wallet-"));
  return {
    dir,
    ledgerPath: join(dir, "wallet-ledger.jsonl"),
    store: createSafeClashWalletStore({
      ledgerPath: join(dir, "wallet-ledger.jsonl"),
      signingSecret: "test-safeclash-secret"
    })
  };
}

test("createWallet creates a safe wallet and appends a create entry", async () => {
  const harness = createHarness();
  try {
    const wallet = await harness.store.createWallet({
      owner: "operator-001",
      created_at: "2026-03-13T10:00:00.000Z"
    });

    assert.equal(wallet.owner, "operator-001");
    assert.equal(wallet.currency, "safe");
    assert.equal(wallet.balance, 0);

    const rows = readJsonLines(harness.ledgerPath);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].operation, "create");
    assert.equal(rows[0].wallet_id, wallet.wallet_id);
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("creditWallet increases balance and writes a signed receipt-linked ledger entry", async () => {
  const harness = createHarness();
  try {
    const wallet = await harness.store.createWallet({
      owner: "operator-001",
      created_at: "2026-03-13T10:00:00.000Z"
    });

    const result = await harness.store.creditWallet({
      wallet_id: wallet.wallet_id,
      amount: 25,
      reason: "initial funding",
      proposal_id: "proposal-credit-001",
      cluster_id: "cluster-001",
      region: "nl-ijmuiden",
      operator: "jeeves",
      timestamp: "2026-03-13T10:05:00.000Z"
    });

    assert.equal(result.wallet.balance, 25);
    assert.equal(harness.store.getWalletBalance(wallet.wallet_id), 25);
    assert.ok(result.receipt.signature.length > 0);
    assert.equal(result.receipt.cluster_id, "cluster-001");
    assert.equal(result.receipt.region, "nl-ijmuiden");

    const rows = readJsonLines(harness.ledgerPath);
    assert.equal(rows.length, 2);
    assert.equal(rows[1].operation, "credit");
    assert.equal(rows[1].receipt_id, result.receipt.receipt_id);
    assert.equal(rows[1].cluster_id, "cluster-001");
    assert.equal(rows[1].region, "nl-ijmuiden");
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("debitWallet decreases balance and returns a deterministic signed receipt", async () => {
  const harness = createHarness();
  try {
    const wallet = await harness.store.createWallet({
      owner: "operator-001",
      created_at: "2026-03-13T10:00:00.000Z",
      balance: 40
    });

    const debit = await harness.store.debitWallet({
      wallet_id: wallet.wallet_id,
      amount: 15,
      reason: "operator approved bounded action",
      proposal_id: "proposal-debit-001",
      cluster_id: "cluster-007",
      region: "kenya-west",
      operator: "jeeves",
      timestamp: "2026-03-13T10:06:00.000Z"
    });

    const repeatedReceipt = harness.store.signReceipt({
      wallet_id: wallet.wallet_id,
      proposal_id: "proposal-debit-001",
      cluster_id: "cluster-007",
      region: "kenya-west",
      operator: "jeeves",
      amount: 15,
      timestamp: "2026-03-13T10:06:00.000Z"
    });

    assert.equal(debit.wallet.balance, 25);
    assert.equal(harness.store.getWalletBalance(wallet.wallet_id), 25);
    assert.equal(debit.receipt.receipt_id, repeatedReceipt.receipt_id);
    assert.equal(debit.receipt.signature, repeatedReceipt.signature);
    assert.equal(debit.receipt.cluster_id, "cluster-007");
    assert.equal(debit.receipt.region, "kenya-west");
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("getEconomyState reports spend, active wallets, and supported regions from debits", async () => {
  const harness = createHarness();
  try {
    const walletA = await harness.store.createWallet({
      owner: "operator-001",
      created_at: "2026-03-13T10:00:00.000Z",
      balance: 50
    });
    const walletB = await harness.store.createWallet({
      owner: "operator-002",
      created_at: "2026-03-13T10:01:00.000Z",
      balance: 40
    });

    await harness.store.debitWallet({
      wallet_id: walletA.wallet_id,
      amount: 12.5,
      reason: "approved action a",
      proposal_id: "proposal-a",
      cluster_id: "cluster-a",
      region: "nl-ijmuiden",
      operator: "jeeves",
      timestamp: "2026-03-13T10:05:00.000Z"
    });
    await harness.store.debitWallet({
      wallet_id: walletB.wallet_id,
      amount: 7.5,
      reason: "approved action b",
      proposal_id: "proposal-b",
      cluster_id: "cluster-b",
      region: "kenya-west",
      operator: "jeeves",
      timestamp: "2026-03-13T10:06:00.000Z"
    });
    await harness.store.creditWallet({
      wallet_id: walletA.wallet_id,
      amount: 5,
      reason: "funding",
      proposal_id: "proposal-credit",
      operator: "jeeves",
      timestamp: "2026-03-13T10:07:00.000Z"
    });

    assert.deepEqual(harness.store.getEconomyState(), {
      total_spend: 20,
      active_wallets: 2,
      regions_supported: ["kenya-west", "nl-ijmuiden"]
    });
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("loadFromDisk reconstructs wallet balance from the append-only ledger", async () => {
  const harness = createHarness();
  try {
    const wallet = await harness.store.createWallet({
      owner: "operator-001",
      created_at: "2026-03-13T10:00:00.000Z"
    });

    await harness.store.creditWallet({
      wallet_id: wallet.wallet_id,
      amount: 30,
      reason: "credit test",
      proposal_id: "proposal-credit-001",
      operator: "jeeves",
      timestamp: "2026-03-13T10:01:00.000Z"
    });

    await harness.store.debitWallet({
      wallet_id: wallet.wallet_id,
      amount: 12.5,
      reason: "debit test",
      proposal_id: "proposal-debit-001",
      operator: "jeeves",
      timestamp: "2026-03-13T10:02:00.000Z"
    });

    const reloadedStore = createSafeClashWalletStore({
      ledgerPath: harness.ledgerPath,
      signingSecret: "test-safeclash-secret"
    });
    const loadedCount = await reloadedStore.loadFromDisk();

    assert.equal(loadedCount, 3);
    assert.equal(reloadedStore.getWalletBalance(wallet.wallet_id), 17.5);
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("listWalletLedger returns recent receipt-backed entries in descending timestamp order", async () => {
  const harness = createHarness();
  try {
    const wallet = await harness.store.createWallet({
      owner: "operator-001",
      created_at: "2026-03-13T10:00:00.000Z"
    });

    await harness.store.creditWallet({
      wallet_id: wallet.wallet_id,
      amount: 30,
      reason: "credit test",
      proposal_id: "proposal-credit-001",
      operator: "jeeves",
      timestamp: "2026-03-13T10:01:00.000Z"
    });

    await harness.store.debitWallet({
      wallet_id: wallet.wallet_id,
      amount: 12.5,
      reason: "debit test",
      proposal_id: "proposal-debit-001",
      operator: "jeeves",
      timestamp: "2026-03-13T10:02:00.000Z"
    });

    const entries = harness.store.listWalletLedger(wallet.wallet_id, 2);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].operation, "debit");
    assert.equal(entries[0].receipt?.proposal_id, "proposal-debit-001");
    assert.equal(entries[1].operation, "credit");
    assert.equal(entries[1].receipt?.proposal_id, "proposal-credit-001");
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("listCollectiveLedger returns recent receipt-backed entries across wallets", async () => {
  const harness = createHarness();
  try {
    const walletA = await harness.store.createWallet({
      owner: "operator-001",
      created_at: "2026-03-13T10:00:00.000Z"
    });
    const walletB = await harness.store.createWallet({
      owner: "operator-002",
      created_at: "2026-03-13T10:01:00.000Z"
    });

    await harness.store.creditWallet({
      wallet_id: walletA.wallet_id,
      amount: 20,
      reason: "funding a",
      proposal_id: "proposal-credit-a",
      operator: "jeeves",
      timestamp: "2026-03-13T10:02:00.000Z"
    });
    await harness.store.creditWallet({
      wallet_id: walletB.wallet_id,
      amount: 12,
      reason: "funding b",
      proposal_id: "proposal-credit-b",
      operator: "jeeves",
      timestamp: "2026-03-13T10:02:30.000Z"
    });
    await harness.store.debitWallet({
      wallet_id: walletB.wallet_id,
      amount: 7,
      reason: "approved action b",
      proposal_id: "proposal-debit-b",
      cluster_id: "cluster-b",
      region: "kenya-west",
      operator: "jeeves",
      timestamp: "2026-03-13T10:03:00.000Z"
    });

    const entries = harness.store.listCollectiveLedger(3);
    assert.equal(entries.length, 3);
    assert.equal(entries[0].proposal_id, "proposal-debit-b");
    assert.equal(entries[0].receipt?.proposal_id, "proposal-debit-b");
    assert.equal(entries[1].proposal_id, "proposal-credit-b");
    assert.equal(entries[2].proposal_id, "proposal-credit-a");
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

function readJsonLines(path: string): Array<Record<string, unknown>> {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
