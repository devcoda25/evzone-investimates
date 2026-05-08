import {
  assertBalancedLedgerDraft,
  isBalancedLedgerDraft,
} from "@evzone/common";

describe("ledger balance guard", () => {
  it("accepts equal debit and credit totals", () => {
    expect(
      isBalancedLedgerDraft([
        { direction: "DEBIT", amount: 125 },
        { direction: "CREDIT", amount: 125 },
      ]),
    ).toBe(true);
  });

  it("rejects unbalanced draft entries", () => {
    expect(() =>
      assertBalancedLedgerDraft([
        { direction: "DEBIT", amount: 125 },
        { direction: "CREDIT", amount: 124 },
      ]),
    ).toThrow("Ledger entries must balance");
  });
});
