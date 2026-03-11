# SafeClash Trust Surfaces

## Purpose

This document defines which SafeClash surfaces represent trust and transaction state, what each one proves, and how each surface relates back to `openclashd-v2` governance.

SafeClash is a proof layer.
It is not a governance authority.

## Trust Surface Inventory

### 1. Receipts

Primary source files:

- [receipt.ts](/Users/wiardvasen/safeclash/src/audit/receipt.ts)
- [receipt-journal.ts](/Users/wiardvasen/safeclash/src/audit/receipt-journal.ts)
- [merkle-proof.ts](/Users/wiardvasen/safeclash/src/audit/merkle-proof.ts)

What receipts prove:

- a metered event was recorded
- a governance reference was attached
- a pricing outcome was computed
- a receipt entered an append-only chain

What receipts do not prove:

- that an action was approved without kernel evidence
- that SafeClash may authorize future actions

Operator value:

- see the last bounded financial/trust artifact
- verify linkage from proposal/approval to payment evidence

### 2. Usage Atoms

Primary source files:

- [usage-atom.ts](/Users/wiardvasen/safeclash/src/metering/usage-atom.ts)
- [journal.ts](/Users/wiardvasen/safeclash/src/metering/journal.ts)
- [meter-ingest.ts](/Users/wiardvasen/safeclash/src/metering/meter-ingest.ts)

What usage atoms prove:

- the smallest unit of billable activity
- the session, agent, channel, and action involved
- the governance reference attached at metering time

What usage atoms do not prove:

- settlement finality on their own
- capability validity on their own

Operator value:

- inspect how spending and usage were formed before receipt aggregation

### 3. Capability Registry

Primary source files:

- [capability-store.ts](/Users/wiardvasen/safeclash/src/registry/capability-store.ts)
- [acp-store.ts](/Users/wiardvasen/safeclash/src/registry/acp-store.ts)

What the registry proves:

- which capabilities exist
- which subject kinds they support
- which follow-up classes are allowed
- that the governance authority is `openclashd-v2`

What it does not prove:

- that a specific action is approved
- that a capability holder may execute without consent

Operator value:

- understand scope and permitted capability classes before reading receipts or attestations

### 4. Certifications And Attestations

Primary source files:

- [gap-discovery-attestation.ts](/Users/wiardvasen/safeclash/src/certification/gap-discovery-attestation.ts)
- [gap-discovery-verifier.ts](/Users/wiardvasen/safeclash/src/certification/gap-discovery-verifier.ts)

What certifications prove:

- a subject was certified for a declared capability scope
- verification rules were applied
- governance linkage was checked as part of verification

What they do not prove:

- that certification replaces operator approval
- that SafeClash may bypass the kernel

Operator value:

- assess whether a proposal source, processor, or configuration is trusted enough for governed review

### 5. Metering Dashboard

Primary source files:

- [payment-engine.ts](/Users/wiardvasen/safeclash/src/payment-engine.ts)
- [evaluate.ts](/Users/wiardvasen/safeclash/src/governance/evaluate.ts)
- [policy-gate.ts](/Users/wiardvasen/safeclash/src/governance/policy-gate.ts)
- [session-ledger.ts](/Users/wiardvasen/safeclash/src/governance/session-ledger.ts)
- [rate-limiter.ts](/Users/wiardvasen/safeclash/src/governance/rate-limiter.ts)

What metering proves:

- policy was evaluated against a payment request
- session and rate state were updated when accepted
- costs can be reconstructed from atoms plus tariff assumptions

What it does not prove:

- kernel approval by itself
- trustworthiness of a discovery candidate

Operator value:

- track usage pressure, budget-style spend patterns, and operational transaction load

### 6. Configuration Browser

Primary source files:

- [browser-api.ts](/Users/wiardvasen/safeclash/src/api/browser-api.ts)
- [search-api.ts](/Users/wiardvasen/safeclash/src/api/search-api.ts)
- [emerging-intentions-api.ts](/Users/wiardvasen/safeclash/src/api/emerging-intentions-api.ts)

What the browser proves:

- which configurations are certified or emerging
- which categories and deployment traits are visible
- whether a certified configuration exists for a given intention profile

What it does not prove:

- that a configuration has been approved for a specific live action
- that deployment authority moved out of the kernel

Operator value:

- browse trust-rated configuration options without mixing them into the approval cockpit

## Trust Boundary Rules

SafeClash surfaces must always preserve these rules:

1. Governance authority remains `openclashd-v2`
2. Discovery trust never becomes execution authority
3. Receipts are append-only
4. Metering data is attributable
5. Certification never substitutes for human approval

## Public Vs Operator Surfaces

Public-safe:

- configuration browser
- capability registry
- certification overviews
- trust explorer summaries

Operator or tenant-scoped:

- detailed receipts
- usage atom explorer
- metering dashboard
- billing / settlement views

## Recommended Information Architecture

Public trust:

- Home
- Capability Registry
- Certifications
- Configuration Browser
- Trust Explorer

Operator trust:

- Receipts
- Usage Atoms
- Metering Dashboard
- Billing

## Ecosystem Placement

- Jeeves shows only trust summaries and links
- `openclashd.com` shows governance and knowledge state
- `safeclash.com` holds trust and transaction depth
- `clashd27.com` holds research and discovery depth
