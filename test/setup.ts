import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  // Clean up test data in reverse dependency order
  const tables = [
    "ledgerEntry",
    "ledgerAccount",
    "paymentTransaction",
    "paymentIntent",
    "transaction",
    "investment",
    "milestone",
    "mediaAsset",
    "document",
    "dueDiligenceTask",
    "dueDiligenceCase",
    "deal",
    "project",
    "auditLog",
    "complianceAlert",
    "complianceCase",
    "dispute",
    "governanceVoteCast",
    "governanceVote",
    "activityEvent",
    "watchlistItem",
    "paymentSchedule",
    "notification",
    "pushSubscription",
    "message",
    "aiChatMessage",
    "aiChatSession",
    "passwordResetToken",
    "refreshToken",
    "kycApplication",
    "kybApplication",
    "investorProfile",
    "entrepreneurProfile",
    "assessorProfile",
    "userTenantMembership",
    "user",
    "tenant",
    "outboxEvent",
  ];

  for (const table of tables) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      await (prisma as unknown as Record<string, { deleteMany: () => Promise<unknown> }>)[
        table
      ]?.deleteMany();
    } catch {
      // ignore cleanup errors for tables that may not exist in client
    }
  }
});

export { prisma };
