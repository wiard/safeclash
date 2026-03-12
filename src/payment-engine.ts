import { createHash } from "node:crypto";

import { evaluate } from "./governance/evaluate.ts";
import type { PolicyConfig } from "./governance/policy-gate.ts";
import type { RateLimiter } from "./governance/rate-limiter.ts";
import type { SessionLedger } from "./governance/session-ledger.ts";
import type { Journal } from "./metering/journal.ts";
import type { MeterIngest } from "./metering/meter-ingest.ts";
import { createUsageAtom, type Currency } from "./metering/usage-atom.ts";

export type ApprovalDecision = {
  decision: "approve" | "deny";
  actor: string;
  reason: string;
  timestamp: string;
};

export type SecurityExecutionReceipt = {
  receipt_id: string;
  proposal_id: string;
  capability: "security_remediation";
  security_signal_id: string;
  remediation_applied: string;
  approved_by: string;
  timestamp: string;
};

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
  capability?: string;
  proposalId?: string;
  securitySignalId?: string;
  remediationApplied?: string;
  approvalDecision?: ApprovalDecision | null;
  autoRemediation?: boolean;
};

export type PaymentResult = {
  accepted: boolean;
  decision: "green" | "orange" | "red" | "never";
  reason: string;
  atomId: string | null;
  hash: string | null;
  errors: string[];
  statusCode: number;
  executionReceipt: SecurityExecutionReceipt | null;
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
    if (request.capability === "security_remediation") {
      return this.processSecurityRemediation(request);
    }

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
      statusCode: ingestResult.accepted ? 200 : decision.decision === "orange" ? 202 : 403,
      executionReceipt: null,
    };
  }

  private processSecurityRemediation(request: PaymentRequest): PaymentResult {
    if (request.autoRemediation) {
      return this.rejectSecurityRemediation(request, "auto_remediation_forbidden");
    }

    const approvalDecision = normalizeApprovalDecision(request.approvalDecision);
    if (!approvalDecision) {
      return this.rejectSecurityRemediation(request, "approval_decision_required");
    }

    if (approvalDecision.decision !== "approve") {
      return this.rejectSecurityRemediation(request, "approval_decision_not_approved", approvalDecision);
    }

    const proposalId = normalizeRequiredString(request.proposalId);
    const securitySignalId = normalizeRequiredString(request.securitySignalId);
    const remediationApplied = normalizeRequiredString(request.remediationApplied) ?? normalizeRequiredString(request.action);

    if (!proposalId || !securitySignalId || !remediationApplied) {
      return this.rejectSecurityRemediation(request, "invalid_security_remediation_request", approvalDecision, {
        proposalId,
      });
    }

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
        proposalId,
        approvalId: createApprovalId(proposalId, approvalDecision),
        consentGranted: true,
        policyDecision: "green",
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
      this.rateLimiter.record(request.agentId, new Date(request.timestamp).getTime());
    }

    return {
      accepted: ingestResult.accepted,
      decision: "green",
      reason: "security_remediation_approved",
      atomId: atom.atomId,
      hash: ingestResult.hash,
      errors: ingestResult.errors,
      statusCode: ingestResult.accepted ? 200 : 403,
      executionReceipt: ingestResult.accepted
        ? createSecurityExecutionReceipt({
          proposalId,
          securitySignalId,
          remediationApplied,
          approvedBy: approvalDecision.actor,
          timestamp: request.timestamp,
        })
        : null,
    };
  }

  private rejectSecurityRemediation(
    request: PaymentRequest,
    reason: string,
    approvalDecision?: ApprovalDecision | null,
    overrides?: {
      proposalId?: string | null;
    },
  ): PaymentResult {
    const proposalId = overrides?.proposalId ?? normalizeRequiredString(request.proposalId);
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
        proposalId,
        approvalId: proposalId && approvalDecision ? createApprovalId(proposalId, approvalDecision) : null,
        consentGranted: false,
        policyDecision: "never",
      },
      prevAtomHash: this.journal.getLastHash(),
      timestamp: request.timestamp,
    });

    const ingestResult = this.meterIngest.ingest(atom);

    return {
      accepted: false,
      decision: "never",
      reason,
      atomId: atom.atomId,
      hash: ingestResult.hash,
      errors: ingestResult.errors.length > 0 ? ingestResult.errors : [`blocked: ${reason}`],
      statusCode: 403,
      executionReceipt: null,
    };
  }
}

function createApprovalId(proposalId: string, approvalDecision: ApprovalDecision): string {
  return createHash("sha256")
    .update(`${proposalId}:${approvalDecision.actor}:${approvalDecision.timestamp}:${approvalDecision.reason}`)
    .digest("hex")
    .slice(0, 16);
}

function createSecurityExecutionReceipt(input: {
  proposalId: string;
  securitySignalId: string;
  remediationApplied: string;
  approvedBy: string;
  timestamp: string;
}): SecurityExecutionReceipt {
  return {
    receipt_id: createHash("sha256")
      .update(
        `${input.proposalId}:${input.securitySignalId}:${input.remediationApplied}:${input.approvedBy}:${input.timestamp}`,
      )
      .digest("hex")
      .slice(0, 16),
    proposal_id: input.proposalId,
    capability: "security_remediation",
    security_signal_id: input.securitySignalId,
    remediation_applied: input.remediationApplied,
    approved_by: input.approvedBy,
    timestamp: input.timestamp,
  };
}

function normalizeApprovalDecision(value: PaymentRequest["approvalDecision"]): ApprovalDecision | null {
  if (!value) {
    return null;
  }
  const decision = value.decision === "approve" || value.decision === "deny" ? value.decision : null;
  const actor = normalizeRequiredString(value.actor);
  const reason = normalizeRequiredString(value.reason);
  const timestamp = normalizeRequiredString(value.timestamp);
  if (!decision || !actor || !reason || !timestamp) {
    return null;
  }
  return { decision, actor, reason, timestamp };
}

function normalizeRequiredString(value: string | undefined | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
