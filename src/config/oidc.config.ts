import { registerAs } from '@nestjs/config';

export default registerAs('oidc', () => ({
  issuer: process.env.OIDC_ISSUER || 'http://localhost:3000/oidc',
  jwksUri: process.env.OIDC_JWKS_URI || 'http://localhost:3000/oidc/jwks',
  audience: process.env.OIDC_AUDIENCE || 'evzone-portal',
}));
