# SafeClash.com — Site Plan

## Purpose

safeclash.com is the transactional trust surface of the governed AI ecosystem. It shows proof. It lets users verify receipts, browse certified configurations, track metering, and inspect capability attestations.

SafeClash is not a governance surface. It does not approve or deny. It records proof that governance happened and makes that proof browsable and verifiable.

**Core constraint:** Every SafeClash artifact enforces `governanceAuthority: "openclashd-v2"`. SafeClash records — it never authorizes.

---

## Audience

- **Operators** verifying trust and reviewing spending
- **Developers** searching for certified AI configurations
- **Auditors** checking receipt integrity and attestation validity
- **Evaluators** assessing the certification pipeline

---

## Page Structure

### / — Trust Dashboard (Homepage)

**Purpose:** Summary of trust state. Total receipts issued, active certifications, metering summary, featured certified configurations, emerging capabilities count.

**Data sources:**
- `src/audit/receipt-journal.ts` — receipt count and chain integrity
- `src/registry/config-store.ts` — certified configuration count by level
- `src/registry/emerging-intention-store.ts` — emerging intention count

### /catalog — Certified Configuration Catalog

**Purpose:** Browse and search certified AI configurations by domain, subdomain, risk level, certification level.

**Data sources:**
- `src/search/search-engine.ts` — multi-faceted search
- `src/search/ranking.ts` — certification boosts (bronze +0.15, silver +0.4, gold +0.8, platinum +1.2)
- `src/search/query-parser.ts` — query normalization
- `src/browser/browser-projection.ts` — frontend-ready payloads (BrowserCertifiedItem, BrowserCategory)

**Current API:** `GET /api/search`, `GET /api/browser/home`, `GET /api/browser/search`

### /receipts — Receipt Journal Browser

**Purpose:** Browse the hash-chained receipt journal. Verify receipt integrity. View governance linkage (proposalId, approvalId, consentGranted).

**Data sources:**
- `src/audit/receipt.ts` — ReceiptV1 schema (receiptId, atomId, totalMicros, decision, certificationLevel, governanceRef)
- `src/audit/receipt-journal.ts` — append-only chain with prevReceiptHash
- `src/audit/merkle-proof.ts` — Merkle tree verification

**Schema contract:** `contracts/receipt.v1.json`

### /atoms — Usage Atom Explorer

**Purpose:** Browse atomic billing records. View per-agent, per-session, per-channel usage.

**Data sources:**
- `src/metering/usage-atom.ts` — UsageAtomV1 schema (atomId, configurationId, agentId, channel, unitPriceMicros, quantity, totalMicros, currency, riskLevel, governanceRef)
- `src/metering/journal.ts` — hash-chained atom journal with prevAtomHash
- `src/metering/meter-ingest.ts` — validation rules (rejects "red" and unapproved "orange")

**Schema contract:** `contracts/usage-atom.v1.json`

### /capabilities — Capability Registry

**Purpose:** Browse registered capabilities. Currently: GAP_DISCOVERY with follow-up classes (operator_review, proposal_brief, knowledge_capture).

**Data sources:**
- `src/registry/capability-store.ts` — CapabilityRegistryEntry (capabilityId, kind, supportedSubjectKinds, supportedGapClasses, followUpClasses, certification requirements)
- Follow-up classes all require `kernelApprovalRequired: true`

### /certifications — Attestation Browser

**Purpose:** Browse and verify Gap Discovery attestations. View issuer, subject (proposal_source or proposal_processor), scope, governance binding, evidence, expiration.

**Data sources:**
- `src/certification/gap-discovery-attestation.ts` — GapDiscoveryAttestation schema
- `src/certification/gap-discovery-verifier.ts` — 9-point verification:
  1. Receipt carries proposalId and approvalId from openclashd-v2
  2. Capability registry references governanceAuthority: "openclashd-v2"
  3. Capability status is "active"
  4. Attestations are active, trusted, and scoped
  5. Follow-up matches kernel approval
  6. Receipt usageClass matches capability pricing hints
  7. Source attestation certifies proposal_source
  8. Processor attestation certifies proposal_processor
  9. Both attestations actively trust-sign the action

### /emerging — Emerging Capabilities Feed

**Purpose:** Feed of candidate capabilities under evaluation. Confidence scores, source lineage, governance cell linkage, state progression (emerging → certified → promoted).

**Data sources:**
- `src/registry/emerging-intention-store.ts` — EmergingIntentionProfile (confidenceScore 0-10, sourceClusters, linkedCells, state)
- **Current API:** `GET /api/intentions/emerging`

### /metering — Metering Dashboard

**Purpose:** Per-agent, per-session spending overview. Session ledger, rate limiter status, policy gate thresholds.

**Data sources:**
- `src/governance/session-ledger.ts` — SessionEntry (sessionId, agentId, transactionCount, totalByCurrency)
- `src/governance/rate-limiter.ts` — agent rate limiting
- `src/governance/policy-gate.ts` — PolicyConfig (maxAmountPerTransaction, maxTransactionsPerSession, trustedChannels, riskEscalation)

### /billing — Settlement Rails

**Purpose:** Settlement rail status, wallet balances, supported currencies.

**Data sources:**
- `src/wallet.ts` — WalletAdapter interface (kind, quoteTransfer, reserve, transfer, release, getBalance)
- Supported rails: bitcoin, lightning, evm, solana, internal
- `src/utxo-gate.ts` — Bitcoin UTXO identity gate (minimumUnspentSats, requiredAddressPrefix)

### /verify — Receipt Verifier

**Purpose:** Paste a receipt ID or hash and verify its integrity against the journal.

**Data sources:**
- `src/audit/merkle-proof.ts` — Merkle tree proof verification
- `src/audit/receipt-journal.ts` — chain integrity check

### /search — Configuration Search

**Purpose:** Full-featured search with ranking breakdown.

**Data sources:**
- `src/search/search-engine.ts` — domain, subdomain, risk, certification, capabilities, constraints filters
- `src/search/ranking.ts` — ranking factors: CLASHD27 score, operator trust, benchmark score, runtime reliability, usage confidence, certification boost
- `src/search/acp-index.ts` — ACP indexing

**Current API:** `GET /api/search` (limit 20, max 100, offset pagination)

---

## Relationship to openclashd-v2

SafeClash depends on openclashd-v2 for governance authority:
- Every receipt references `governanceRef.proposalId` and `governanceRef.approvalId`
- Every capability entry references `governanceAuthority: "openclashd-v2"`
- Meter ingest rejects atoms without governance linkage
- Attestations are bound to kernel approval

Data flow:
```
openclashd-v2 (approves action)
    ↓ governance linkage
safeclash (records usage atom → creates receipt → links attestation)
    ↓ proof
safeclash.com (displays receipt, verification, metering)
```

---

## Relationship to Jeeves

Currently, Jeeves contains a full SafeClash browser (`AIBrowserView.swift` with marketplace, deployments, my-agents sub-views). This should be replaced with a single deep-link card that opens safeclash.com.

Jeeves should show:
- "Last receipt" summary in Audit screen (one line)
- "Browse configurations" link in Pulse screen (opens safeclash.com)

Jeeves should NOT show:
- Marketplace browsing
- Configuration detail comparison
- Deployment workflow UI
- Certification level exploration

These belong on safeclash.com.

---

## Current API Inventory

| Endpoint | Handler File | Status |
|----------|-------------|--------|
| `GET /api/search` | `src/api/search-api.ts` | Built |
| `GET /api/browser/home` | `src/api/browser-api.ts` | Built |
| `GET /api/browser/search` | `src/api/browser-api.ts` | Built |
| `GET /api/intentions/emerging` | `src/api/emerging-intentions-api.ts` | Built |

**Needed for site launch:**
- Receipt journal browser endpoint (paginated)
- Receipt verification endpoint
- Usage atom browser endpoint (paginated)
- Capability registry list endpoint
- Attestation browser endpoint
- Session ledger summary endpoint
- Metering dashboard endpoint
