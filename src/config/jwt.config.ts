import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET || 'evzone-access-secret-change-me',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'evzone-refresh-secret-change-me',
  accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
  refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
  issuer: process.env.JWT_ISSUER || 'evzone-api',
  audience: process.env.JWT_AUDIENCE || 'evzone-apps',
}));
