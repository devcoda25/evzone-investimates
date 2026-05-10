import { Injectable, Logger } from "@nestjs/common";
import {
  LedgerDirection,
  LedgerOwnerType,
  PaymentIntent,
  PaymentTransaction,
  Payout,
  Prisma,
} from "@prisma/client";
import { assertBalancedLedgerDraft } from "@evzone/common";

export interface LedgerAccountInput {
  tenantId: string;
  ownerType: LedgerOwnerType;
  ownerId: string;
  currency: string;
  name: string;
}

export interface LedgerEntryInput {
  tenantId: string;
  accountId: string;
  transactionId?: string;
  direction: LedgerDirection;
  amount: Prisma.Decimal;
  currency: string;
  memo: string;
}

@Injectable()
export class LedgerPostingService {
  private readonly logger = new Logger(LedgerPostingService.name);

  async upsertAccount(
    tx: Prisma.TransactionClient,
    input: LedgerAccountInput,
  ): Promise<{ id: string }> {
    return tx.ledgerAccount.upsert({
      where: {
        tenantId_ownerType_ownerId_currency_name: {
          tenantId: input.tenantId,
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          currency: input.currency,
          name: input.name,
        },
      },
      create: {
        tenantId: input.tenantId,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        currency: input.currency,
        name: input.name,
      },
      update: {},
      select: { id: true },
    });
  }

  async postCollectionSuccess(
    tx: Prisma.TransactionClient,
    intent: PaymentIntent,
    paymentTx: PaymentTransaction,
  ): Promise<void> {
    const amount = new Prisma.Decimal(intent.amount);
    const fee = paymentTx.providerFeeAmount
      ? new Prisma.Decimal(paymentTx.providerFeeAmount)
      : new Prisma.Decimal(0);
    const netAmount = amount.minus(fee);
    const currency = intent.currency;
    const tenantId = intent.tenantId;
    const transactionId = paymentTx.id;

    const [investorPending, escrowLiability, escrowCash, feeExpense] =
      await Promise.all([
        this.upsertAccount(tx, {
          tenantId,
          ownerType: LedgerOwnerType.USER,
          ownerId: intent.userId ?? "unknown",
          currency,
          name: "Investor Cash Pending",
        }),
        this.upsertAccount(tx, {
          tenantId,
          ownerType: LedgerOwnerType.PROJECT,
          ownerId: intent.investmentId ?? "unknown",
          currency,
          name: "Escrow Liability",
        }),
        this.upsertAccount(tx, {
          tenantId,
          ownerType: LedgerOwnerType.TENANT,
          ownerId: tenantId,
          currency,
          name: "Escrow Cash",
        }),
        this.upsertAccount(tx, {
          tenantId,
          ownerType: LedgerOwnerType.PLATFORM,
          ownerId: "platform",
          currency,
          name: "Provider Fee Expense",
        }),
      ]);

    // Flow A: Collection succeeded
    // DR Escrow Cash (net), DR Fee Expense (fee)
    // CR Investor Cash Pending (gross), CR Escrow Liability (net)
    const entries = [
      {
        tenantId,
        accountId: escrowCash.id,
        transactionId,
        direction: LedgerDirection.DEBIT,
        amount: netAmount,
        currency,
        memo: "Cash received from payment provider",
      },
      {
        tenantId,
        accountId: feeExpense.id,
        transactionId,
        direction: LedgerDirection.DEBIT,
        amount: fee,
        currency,
        memo: "Payment provider fee",
      },
      {
        tenantId,
        accountId: investorPending.id,
        transactionId,
        direction: LedgerDirection.CREDIT,
        amount,
        currency,
        memo: "Clear investor pending commitment",
      },
      {
        tenantId,
        accountId: escrowLiability.id,
        transactionId,
        direction: LedgerDirection.CREDIT,
        amount: netAmount,
        currency,
        memo: "Realize escrow liability",
      },
    ];

    assertBalancedLedgerDraft(
      entries.map((e) => ({
        direction: e.direction as "DEBIT" | "CREDIT",
        amount: e.amount.toNumber(),
      })),
    );

    await tx.ledgerEntry.createMany({ data: entries });
    this.logger.log(
      `Posted collection ledger for intent ${intent.id}: gross=${amount.toString()}, fee=${fee.toString()}, net=${netAmount.toString()}`,
    );
  }

  async postPayoutSuccess(
    tx: Prisma.TransactionClient,
    payout: Payout,
    feeAmount?: Prisma.Decimal | null,
  ): Promise<void> {
    const amount = new Prisma.Decimal(payout.amount);
    const fee = feeAmount ? new Prisma.Decimal(feeAmount) : new Prisma.Decimal(0);
    const netAmount = amount.minus(fee);
    const currency = payout.currency;
    const tenantId = payout.tenantId;
    const transactionId = payout.id;

    const [escrowLiability, escrowCash, feeExpense] = await Promise.all([
      this.upsertAccount(tx, {
        tenantId,
        ownerType: LedgerOwnerType.PROJECT,
        ownerId: payout.userId ?? "unknown",
        currency,
        name: "Escrow Liability",
      }),
      this.upsertAccount(tx, {
        tenantId,
        ownerType: LedgerOwnerType.TENANT,
        ownerId: tenantId,
        currency,
        name: "Escrow Cash",
      }),
      this.upsertAccount(tx, {
        tenantId,
        ownerType: LedgerOwnerType.PLATFORM,
        ownerId: "platform",
        currency,
        name: "Provider Fee Expense",
      }),
    ]);

    // Flow B: Payout succeeded
    // DR Escrow Liability (gross), DR Fee Expense (fee)
    // CR Escrow Cash (net)
    const entries = [
      {
        tenantId,
        accountId: escrowLiability.id,
        transactionId,
        direction: LedgerDirection.DEBIT,
        amount,
        currency,
        memo: "Release escrow liability for payout",
      },
      {
        tenantId,
        accountId: feeExpense.id,
        transactionId,
        direction: LedgerDirection.DEBIT,
        amount: fee,
        currency,
        memo: "Payout provider fee",
      },
      {
        tenantId,
        accountId: escrowCash.id,
        transactionId,
        direction: LedgerDirection.CREDIT,
        amount: netAmount,
        currency,
        memo: "Cash paid out via provider",
      },
    ];

    assertBalancedLedgerDraft(
      entries.map((e) => ({
        direction: e.direction as "DEBIT" | "CREDIT",
        amount: e.amount.toNumber(),
      })),
    );

    await tx.ledgerEntry.createMany({ data: entries });
    this.logger.log(
      `Posted payout ledger for payout ${payout.id}: gross=${amount.toString()}, fee=${fee.toString()}, net=${netAmount.toString()}`,
    );
  }

  async postReversal(
    tx: Prisma.TransactionClient,
    intent: PaymentIntent,
  ): Promise<void> {
    const amount = new Prisma.Decimal(intent.amount);
    const currency = intent.currency;
    const tenantId = intent.tenantId;
    const transactionId = intent.id;

    const [investorPending, escrowLiability] = await Promise.all([
      this.upsertAccount(tx, {
        tenantId,
        ownerType: LedgerOwnerType.USER,
        ownerId: intent.userId ?? "unknown",
        currency,
        name: "Investor Cash Pending",
      }),
      this.upsertAccount(tx, {
        tenantId,
        ownerType: LedgerOwnerType.PROJECT,
        ownerId: intent.investmentId ?? "unknown",
        currency,
        name: "Escrow Liability",
      }),
    ]);

    // Flow C: Collection failed / cancelled
    // CR Investor Cash Pending (reverse), DR Escrow Liability (reverse)
    const entries = [
      {
        tenantId,
        accountId: investorPending.id,
        transactionId,
        direction: LedgerDirection.CREDIT,
        amount,
        currency,
        memo: "Reverse pending commitment due to payment failure",
      },
      {
        tenantId,
        accountId: escrowLiability.id,
        transactionId,
        direction: LedgerDirection.DEBIT,
        amount,
        currency,
        memo: "Reverse escrow liability due to payment failure",
      },
    ];

    assertBalancedLedgerDraft(
      entries.map((e) => ({
        direction: e.direction as "DEBIT" | "CREDIT",
        amount: e.amount.toNumber(),
      })),
    );

    await tx.ledgerEntry.createMany({ data: entries });
    this.logger.log(
      `Posted reversal ledger for intent ${intent.id}: amount=${amount.toString()}`,
    );
  }

  async getAccountBalance(
    tx: Prisma.TransactionClient,
    accountId: string,
  ): Promise<Prisma.Decimal> {
    const result = await tx.ledgerEntry.groupBy({
      by: ["direction"],
      where: { accountId },
      _sum: { amount: true },
    });

    let debit = new Prisma.Decimal(0);
    let credit = new Prisma.Decimal(0);

    for (const row of result) {
      if (row.direction === LedgerDirection.DEBIT) {
        debit = new Prisma.Decimal(row._sum.amount ?? 0);
      } else {
        credit = new Prisma.Decimal(row._sum.amount ?? 0);
      }
    }

    // Balance = Debits - Credits (asset/expense accounts)
    // For liability accounts, negative balance means positive liability
    return debit.minus(credit);
  }
}
