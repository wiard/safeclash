import type { UsageAtom } from "./usage-atom.ts";
import { validateAtom } from "./usage-atom.ts";
import type { Journal } from "./journal.ts";

export type IngestResult = {
  accepted: boolean;
  atomId: string;
  hash: string | null;
  errors: string[];
};

export class MeterIngest {
  private journal: Journal;

  constructor(journal: Journal) {
    this.journal = journal;
  }

  ingest(atom: UsageAtom): IngestResult {
    const validation = validateAtom(atom);
    if (!validation.valid) {
      return { accepted: false, atomId: atom.atomId, hash: null, errors: validation.errors };
    }

    const decision = atom.governanceRef.policyDecision;
    if (decision === "red" || decision === "never") {
      const { hash } = this.journal.append(atom);
      return { accepted: false, atomId: atom.atomId, hash, errors: [`blocked: ${decision}`] };
    }

    if (decision === "orange" && !atom.governanceRef.consentGranted) {
      const { hash } = this.journal.append(atom);
      return { accepted: false, atomId: atom.atomId, hash, errors: ["pending: consent required"] };
    }

    const { hash } = this.journal.append(atom);
    return { accepted: true, atomId: atom.atomId, hash, errors: [] };
  }
}
