# SafeClash.com Site Structure

## Purpose

`safeclash.com` is the trust and transaction surface of the OpenClashd ecosystem.
It exists to make receipts, certifications, metering, and configuration trust legible without taking over governance.

SafeClash does not approve actions.
It records proof that governance happened in `openclashd-v2` and makes that proof inspectable.

## Core Sections

### Home

- Purpose: trust-first overview of the SafeClash system
- Audience: operators, auditors, developers, evaluators
- Main surfaces:
  - featured certified configurations
  - recent receipts
  - certification counts by level
  - emerging intention count
- Current backend sources:
  - [browser-api.ts](/Users/wiardvasen/safeclash/src/api/browser-api.ts)
  - [emerging-intentions-api.ts](/Users/wiardvasen/safeclash/src/api/emerging-intentions-api.ts)
  - [config-store.ts](/Users/wiardvasen/safeclash/src/registry/config-store.ts)

### Receipts

- Purpose: browse receipt history and verify governance linkage
- Audience: operators, auditors
- Main surfaces:
  - receipt id
  - governance refs
  - amount and currency
  - decision and certification level
  - hash-chain / Merkle verification status
- Current backend sources:
  - [receipt.ts](/Users/wiardvasen/safeclash/src/audit/receipt.ts)
  - [receipt-journal.ts](/Users/wiardvasen/safeclash/src/audit/receipt-journal.ts)
  - [merkle-proof.ts](/Users/wiardvasen/safeclash/src/audit/merkle-proof.ts)
- Site note:
  - requires a thin read-only HTTP endpoint for paginated browsing

### Usage Atoms

- Purpose: expose the atomic metering events that feed receipts and billing
- Audience: developers, operators, auditors
- Main surfaces:
  - atom id
  - configuration id
  - session id
  - agent id
  - action
  - amount and quantity
  - governance ref
- Current backend sources:
  - [usage-atom.ts](/Users/wiardvasen/safeclash/src/metering/usage-atom.ts)
  - [journal.ts](/Users/wiardvasen/safeclash/src/metering/journal.ts)
  - [meter-ingest.ts](/Users/wiardvasen/safeclash/src/metering/meter-ingest.ts)
- Site note:
  - requires a thin read-only HTTP endpoint for journal browsing

### Capability Registry

- Purpose: show which capabilities and follow-up classes exist and under which governance authority
- Audience: developers, auditors, operators
- Main surfaces:
  - capability id
  - supported subject kinds
  - supported gap classes
  - follow-up classes
  - governance authority
- Current backend sources:
  - [capability-store.ts](/Users/wiardvasen/safeclash/src/registry/capability-store.ts)
  - [acp-store.ts](/Users/wiardvasen/safeclash/src/registry/acp-store.ts)

### Certifications

- Purpose: browse attested subjects and verify certification scope
- Audience: auditors, operators, developers
- Main surfaces:
  - subject
  - issuer
  - certificate scope
  - active / expired state
  - linked governance evidence
- Current backend sources:
  - [gap-discovery-attestation.ts](/Users/wiardvasen/safeclash/src/certification/gap-discovery-attestation.ts)
  - [gap-discovery-verifier.ts](/Users/wiardvasen/safeclash/src/certification/gap-discovery-verifier.ts)

### Metering Dashboard

- Purpose: summarize policy decisions, session spend, and rate pressure
- Audience: operators, developers
- Main surfaces:
  - transactions by session
  - total by currency
  - per-agent rate pressure
  - policy decision distribution
- Current backend sources:
  - [payment-engine.ts](/Users/wiardvasen/safeclash/src/payment-engine.ts)
  - [evaluate.ts](/Users/wiardvasen/safeclash/src/governance/evaluate.ts)
  - [session-ledger.ts](/Users/wiardvasen/safeclash/src/governance/session-ledger.ts)
  - [rate-limiter.ts](/Users/wiardvasen/safeclash/src/governance/rate-limiter.ts)

### Billing

- Purpose: settlement rails, wallet state, and transaction operations visibility
- Audience: operators, finance, auditors
- Main surfaces:
  - supported rails
  - balance summaries
  - transfer references
  - reserve / release lifecycle
- Current backend sources:
  - [wallet.ts](/Users/wiardvasen/safeclash/src/wallet.ts)
  - [payment-engine.ts](/Users/wiardvasen/safeclash/src/payment-engine.ts)
  - [utxo-gate.ts](/Users/wiardvasen/safeclash/src/utxo-gate.ts)

### Configuration Browser

- Purpose: browse certified and emerging configurations
- Audience: operators, developers, evaluators
- Main surfaces:
  - featured certified items
  - categories by domain/subdomain
  - certified list
  - emerging feed
- Current HTTP APIs:
  - `GET /api/browser/home`
  - `GET /api/browser/search`
  - `GET /api/search`
  - `GET /api/intentions/emerging`
- Backend sources:
  - [browser-api.ts](/Users/wiardvasen/safeclash/src/api/browser-api.ts)
  - [search-api.ts](/Users/wiardvasen/safeclash/src/api/search-api.ts)
  - [emerging-intentions-api.ts](/Users/wiardvasen/safeclash/src/api/emerging-intentions-api.ts)

### Trust Explorer

- Purpose: explain and browse the link between governance references, receipts, attestations, and configuration trust
- Audience: auditors, evaluators, operators
- Main surfaces:
  - governance authority
  - proof chains
  - capability linkage
  - trust metadata
- Current backend sources:
  - [trust-metadata.ts](/Users/wiardvasen/safeclash/src/trust/trust-metadata.ts)
  - [receipt.ts](/Users/wiardvasen/safeclash/src/audit/receipt.ts)
  - certification and registry sources above

## Authentication Model

Public read-only:

- Home
- Configuration Browser
- Capability Registry
- Certifications overview
- Trust Explorer overview

Authenticated or operator-scoped:

- detailed receipts
- usage atoms
- metering dashboard
- billing

## Relationship To Other Surfaces

- `openclashd.com` remains the governance and knowledge portal
- Jeeves remains the approval cockpit
- `safeclash.com` owns trust, certification, receipt, and metering depth
- `clashd27.com` owns research and discovery depth

## Build Rule

When a surface asks:

- "Was this allowed?" -> `openclashd-v2`
- "Was this certified or billed correctly?" -> `safeclash`
- "What is forming in discovery?" -> `clashd27`
- "What should the operator do?" -> Jeeves
