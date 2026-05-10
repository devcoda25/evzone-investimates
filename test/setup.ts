import { Prisma, PrismaClient } from "@prisma/client";

function assertTestDatabase(): void {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const isTestDb =
    dbUrl.includes("test") ||
    dbUrl.includes("localhost") ||
    dbUrl.includes("127.0.0.1");
  if (!isTestDb) {
    throw new Error(
      `Refusing to run tests against non-test database: ${dbUrl.replace(/:\/\/[^:]+:[^@]+@/, "://***:***@")}`,
    );
  }
}

assertTestDatabase();

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
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") {
        // Table does not exist — safe to ignore during cleanup
        continue;
      }
      throw err;
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
