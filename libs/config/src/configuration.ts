import { registerAs } from "@nestjs/config";
import { optionalBoolean, optionalNumber, optionalString } from "./env";

export const appConfig = registerAs("app", () => ({
  nodeEnv: optionalString(process.env.NODE_ENV, "development"),
  port: optionalNumber(process.env.APP_PORT, 3000),
  name: optionalString(process.env.APP_NAME, "EVzone API"),
  apiPrefix: optionalString(process.env.API_PREFIX, "api"),
  frontendInvestorUrl: optionalString(
    process.env.FRONTEND_INVESTOR_URL,
    "http://localhost:5173",
  ),
  frontendEntrepreneurUrl: optionalString(
    process.env.FRONTEND_ENTREPRENEUR_URL,
    "http://localhost:5174",
  ),
  frontendAssessorUrl: optionalString(
    process.env.FRONTEND_ASSESSOR_URL,
    "http://localhost:5175",
  ),
  frontendAdminUrl: optionalString(
    process.env.FRONTEND_ADMIN_URL,
    "http://localhost:5176",
  ),
  bcryptRounds: optionalNumber(process.env.BCRYPT_ROUNDS, 12),
  uploadMaxSize: optionalNumber(process.env.UPLOAD_MAX_SIZE, 10_485_760),
}));

export const jwtConfig = registerAs("jwt", () => ({
  accessSecret: optionalString(
    process.env.JWT_ACCESS_SECRET,
    "change-this-access-secret",
  ),
  refreshSecret: optionalString(
    process.env.JWT_REFRESH_SECRET,
    "change-this-refresh-secret",
  ),
  accessExpiration: optionalString(process.env.JWT_ACCESS_EXPIRATION, "15m"),
  refreshExpiration: optionalString(process.env.JWT_REFRESH_EXPIRATION, "7d"),
  issuer: optionalString(process.env.JWT_ISSUER, "evzone-api"),
  audience: optionalString(process.env.JWT_AUDIENCE, "evzone-apps"),
}));

export const kafkaConfig = registerAs("kafka", () => ({
  brokers: optionalString(process.env.KAFKA_BROKERS, "localhost:9092")
    .split(",")
    .map((broker) => broker.trim())
    .filter((broker) => broker.length > 0),
  clientId: optionalString(process.env.KAFKA_CLIENT_ID, "evzone-platform"),
  consumerGroup: optionalString(
    process.env.KAFKA_CONSUMER_GROUP,
    "evzone-worker-events",
  ),
}));

export const redisConfig = registerAs("redis", () => ({
  host: optionalString(process.env.REDIS_HOST, "localhost"),
  port: optionalNumber(process.env.REDIS_PORT, 6379),
  password:
    process.env.REDIS_PASSWORD && process.env.REDIS_PASSWORD.length > 0
      ? process.env.REDIS_PASSWORD
      : undefined,
  db: optionalNumber(process.env.REDIS_DB, 0),
}));

export const storageConfig = registerAs("storage", () => ({
  endpoint: optionalString(
    process.env.STORAGE_ENDPOINT,
    "http://localhost:9000",
  ),
  region: optionalString(process.env.STORAGE_REGION, "us-east-1"),
  bucket: optionalString(process.env.STORAGE_BUCKET, "evzone-assets"),
  accessKey: optionalString(process.env.STORAGE_ACCESS_KEY, "minioadmin"),
  secretKey: optionalString(process.env.STORAGE_SECRET_KEY, "minioadmin"),
  forcePathStyle: optionalBoolean(process.env.STORAGE_FORCE_PATH_STYLE, true),
  signedUrlTtlSeconds: optionalNumber(
    process.env.STORAGE_SIGNED_URL_TTL_SECONDS,
    900,
  ),
}));

export const kycConfig = registerAs("kyc", () => ({
  smileIdentityApiKey: optionalString(process.env.SMILE_IDENTITY_API_KEY, ""),
  smileIdentityPartnerId: optionalString(process.env.SMILE_IDENTITY_PARTNER_ID, ""),
  smileIdentityWebhookSecret: optionalString(process.env.SMILE_IDENTITY_WEBHOOK_SECRET, ""),
}));

export const configuration = [
  appConfig,
  jwtConfig,
  kafkaConfig,
  redisConfig,
  storageConfig,
  kycConfig,
];
