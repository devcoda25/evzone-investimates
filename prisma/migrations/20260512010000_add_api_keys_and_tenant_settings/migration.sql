-- Add settings JSON column to Tenant
ALTER TABLE "Tenant"
ADD COLUMN "settings" JSONB;

-- Create ApiKey table
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- Create index on ApiKey.userId
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- Add foreign key from ApiKey to User
ALTER TABLE "ApiKey"
ADD CONSTRAINT "ApiKey_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
