export class RateLimiter {
  private windows: Map<string, number[]> = new Map();
  private maxPerWindow: number;
  private windowMs: number;

  constructor(maxPerWindow: number, windowMs: number = 60_000) {
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;
  }

  check(agentId: string, nowMs: number): boolean {
    const timestamps = this.windows.get(agentId) ?? [];
    const cutoff = nowMs - this.windowMs;
    const recent = timestamps.filter((value) => value > cutoff);
    return recent.length < this.maxPerWindow;
  }

  record(agentId: string, nowMs: number): void {
    const timestamps = this.windows.get(agentId) ?? [];
    const cutoff = nowMs - this.windowMs;
    const recent = timestamps.filter((value) => value > cutoff);
    recent.push(nowMs);
    this.windows.set(agentId, recent);
  }
}
