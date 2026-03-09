export type Utxo = {
  txid: string;
  vout: number;
  satoshis: number;
  address: string;
  spent: boolean;
};

export type UtxoGatePolicy = {
  minimumUnspentSats: number;
  requiredAddressPrefix?: string;
};

export type UtxoGateResult = {
  allowed: boolean;
  reason: string;
  matchedUtxoRefs: string[];
  totalUnspentSats: number;
};

export function evaluateUtxoGate(utxos: Utxo[], policy: UtxoGatePolicy): UtxoGateResult {
  const candidate = utxos.filter((utxo) => {
    if (utxo.spent) {
      return false;
    }
    if (policy.requiredAddressPrefix && !utxo.address.startsWith(policy.requiredAddressPrefix)) {
      return false;
    }
    return true;
  });

  const totalUnspentSats = candidate.reduce((acc, utxo) => acc + utxo.satoshis, 0);
  const matchedUtxoRefs = candidate
    .map((utxo) => `${utxo.txid}:${utxo.vout}`)
    .sort((left, right) => left.localeCompare(right));

  if (totalUnspentSats < policy.minimumUnspentSats) {
    return {
      allowed: false,
      reason: "insufficient unspent sats",
      matchedUtxoRefs,
      totalUnspentSats,
    };
  }

  return {
    allowed: true,
    reason: "ok",
    matchedUtxoRefs,
    totalUnspentSats,
  };
}
