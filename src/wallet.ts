export type WalletRail = "bitcoin" | "lightning" | "evm" | "solana" | "internal";

export type Money = {
  amountMicros: string;
  currency: string;
};

export type WalletParty = {
  partyId: string;
  walletId: string;
  chain?: WalletRail;
  addressRef?: string;
};

export interface WalletAdapter {
  kind(): string;
  quoteTransfer(from: WalletParty, to: WalletParty, amount: Money): Promise<{ feeMicros: string }>;
  reserve(idempotencyKey: string, from: WalletParty, amount: Money): Promise<{ reservationId: string }>;
  transfer(
    idempotencyKey: string,
    from: WalletParty,
    to: WalletParty,
    amount: Money,
  ): Promise<{ txRef: string; finalized: boolean }>;
  release(reservationId: string): Promise<void>;
  getBalance(party: WalletParty): Promise<Money>;
}

export class WalletRegistry {
  private adapters: Map<string, WalletAdapter> = new Map();

  register(adapter: WalletAdapter): void {
    this.adapters.set(adapter.kind(), adapter);
  }

  get(kind: string): WalletAdapter | null {
    return this.adapters.get(kind) ?? null;
  }

  listKinds(): string[] {
    return [...this.adapters.keys()].sort();
  }
}
