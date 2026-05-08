import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter';
import { TransformInterceptor } from '@common/interceptors/transform.interceptor';
import { LoggingInterceptor } from '@common/interceptors/logging.interceptor';
import { OidcAuthGuard } from '@common/guards/oidc-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);
  const apiPrefix = configService.get<string>('app.apiPrefix', 'api');
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');

  // Security
  app.use(helmet({
    contentSecurityPolicy: nodeEnv === 'production',
    crossOriginEmbedderPolicy: nodeEnv === 'production',
  }));

  // CORS
  const corsOrigins = [
    configService.get('app.frontendInvestorUrl'),
    configService.get('app.frontendEntrepreneurUrl'),
    configService.get('app.frontendAssessorUrl'),
    configService.get('app.frontendAdminUrl'),
  ].filter(Boolean);

  app.enableCors({
    origin: nodeEnv === 'production' ? corsOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // API Versioning & Prefix
  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  // Global guards, interceptors & filters
  const oidcGuard = app.get(OidcAuthGuard);
  const rolesGuard = app.get(RolesGuard);
  app.useGlobalGuards(oidcGuard, rolesGuard);
  app.useGlobalInterceptors(
    new TransformInterceptor(),
    new LoggingInterceptor(),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('EVzone Platform API')
    .setDescription(
      'Complete REST API for the EVzone Global Green Finance Platform. ' +
      'Serves 4 applications: Investor, Entrepreneur, Provider, and Admin. ' +
      'All endpoints require authentication unless marked as [Public].'
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'access-token'
    )
    .addServer('http://localhost:3001', 'Local development')
    .addServer('https://api.evzone.app', 'Production')
    .addTag('Auth', 'Authentication & Authorization')
    .addTag('Users', 'User management & profiles')
    .addTag('Projects', 'Green energy projects & campaigns')
    .addTag('Investments', 'Investments, portfolio & transactions')
    .addTag('Due Diligence', 'Provider engagements & verification')
    .addTag('Admin', 'Platform governance & oversight')
    .addTag('Notifications', 'In-app notifications')
    .addTag('Messages', 'Internal messaging')
    .addTag('Documents', 'File uploads & management')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(port);

  console.log(`\n=================================================`);
  console.log(`  EVzone API is running!`);
  console.log(`  Environment: ${nodeEnv}`);
  console.log(`  Port: ${port}`);
  console.log(`  API: http://localhost:${port}/${apiPrefix}`);
  console.log(`  Docs: http://localhost:${port}/docs`);
  console.log(`=================================================\n`);
}

bootstrap();
