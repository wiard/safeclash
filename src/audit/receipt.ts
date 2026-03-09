import { createHash } from "node:crypto";
import type { UsageAtom } from "../metering/usage-atom.ts";

export type Receipt = {
  receiptId: string;
  atomId: string;
  configurationId: string;
  agentId: string;
  sessionId: string;
  channel: string;
  action: string;
  totalMicros: number;
  currency: string;
  decision: "green" | "orange" | "red" | "never";
  reason: string;
  atomHash: string;
  journalLine: number | null;
  certified: boolean;
  certificationLevel: "none" | "bronze" | "silver" | "gold" | "platinum";
  timestamp: string;
};

export function createReceipt(
  atom: UsageAtom,
  decision: Receipt["decision"],
  reason: string,
  atomHash: string,
  journalLine: number | null,
  certificationLevel: Receipt["certificationLevel"],
  timestamp: string,
): Receipt {
  const receiptId = createHash("sha256")
    .update(`${atom.atomId}:${decision}:${timestamp}`)
    .digest("hex")
    .slice(0, 16);

  return {
    receiptId,
    atomId: atom.atomId,
    configurationId: atom.configurationId,
    agentId: atom.agentId,
    sessionId: atom.sessionId,
    channel: atom.channel,
    action: atom.action,
    totalMicros: atom.totalMicros,
    currency: atom.currency,
    decision,
    reason,
    atomHash,
    journalLine,
    certified: decision === "green",
    certificationLevel,
    timestamp,
  };
}

export function hashReceipt(receipt: Receipt): string {
  const data = JSON.stringify(receipt, Object.keys(receipt).sort());
  return createHash("sha256").update(data).digest("hex");
}
