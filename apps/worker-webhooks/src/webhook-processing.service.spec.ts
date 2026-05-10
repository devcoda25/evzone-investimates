import {
  PaymentProvider,
  PaymentStatus,
  WebhookProcessingStatus,
} from "@prisma/client";
import { WebhookProcessingService } from "./webhook-processing.service";

describe("WebhookProcessingService", () => {
  it("processes a verified collection webhook and emits an outbox event", async () => {
    const prisma = {
      paymentIntent: {
        findUnique: jest.fn().mockResolvedValue({
          id: "pi_1",
          tenantId: "tenant_1",
          provider: PaymentProvider.FLUTTERWAVE,
          providerTransactionId: "provider_tx_1",
          investmentId: "investment_1",
          amount: "2500.00",
          currency: "USD",
        }),
      },
      paymentWebhookEvent: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const tx = {
      paymentTransaction: {
        create: jest.fn().mockResolvedValue({
          id: "ptx_1",
          providerFeeAmount: null,
        }),
      },
      paymentIntent: {
        update: jest.fn().mockResolvedValue(undefined),
      },
      investment: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const transactions = {
      run: jest.fn().mockImplementation(async (handler: any) => handler(tx)),
    };
    const outbox = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    const flutterwave = {
      verifyCollection: jest.fn().mockResolvedValue({
        provider: PaymentProvider.FLUTTERWAVE,
        providerTransactionId: "provider_tx_1",
        providerReference: "ref_1",
        amount: "2500.00",
        currency: "USD",
        status: PaymentStatus.SUCCEEDED,
        providerFeeAmount: null,
        netAmount: "2500.00",
        rawResponse: { ok: true },
      }),
    };
    const paytota = {
      verifyCollection: jest.fn(),
    };
    const ledger = {
      postCollectionSuccess: jest.fn().mockResolvedValue(undefined),
      postReversal: jest.fn().mockResolvedValue(undefined),
    };

    const service = new WebhookProcessingService(
      prisma as any,
      transactions as any,
      outbox as any,
      flutterwave as any,
      paytota as any,
      ledger as any,
    );

    await service.processEvent({
      id: "webhook_1",
      provider: PaymentProvider.FLUTTERWAVE,
      payload: { data: { tx_ref: "pi_ref_1" } },
    });

    expect(prisma.paymentIntent.findUnique).toHaveBeenCalledWith({
      where: { internalReference: "pi_ref_1" },
    });
    expect(transactions.run).toHaveBeenCalledTimes(1);
    expect(ledger.postCollectionSuccess).toHaveBeenCalledTimes(1);
    expect(prisma.paymentWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: "webhook_1" },
      data: {
        processingStatus: WebhookProcessingStatus.PROCESSED,
        processedAt: expect.any(Date),
        errorMessage: null,
      },
    });
    expect(outbox.create).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        tenantId: "tenant_1",
        eventType: "payment.collection_succeeded",
        aggregateId: "pi_1",
      }),
    );
  });

  it("marks webhook events as failed when the intent reference is missing", async () => {
    const prisma = {
      paymentIntent: {
        findUnique: jest.fn(),
      },
      paymentWebhookEvent: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const service = new WebhookProcessingService(
      prisma as any,
      { run: jest.fn() } as any,
      { create: jest.fn() } as any,
      { verifyCollection: jest.fn() } as any,
      { verifyCollection: jest.fn() } as any,
      {
        postCollectionSuccess: jest.fn(),
        postReversal: jest.fn(),
      } as any,
    );

    await service.processEvent({
      id: "webhook_2",
      provider: PaymentProvider.FLUTTERWAVE,
      payload: { data: {} },
    });

    expect(prisma.paymentWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: "webhook_2" },
      data: {
        processingStatus: WebhookProcessingStatus.FAILED,
        errorMessage: "No intent reference found in payload",
      },
    });
  });
});
