import { createHash } from "node:crypto";

function hashPair(left: string, right: string): string {
  return createHash("sha256").update(left + right).digest("hex");
}

export function merkleRoot(hashes: string[]): string {
  if (hashes.length === 0) {
    return createHash("sha256").update("empty").digest("hex");
  }
  if (hashes.length === 1) {
    return hashes[0];
  }

  const next: string[] = [];
  for (let i = 0; i < hashes.length; i += 2) {
    const left = hashes[i];
    const right = i + 1 < hashes.length ? hashes[i + 1] : left;
    next.push(hashPair(left, right));
  }
  return merkleRoot(next);
}

export function merkleProof(hashes: string[], index: number): string[] {
  if (hashes.length <= 1) {
    return [];
  }

  const proof: string[] = [];
  let level = [...hashes];
  let idx = index;

  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      next.push(hashPair(left, right));
      if (i === idx || i + 1 === idx) {
        proof.push(i === idx ? (i + 1 < level.length ? level[i + 1] : left) : level[i]);
      }
    }
    idx = Math.floor(idx / 2);
    level = next;
  }

  return proof;
}

export function verifyMerkleProof(hash: string, proof: string[], root: string, index: number): boolean {
  let current = hash;
  let idx = index;
  for (const sibling of proof) {
    if (idx % 2 === 0) {
      current = hashPair(current, sibling);
    } else {
      current = hashPair(sibling, current);
    }
    idx = Math.floor(idx / 2);
  }
  return current === root;
}
