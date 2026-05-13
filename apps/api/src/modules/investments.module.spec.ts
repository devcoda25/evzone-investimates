import { InvestmentStatus, PaymentMethod } from "@prisma/client";
import { InvestmentsService } from "./investments.module";

describe("InvestmentsService", () => {
  it("returns an existing investment for the same idempotency key", async () => {
    const existingInvestment = {
      id: "investment_1",
      tenantId: "tenant_1",
      investorUserId: "user_1",
      projectId: "project_1",
      amount: { toString: () => "500.00" },
      currency: "USD",
      status: InvestmentStatus.PENDING_COMPLIANCE,
      paymentMethod: PaymentMethod.CARD,
      idempotencyKey: "idem_1",
      confirmedAt: null,
      createdAt: new Date("2026-05-09T10:00:00.000Z"),
      updatedAt: new Date("2026-05-09T10:00:00.000Z"),
      project: {
        id: "project_1",
        title: "Solar Farm",
        slug: "solar-farm",
      },
      investor: {
        id: "user_1",
      },
    };
    const prisma = {
      investment: {
        findUnique: jest.fn().mockResolvedValue(existingInvestment),
      },
      project: {
        findUnique: jest.fn(),
      },
    };
    const service = new InvestmentsService(
      prisma as any,
      { run: jest.fn() } as any,
      { create: jest.fn() } as any,
      { isPlatformAdmin: jest.fn().mockReturnValue(false) } as any,
      { createCollectionIntent: jest.fn() } as any,
      { record: jest.fn(), recordFromRequest: jest.fn() } as any,
      { getIdempotency: jest.fn(), setIdempotency: jest.fn() } as any,
    );

    const result = await service.invest(
      {
        id: "user_1",
        email: "investor@example.com",
        firstName: "Ada",
        lastName: "Investor",
        role: "INVESTOR" as any,
        tenantId: "tenant_1",
        memberships: [{ tenantId: "tenant_1", role: "INVESTOR" as any }],
      },
      {
        projectId: "project_1",
        amount: 500,
        paymentMethod: PaymentMethod.CARD,
      } as any,
      "idem_1",
    );

    expect(prisma.investment.findUnique).toHaveBeenCalledWith({
      where: {
        investorUserId_idempotencyKey: {
          investorUserId: "user_1",
          idempotencyKey: "idem_1",
        },
      },
      include: { project: true, investor: true },
    });
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: "investment_1",
        amount: "500.00",
        idempotencyKey: "idem_1",
        project: {
          id: "project_1",
          title: "Solar Farm",
          slug: "solar-farm",
        },
      }),
    );
  });
});
