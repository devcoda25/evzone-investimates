import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanDatabase(): Promise<void> {
  // Clean up test data in reverse dependency order
  const tables = [
    "ledgerEntry",
    "ledgerAccount",
    "paymentTransaction",
    "paymentIntent",
    "paymentWebhookEvent",
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
    "notificationDispatch",
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
      await (
        prisma as unknown as Record<
          string,
          { deleteMany: () => Promise<unknown> }
        >
      )[table]?.deleteMany();
    } catch {
      // ignore cleanup errors for tables that may not exist in client
    }
  }
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await cleanDatabase();
});

afterEach(async () => {
  await cleanDatabase();
});

export { cleanDatabase, prisma };
