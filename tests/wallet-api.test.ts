import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { handleWalletApiRequest } from "../src/api/wallet-api.ts";
import { createSafeClashWalletStore } from "../src/wallet/safeclash-wallet.ts";

function createHarness() {
  const dir = mkdtempSync(join(tmpdir(), "safeclash-wallet-api-"));
  return {
    dir,
    store: createSafeClashWalletStore({
      ledgerPath: join(dir, "wallet-ledger.jsonl"),
      signingSecret: "test-safeclash-secret"
    })
  };
}

test("GET /api/wallet returns a created wallet", async () => {
  const harness = createHarness();
  try {
    const response = await handleWalletApiRequest({
      method: "GET",
      urlOrPath: "/api/wallet?owner=operator-001",
      store: harness.store
    });

    const payload = JSON.parse(response.body);
    assert.equal(response.status, 200);
    assert.equal(payload.wallet.owner, "operator-001");
    assert.equal(payload.wallet.currency, "safe");
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("POST /api/wallet/credit credits the wallet and returns a receipt", async () => {
  const harness = createHarness();
  try {
    const response = await handleWalletApiRequest({
      method: "POST",
      urlOrPath: "/api/wallet/credit",
      body: JSON.stringify({
        owner: "operator-001",
        amount: 20,
        reason: "manual funding",
        proposal_id: "proposal-credit-001",
        cluster_id: "cluster-credit-001",
        region: "nl-ijmuiden",
        operator: "jeeves",
        timestamp: "2026-03-13T12:00:00.000Z"
      }),
      store: harness.store
    });

    const payload = JSON.parse(response.body);
    assert.equal(response.status, 200);
    assert.equal(payload.wallet.balance, 20);
    assert.equal(payload.receipt.proposal_id, "proposal-credit-001");
    assert.equal(payload.receipt.cluster_id, "cluster-credit-001");
    assert.equal(payload.receipt.region, "nl-ijmuiden");
    assert.ok(payload.receipt.signature);
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("POST /api/wallet/debit debits the wallet and returns a receipt", async () => {
  const harness = createHarness();
  try {
    await handleWalletApiRequest({
      method: "POST",
      urlOrPath: "/api/wallet/credit",
      body: JSON.stringify({
        owner: "operator-001",
        amount: 30,
        reason: "manual funding",
        proposal_id: "proposal-credit-001",
        operator: "jeeves",
        timestamp: "2026-03-13T12:00:00.000Z"
      }),
      store: harness.store
    });

    const response = await handleWalletApiRequest({
      method: "POST",
      urlOrPath: "/api/wallet/debit",
      body: JSON.stringify({
        owner: "operator-001",
        amount: 12,
        reason: "approved runtime action",
        proposal_id: "proposal-debit-001",
        cluster_id: "cluster-debit-001",
        region: "kenya-west",
        operator: "jeeves",
        timestamp: "2026-03-13T12:05:00.000Z"
      }),
      store: harness.store
    });

    const payload = JSON.parse(response.body);
    assert.equal(response.status, 200);
    assert.equal(payload.wallet.balance, 18);
    assert.equal(payload.receipt.proposal_id, "proposal-debit-001");
    assert.equal(payload.receipt.cluster_id, "cluster-debit-001");
    assert.equal(payload.receipt.region, "kenya-west");
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("GET /api/wallet/ledger returns recent wallet ledger entries with receipt metadata", async () => {
  const harness = createHarness();
  try {
    await handleWalletApiRequest({
      method: "POST",
      urlOrPath: "/api/wallet/credit",
      body: JSON.stringify({
        owner: "operator-001",
        amount: 30,
        reason: "manual funding",
        proposal_id: "proposal-credit-001",
        operator: "jeeves",
        timestamp: "2026-03-13T12:00:00.000Z"
      }),
      store: harness.store
    });

    await handleWalletApiRequest({
      method: "POST",
      urlOrPath: "/api/wallet/debit",
      body: JSON.stringify({
        owner: "operator-001",
        amount: 12,
        reason: "approved runtime action",
        proposal_id: "proposal-debit-001",
        cluster_id: "cluster-debit-001",
        region: "kenya-west",
        operator: "jeeves",
        timestamp: "2026-03-13T12:05:00.000Z"
      }),
      store: harness.store
    });

    const response = await handleWalletApiRequest({
      method: "GET",
      urlOrPath: "/api/wallet/ledger?owner=operator-001&limit=2",
      store: harness.store
    });

    const payload = JSON.parse(response.body);
    assert.equal(response.status, 200);
    assert.equal(payload.entries.length, 2);
    assert.equal(payload.entries[0].receipt.proposal_id, "proposal-debit-001");
    assert.equal(payload.entries[0].receipt.cluster_id, "cluster-debit-001");
    assert.equal(payload.entries[0].receipt.region, "kenya-west");
    assert.equal(payload.entries[1].receipt.proposal_id, "proposal-credit-001");
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("GET /api/economy/state reports minimal continuity monitoring", async () => {
  const harness = createHarness();
  try {
    await handleWalletApiRequest({
      method: "POST",
      urlOrPath: "/api/wallet/credit",
      body: JSON.stringify({
        owner: "operator-001",
        amount: 30,
        reason: "manual funding",
        proposal_id: "proposal-credit-001",
        operator: "jeeves",
        timestamp: "2026-03-13T12:00:00.000Z"
      }),
      store: harness.store
    });

    await handleWalletApiRequest({
      method: "POST",
      urlOrPath: "/api/wallet/debit",
      body: JSON.stringify({
        owner: "operator-001",
        amount: 12,
        reason: "approved runtime action",
        proposal_id: "proposal-debit-001",
        cluster_id: "cluster-debit-001",
        region: "kenya-west",
        operator: "jeeves",
        timestamp: "2026-03-13T12:05:00.000Z"
      }),
      store: harness.store
    });

    const response = await handleWalletApiRequest({
      method: "GET",
      urlOrPath: "/api/economy/state",
      store: harness.store
    });

    const payload = JSON.parse(response.body);
    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      total_spend: 12,
      active_wallets: 1,
      regions_supported: ["kenya-west"]
    });
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("GET /api/wallet/ledger/all returns recent ledger entries across wallets", async () => {
  const harness = createHarness();
  try {
    await handleWalletApiRequest({
      method: "POST",
      urlOrPath: "/api/wallet/credit",
      body: JSON.stringify({
        owner: "operator-001",
        amount: 15,
        reason: "manual funding",
        proposal_id: "proposal-credit-001",
        operator: "jeeves",
        timestamp: "2026-03-13T12:00:00.000Z"
      }),
      store: harness.store
    });

    await handleWalletApiRequest({
      method: "POST",
      urlOrPath: "/api/wallet/debit",
      body: JSON.stringify({
        owner: "operator-002",
        amount: 6,
        reason: "approved runtime action",
        proposal_id: "proposal-debit-002",
        cluster_id: "cluster-debit-002",
        region: "nl-ijmuiden",
        operator: "jeeves",
        timestamp: "2026-03-13T12:06:00.000Z"
      }),
      store: harness.store
    }).catch(() => undefined);

    await handleWalletApiRequest({
      method: "POST",
      urlOrPath: "/api/wallet/credit",
      body: JSON.stringify({
        owner: "operator-002",
        amount: 12,
        reason: "manual funding",
        proposal_id: "proposal-credit-002",
        operator: "jeeves",
        timestamp: "2026-03-13T12:05:00.000Z"
      }),
      store: harness.store
    });

    await handleWalletApiRequest({
      method: "POST",
      urlOrPath: "/api/wallet/debit",
      body: JSON.stringify({
        owner: "operator-002",
        amount: 6,
        reason: "approved runtime action",
        proposal_id: "proposal-debit-002",
        cluster_id: "cluster-debit-002",
        region: "nl-ijmuiden",
        operator: "jeeves",
        timestamp: "2026-03-13T12:06:00.000Z"
      }),
      store: harness.store
    });

    const response = await handleWalletApiRequest({
      method: "GET",
      urlOrPath: "/api/wallet/ledger/all?limit=4",
      store: harness.store
    });

    const payload = JSON.parse(response.body);
    assert.equal(response.status, 200);
    assert.equal(payload.entries.length, 4);
    assert.equal(payload.entries[0].proposal_id, "proposal-debit-002");
    assert.equal(payload.entries[0].receipt.proposal_id, "proposal-debit-002");
    assert.equal(payload.entries[1].proposal_id, "proposal-credit-002");
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});
