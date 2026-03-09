import { evaluate } from "./governance/evaluate.ts";
import type { PolicyConfig } from "./governance/policy-gate.ts";
import type { RateLimiter } from "./governance/rate-limiter.ts";
import type { SessionLedger } from "./governance/session-ledger.ts";
import type { Journal } from "./metering/journal.ts";
import type { MeterIngest } from "./metering/meter-ingest.ts";
import { createUsageAtom, type Currency } from "./metering/usage-atom.ts";

export type PaymentRequest = {
  configurationId: string;
  sessionId: string;
  agentId: string;
  channel: string;
  action: string;
  unitPriceMicros: number;
  quantity: number;
  currency: Currency;
  riskLevel: "low" | "medium" | "high";
  timestamp: string;
};

export type PaymentResult = {
  accepted: boolean;
  decision: "green" | "orange" | "red" | "never";
  reason: string;
  atomId: string | null;
  hash: string | null;
  errors: string[];
};

export class PaymentEngine {
  private policy: PolicyConfig;
  private sessionLedger: SessionLedger;
  private rateLimiter: RateLimiter;
  private meterIngest: MeterIngest;
  private journal: Journal;

  constructor(deps: {
    policy: PolicyConfig;
    sessionLedger: SessionLedger;
    rateLimiter: RateLimiter;
    meterIngest: MeterIngest;
    journal: Journal;
  }) {
    this.policy = deps.policy;
    this.sessionLedger = deps.sessionLedger;
    this.rateLimiter = deps.rateLimiter;
    this.meterIngest = deps.meterIngest;
    this.journal = deps.journal;
  }

  process(request: PaymentRequest): PaymentResult {
    const nowMs = new Date(request.timestamp).getTime();

    const decision = evaluate(
      {
        agentId: request.agentId,
        sessionId: request.sessionId,
        channel: request.channel,
        amount: request.unitPriceMicros * request.quantity,
        currency: request.currency,
        configurationId: request.configurationId,
        riskLevel: request.riskLevel,
        timestamp: request.timestamp,
      },
      this.policy,
      this.sessionLedger,
      this.rateLimiter,
      nowMs,
    );

    const atom = createUsageAtom({
      configurationId: request.configurationId,
      sessionId: request.sessionId,
      agentId: request.agentId,
      channel: request.channel,
      action: request.action,
      unitPriceMicros: request.unitPriceMicros,
      quantity: request.quantity,
      currency: request.currency,
      riskLevel: request.riskLevel,
      governanceRef: {
        proposalId: null,
        approvalId: null,
        consentGranted: decision.decision === "green",
        policyDecision: decision.decision,
      },
      prevAtomHash: this.journal.getLastHash(),
      timestamp: request.timestamp,
    });

    const ingestResult = this.meterIngest.ingest(atom);

    if (ingestResult.accepted) {
      this.sessionLedger.record(
        request.sessionId,
        request.agentId,
        request.unitPriceMicros * request.quantity,
        request.currency,
      );
      this.rateLimiter.record(request.agentId, nowMs);
    }

    return {
      accepted: ingestResult.accepted,
      decision: decision.decision,
      reason: decision.reason,
      atomId: atom.atomId,
      hash: ingestResult.hash,
      errors: ingestResult.errors,
    };
  }
}
