export type SessionEntry = {
  agentId: string;
  sessionId: string;
  transactionCount: number;
  totalByCurrency: Record<string, number>;
};

export class SessionLedger {
  private sessions: Map<string, SessionEntry> = new Map();

  record(sessionId: string, agentId: string, amount: number, currency: string): void {
    const key = `${sessionId}:${agentId}`;
    const entry = this.sessions.get(key) ?? {
      agentId,
      sessionId,
      transactionCount: 0,
      totalByCurrency: {},
    };
    entry.transactionCount += 1;
    entry.totalByCurrency[currency] = (entry.totalByCurrency[currency] ?? 0) + amount;
    this.sessions.set(key, entry);
  }

  get(sessionId: string, agentId: string): SessionEntry | null {
    return this.sessions.get(`${sessionId}:${agentId}`) ?? null;
  }

  clear(): void {
    this.sessions.clear();
  }
}
