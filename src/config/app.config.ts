import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.APP_PORT || '3000', 10),
  name: process.env.APP_NAME || 'EVzone API',
  apiPrefix: process.env.API_PREFIX || 'api',
  frontendInvestorUrl: process.env.FRONTEND_INVESTOR_URL || 'http://localhost:5173',
  frontendEntrepreneurUrl: process.env.FRONTEND_ENTREPRENEUR_URL || 'http://localhost:5174',
  frontendProviderUrl: process.env.FRONTEND_PROVIDER_URL || 'http://localhost:5175',
  frontendAdminUrl: process.env.FRONTEND_ADMIN_URL || 'http://localhost:5176',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  uploadMaxSize: parseInt(process.env.UPLOAD_MAX_SIZE || '10485760', 10),
  uploadDest: process.env.UPLOAD_DEST || './uploads',
  logLevel: process.env.LOG_LEVEL || 'debug',
}));
