import type { PolicyConfig, PolicyDecision, PolicyInput } from "./policy-gate.ts";
import type { RateLimiter } from "./rate-limiter.ts";
import type { SessionLedger } from "./session-ledger.ts";

export function evaluate(
  input: PolicyInput,
  config: PolicyConfig,
  sessionLedger: SessionLedger,
  rateLimiter: RateLimiter,
  nowMs: number,
): PolicyDecision {
  const checks = {
    budgetOk: true,
    rateLimitOk: true,
    channelTrusted: true,
    riskAcceptable: true,
  };

  if (!rateLimiter.check(input.agentId, nowMs)) {
    checks.rateLimitOk = false;
    return { decision: "red", reason: "rate limit exceeded", checks };
  }

  const maxTx = config.maxAmountPerTransaction[input.currency];
  if (maxTx !== undefined && input.amount > maxTx) {
    checks.budgetOk = false;
    return {
      decision: "red",
      reason: `amount ${input.amount} exceeds max ${maxTx} per transaction`,
      checks,
    };
  }

  const session = sessionLedger.get(input.sessionId, input.agentId);
  if (session) {
    const maxSession = config.maxAmountPerSession[input.currency];
    const currentTotal = session.totalByCurrency[input.currency] ?? 0;
    if (maxSession !== undefined && currentTotal + input.amount > maxSession) {
      checks.budgetOk = false;
      return { decision: "red", reason: "session budget exceeded", checks };
    }
    if (session.transactionCount >= config.maxTransactionsPerSession) {
      checks.rateLimitOk = false;
      return { decision: "red", reason: "max transactions per session exceeded", checks };
    }
  }

  const isTrusted = config.trustedChannels.includes(input.channel);
  checks.channelTrusted = isTrusted;

  const baseDecision = config.riskEscalation[input.riskLevel];
  checks.riskAcceptable = baseDecision !== "red";

  let finalDecision = baseDecision;
  if (!isTrusted && baseDecision === "green") {
    finalDecision = "orange";
  }

  const reason =
    finalDecision === "green"
      ? "approved"
      : finalDecision === "orange"
        ? `escalated: ${!isTrusted ? "untrusted channel" : "medium risk"}`
        : `blocked: ${!checks.budgetOk ? "budget" : "high risk"}`;

  return { decision: finalDecision, reason, checks };
}
