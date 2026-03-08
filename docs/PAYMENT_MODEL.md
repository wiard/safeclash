# SafeClash Payment Model (Design v0.1)

## Purpose
SafeClash is the universal payment and trust layer for OpenClashd ecosystems.  
This document defines the atomic payment unit, usage metering rules, and settlement model.

OpenClashd alignment:
- Jeeves: operator visibility of spend, trust, and pending approvals
- CLASHD27: discovery and anomaly signals from payment/audit knowledge
- openclashd-v2: mandatory governance gate for all payable actions

## Atomic Payment Unit

### Decision
Use a single canonical atomic unit: **Usage Atom (`usage_atom`)**.

A `usage_atom` is one signed, immutable meter event linked to an openclashd-v2 action approval.

Why this unit:
- Supports all pricing styles (per request, tool execution, artifact, lifecycle)
- Enables micro-payments via aggregation windows
- Supports streamed usage by emitting atoms continuously
- Supports offline reconciliation using append-only event logs

### Usage Atom Schema (logical)
```ts
type UsageAtom = {
  atomId: string;                     // ULID/UUIDv7
  occurredAt: string;                 // ISO timestamp
  tenantId: string;
  workspaceId: string;

  // Governance linkage (required)
  proposalId: string;
  approvalId: string;
  actionId: string;

  // Execution context
  agentId: string;
  sessionId: string;
  capabilityId: string;
  meterKind: "request" | "tool_exec" | "knowledge_artifact" | "lifecycle";
  meterUnit: "count" | "ms" | "token" | "byte" | "event";
  quantity: string;                   // decimal string

  // Pricing context
  tariffId: string;
  unitPriceMicros: string;            // integer micros
  currency: "USD" | "EUR" | "SAT" | "USDC";

  // Integrity
  prevAtomHash?: string;              // local hash chain for offline mode
  meterSignature: string;
};
```

## Metering Model

### Meter classes
- `request`: one atom per external/API request accepted by governance
- `tool_exec`: one atom per tool execution (or per elapsed time slice for long-running tools)
- `knowledge_artifact`: one atom when a knowledge object is committed
- `lifecycle`: atoms on lifecycle events (`agent_started`, `agent_paused`, `agent_handoff`, `agent_stopped`)

### Rating equation
`line_amount = quantity * unit_price`

Settlement window amount:
`window_amount = sum(line_amount for atoms in window)`

### Recommended defaults
- Emit atoms at 1-5 second cadence for streamed operations
- Close settlement windows at any of:
1. elapsed window time threshold
2. value threshold
3. lifecycle boundary

## Micro-Payments and Streaming

### Flow
1. Meter emits `usage_atom` events in near real time.
2. Rating engine prices each atom with active tariff and license policy.
3. Payment router computes participant split (provider/platform/referrer/governance fee).
4. Ledger records postings in pending state.
5. Settlement adapter executes transfer rails (internal balance, LN, stablecoin, etc.).
6. Receipt is generated and attached to knowledge loop.

### Split-friendly accounting
Every settled window creates:
- one payer debit entry
- N payee credit entries
- one balancing control entry if required by rail fees

## Offline Audit Reconciliation

### Offline mode
- Client/runtime persists atoms locally in append-only journal.
- Journal is hash-chained via `prevAtomHash`.
- Periodic Merkle root is computed for checkpoint epochs.

### Reconciliation on reconnect
1. Upload unsynced atoms + epoch roots.
2. Server validates signatures, hash continuity, and governance references.
3. Server re-rates atoms deterministically using historical tariff snapshot.
4. Differences produce reconciliation entries (`adjustment_debit` / `adjustment_credit`).
5. Final reconciliation receipt is written to knowledge store.

### Invariants
- No payable action without `approvalId`
- No settlement without ledger postings
- No certificate issuance without settled proof window

## Knowledge Loop Requirements
Each settlement and reconciliation must create a knowledge artifact:
- Namespace: `safeclash/payments/{tenantId}/{period}/{receiptId}`
- Linked keys: `proposalId`, `actionId`, `approvalId`, `certificateId?`
- Jeeves-visible summary for operators
- CLASHD27-readable structured fields for anomaly scans
