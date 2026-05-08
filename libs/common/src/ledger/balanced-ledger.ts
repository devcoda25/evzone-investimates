export interface LedgerDraftEntry {
  direction: "DEBIT" | "CREDIT";
  amount: number;
}

export function isBalancedLedgerDraft(entries: LedgerDraftEntry[]): boolean {
  const totals = entries.reduce(
    (accumulator, entry) => {
      if (entry.direction === "DEBIT") {
        return { ...accumulator, debit: accumulator.debit + entry.amount };
      }
      return { ...accumulator, credit: accumulator.credit + entry.amount };
    },
    { debit: 0, credit: 0 },
  );
  return Math.abs(totals.debit - totals.credit) < 0.000001;
}

export function assertBalancedLedgerDraft(entries: LedgerDraftEntry[]): void {
  if (!isBalancedLedgerDraft(entries)) {
    throw new Error("Ledger entries must balance");
  }
}
