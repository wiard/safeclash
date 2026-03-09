import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { UsageAtom } from "./usage-atom.ts";
import { hashAtom } from "./usage-atom.ts";

export class Journal {
  private path: string;
  private lastHash: string | null = null;

  constructor(path: string) {
    this.path = path;
    if (existsSync(path)) {
      const lines = readFileSync(path, "utf-8").trim().split("\n").filter(Boolean);
      if (lines.length > 0) {
        const last = JSON.parse(lines[lines.length - 1]) as UsageAtom;
        this.lastHash = hashAtom(last);
      }
    }
  }

  append(atom: UsageAtom): { hash: string; lineNumber: number } {
    if (atom.prevAtomHash !== this.lastHash) {
      throw new Error(`Chain broken: expected prevAtomHash=${this.lastHash}, got ${atom.prevAtomHash}`);
    }
    appendFileSync(this.path, `${JSON.stringify(atom)}\n`, "utf-8");
    const hash = hashAtom(atom);
    this.lastHash = hash;
    const lineNumber = readFileSync(this.path, "utf-8").trim().split("\n").filter(Boolean).length;
    return { hash, lineNumber };
  }

  getLastHash(): string | null {
    return this.lastHash;
  }

  readAll(): UsageAtom[] {
    if (!existsSync(this.path)) {
      return [];
    }
    return readFileSync(this.path, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as UsageAtom);
  }

  verifyChain(): { valid: boolean; brokenAt: number | null } {
    const atoms = this.readAll();
    let prevHash: string | null = null;
    for (let i = 0; i < atoms.length; i += 1) {
      if (atoms[i].prevAtomHash !== prevHash) {
        return { valid: false, brokenAt: i };
      }
      prevHash = hashAtom(atoms[i]);
    }
    return { valid: true, brokenAt: null };
  }
}
