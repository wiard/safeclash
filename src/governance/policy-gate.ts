export type PolicyInput = {
  agentId: string;
  sessionId: string;
  channel: string;
  amount: number;
  currency: string;
  configurationId: string;
  riskLevel: "low" | "medium" | "high";
  timestamp: string;
};

export type PolicyDecision = {
  decision: "green" | "orange" | "red" | "never";
  reason: string;
  checks: {
    budgetOk: boolean;
    rateLimitOk: boolean;
    channelTrusted: boolean;
    riskAcceptable: boolean;
  };
};

export type PolicyConfig = {
  maxAmountPerTransaction: Record<string, number>;
  maxTransactionsPerSession: number;
  maxAmountPerSession: Record<string, number>;
  trustedChannels: string[];
  riskEscalation: {
    low: "green";
    medium: "orange";
    high: "red";
  };
};

export const DEFAULT_POLICY: PolicyConfig = {
  maxAmountPerTransaction: {
    SAT: 100_000,
    USDC: 50_000_000,
    EUR: 50_000_000,
    USD: 50_000_000,
  },
  maxTransactionsPerSession: 100,
  maxAmountPerSession: {
    SAT: 1_000_000,
    USDC: 500_000_000,
    EUR: 500_000_000,
    USD: 500_000_000,
  },
  trustedChannels: ["jeeves-iphone", "house-cli"],
  riskEscalation: {
    low: "green",
    medium: "orange",
    high: "red",
  },
};
