import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { Receipt } from "./receipt.ts";
import { hashReceipt } from "./receipt.ts";

export class ReceiptJournal {
  private path: string;
  private lastHash: string | null = null;

  constructor(path: string) {
    this.path = path;
    if (existsSync(path)) {
      const lines = readFileSync(path, "utf-8").trim().split("\n").filter(Boolean);
      if (lines.length > 0) {
        this.lastHash = hashReceipt(JSON.parse(lines[lines.length - 1]) as Receipt);
      }
    }
  }

  append(receipt: Receipt): { hash: string } {
    if (receipt.prevReceiptHash !== this.lastHash) {
      throw new Error(`Chain broken: expected prevReceiptHash=${this.lastHash}, got ${receipt.prevReceiptHash}`);
    }
    appendFileSync(this.path, `${JSON.stringify(receipt)}\n`, "utf-8");
    const hash = hashReceipt(receipt);
    this.lastHash = hash;
    return { hash };
  }

  readAll(): Receipt[] {
    if (!existsSync(this.path)) {
      return [];
    }
    return readFileSync(this.path, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Receipt);
  }

  getLastHash(): string | null {
    return this.lastHash;
  }

  verifyChain(): { valid: boolean; brokenAt: number | null } {
    const receipts = this.readAll();
    let prevHash: string | null = null;
    for (let i = 0; i < receipts.length; i += 1) {
      if (receipts[i].prevReceiptHash !== prevHash) {
        return { valid: false, brokenAt: i };
      }
      prevHash = hashReceipt(receipts[i]);
    }
    return { valid: true, brokenAt: null };
  }
}
