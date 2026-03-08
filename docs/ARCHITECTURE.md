# SafeClash Architecture (Design v0.1)

## Objective
Design SafeClash as the universal payment + certification layer for OpenClashd systems, while preserving governance-first control:

Discovery -> Proposal -> Human Approval -> Action -> Knowledge

No component bypasses openclashd-v2 governance.

## 1. Payment Engine Architecture

### Core components
- `Meter Ingest`: validates and normalizes `usage_atom` events
- `Policy Gate`: checks capability license + governance approval before charging
- `Rating Engine`: resolves tariff snapshots and computes line amounts
- `Payment Router`: applies split rules and chooses settlement rail
- `Ledger Core`: append-only double-entry postings (pending/settled/reconciled)
- `Settlement Adapters`: execute transfers on selected rails
- `Receipt Service`: emits signed audit receipts and knowledge artifacts
- `Reconciliation Engine`: resolves offline journals and adjustment postings

### Control plane integration
- openclashd-v2 is source of truth for:
1. approvals (`approvalId`)
2. capability grants
3. policy versions
- SafeClash rejects billable events without active governance references.

### Sequence (online happy path)
1. Agent action executes under approved governance action.
2. Meter emits `usage_atom`.
3. SafeClash rates, routes, and books pending ledger entries.
4. Settlement adapter commits transfer.
5. Receipt stored and surfaced to Jeeves.
6. Receipt metadata becomes CLASHD27-discoverable signal.

## 2. Wallet Abstraction

### Design goals
- Rail-agnostic interface
- Deterministic settlement lifecycle
- Support custodial and self-custody wallets
- Optional identity anchoring to Bitcoin or other chains

### TypeScript interface (logical)
```ts
type Money = { amountMicros: string; currency: string };

type WalletParty = {
  partyId: string;
  walletId: string;
  chain?: "bitcoin" | "lightning" | "evm" | "solana" | "internal";
  addressRef?: string;
};

interface WalletAdapter {
  kind(): string;
  quoteTransfer(from: WalletParty, to: WalletParty, amount: Money): Promise<{ feeMicros: string }>;
  reserve(idempotencyKey: string, from: WalletParty, amount: Money): Promise<{ reservationId: string }>;
  transfer(idempotencyKey: string, from: WalletParty, to: WalletParty, amount: Money): Promise<{ txRef: string; finalized: boolean }>;
  release(reservationId: string): Promise<void>;
  getBalance(party: WalletParty): Promise<Money>;
}
```

### Adapter set
- `internal-ledger`: default high-throughput micro-payment rail
- `lightning`: sats routing for low-fee streamed settlement
- `bitcoin-utxo`: optional UTXO-gated identity and settlement
- `evm-token`: stablecoin settlements where needed

## 3. Usage Metering Model

SafeClash uses the `usage_atom` defined in `docs/PAYMENT_MODEL.md`.

### Metering dimensions
- cardinality: request count
- compute: tool runtime milliseconds
- model usage: token count
- artifact output: bytes/records
- lifecycle transitions: event count

### Deterministic pricing
- Tariffs are versioned snapshots (`tariffId`, `tariffVersion`)
- Rating is pure and replayable from atom + tariff snapshot
- Reconciliation replays exact historical versions

## 4. Certification Proof Structure

### Certificate intent
A SafeClash certificate proves:
- action was governance-approved
- usage was metered and billed under declared policy
- settlement/audit receipts exist
- declared capabilities/licenses were valid

### Schema (logical)
```ts
type SafeClashCertificateV1 = {
  certificateId: string;
  issuedAt: string;
  expiresAt?: string;

  issuer: { id: string; pubKey: string };
  subject: { agentId: string; tenantId: string; did?: string; walletRef?: string };

  governance: {
    proposalId: string;
    approvalId: string;
    actionIds: string[];
    policyVersion: string;
  };

  capabilityLicenses: Array<{
    capabilityId: string;
    licenseId: string;
    validFrom: string;
    validTo?: string;
  }>;

  paymentProof: {
    ledgerWindowId: string;
    usageAtomRoot: string;            // Merkle root of metered atoms
    receiptRoot: string;              // Merkle root of receipts
    totalChargedMicros: string;
    currency: string;
  };

  optionalAnchors?: Array<{
    chain: "bitcoin" | "evm";
    anchorRef: string;                // txid or contract/event ref
    anchoredAt: string;
  }>;

  signatures: Array<{
    signer: string;                   // safeclash, auditor, optional openclashd attestor
    sig: string;
    alg: "ed25519" | "secp256k1";
  }>;
};
```

### Verification checks
1. signature validity and trust chain
2. governance reference validity
3. license validity at action time
4. merkle inclusion for sampled atom/receipt
5. settlement totals consistency

## 5. Minimal Runtime Module Layout (TypeScript / Node / pnpm)

Use this as the first non-trivial runtime skeleton:

```text
src/
  index.ts
  payment-engine.ts          // Orchestrates ingest -> rate -> route -> settle -> receipt
  wallet.ts                  // WalletAdapter interfaces + registry
  utxo-gate.ts               // Optional identity/capability checks against UTXO state

  metering/
    usage-atom.ts
    meter-ingest.ts
    journal.ts

  pricing/
    tariff-store.ts
    rating-engine.ts

  routing/
    split-policy.ts
    payment-router.ts

  ledger/
    ledger-store.ts
    postings.ts
    reconciliation.ts

  certification/
    certificate-schema.ts
    certificate-issuer.ts
    certificate-verifier.ts

  governance/
    openclashd-client.ts
    policy-gate.ts

  audit/
    receipt-schema.ts
    receipt-writer.ts
    merkle-proof.ts

contracts/
  usage-atom.v1.json
  receipt.v1.json
  certificate.v1.json

tests/
  payment-engine.spec.ts
  wallet-adapters.spec.ts
  reconciliation.spec.ts
  certificate.spec.ts
```

## Operator UX Requirements (Jeeves-facing)
- Show pending vs settled spend by action and capability
- Show trust state: certified / uncertified / expired
- Show reconciliation alerts and drift magnitude
- Keep views legible: no hidden critical state in logs only

## Guardrails
- SafeClash must fail closed on missing governance references.
- All receipts and certificates must be knowledge-addressable.
- Every certificate must link to payment and governance evidence.
