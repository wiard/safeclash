import { createHash } from "node:crypto";

export type Currency = "SAT" | "USDC" | "EUR" | "USD";

export type UsageAtom = {
  atomId: string;
  configurationId: string;
  sessionId: string;
  agentId: string;
  channel: string;
  action: string;
  unitPriceMicros: number;
  quantity: number;
  currency: Currency;
  totalMicros: number;
  riskLevel: "low" | "medium" | "high";
  governanceRef: {
    proposalId: string | null;
    approvalId: string | null;
    consentGranted: boolean;
    policyDecision: "green" | "orange" | "red" | "never";
  };
  prevAtomHash: string | null;
  timestamp: string;
};

export function createAtomId(configId: string, sessionId: string, timestamp: string): string {
  return createHash("sha256").update(`${configId}:${sessionId}:${timestamp}`).digest("hex").slice(0, 16);
}

export function hashAtom(atom: UsageAtom): string {
  const data = JSON.stringify(atom, Object.keys(atom).sort());
  return createHash("sha256").update(data).digest("hex");
}

export function createUsageAtom(params: {
  configurationId: string;
  sessionId: string;
  agentId: string;
  channel: string;
  action: string;
  unitPriceMicros: number;
  quantity: number;
  currency: Currency;
  riskLevel: "low" | "medium" | "high";
  governanceRef: UsageAtom["governanceRef"];
  prevAtomHash: string | null;
  timestamp: string;
}): UsageAtom {
  const atomId = createAtomId(params.configurationId, params.sessionId, params.timestamp);
  return {
    atomId,
    ...params,
    totalMicros: params.unitPriceMicros * params.quantity,
  };
}

export function validateAtom(atom: UsageAtom): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!atom.atomId) {
    errors.push("atomId is required");
  }
  if (!atom.configurationId) {
    errors.push("configurationId is required");
  }
  if (!atom.sessionId) {
    errors.push("sessionId is required");
  }
  if (!atom.agentId) {
    errors.push("agentId is required");
  }
  if (!atom.channel) {
    errors.push("channel is required");
  }
  if (!atom.action) {
    errors.push("action is required");
  }
  if (atom.unitPriceMicros < 0) {
    errors.push("unitPriceMicros must be >= 0");
  }
  if (atom.quantity < 1) {
    errors.push("quantity must be >= 1");
  }
  if (atom.totalMicros !== atom.unitPriceMicros * atom.quantity) {
    errors.push("totalMicros mismatch");
  }
  if (!["SAT", "USDC", "EUR", "USD"].includes(atom.currency)) {
    errors.push("invalid currency");
  }
  if (!["low", "medium", "high"].includes(atom.riskLevel)) {
    errors.push("invalid riskLevel");
  }

  const decision = atom.governanceRef.policyDecision;
  if (!["green", "orange", "red", "never"].includes(decision)) {
    errors.push("invalid policyDecision");
  }

  return { valid: errors.length === 0, errors };
}
