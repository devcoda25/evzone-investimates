import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { appConfig, databaseConfig, jwtConfig, oidcConfig, redisConfig, smtpConfig } from '@config/index';
import { DatabaseModule } from '@database/database.module';

import { AuthModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { ProjectsModule } from '@modules/projects/projects.module';
import { InvestmentsModule } from '@modules/investments/investments.module';
import { DueDiligenceModule } from '@modules/due-diligence/due-diligence.module';
import { AdminModule } from '@modules/admin/admin.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { MessagingModule } from '@modules/messaging/messaging.module';
import { DocumentsModule } from '@modules/documents/documents.module';
import { MailModule } from '@modules/mail/mail.module';
import { CacheModule } from '@modules/cache/cache.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, oidcConfig, redisConfig, smtpConfig],
      envFilePath: ['.env', '.env.local'],
    }),

    // Database
    DatabaseModule,

    // Rate Limiting
    ThrottlerModule.forRoot([{
      ttl: 60000, // 60 seconds
      limit: 100, // 100 requests per minute
    }]),

    // Static file serving for uploads
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),

    // Infrastructure Modules
    MailModule,
    CacheModule,

    // Domain Modules
    AuthModule,
    UsersModule,
    ProjectsModule,
    InvestmentsModule,
    DueDiligenceModule,
    AdminModule,
    NotificationsModule,
    MessagingModule,
    DocumentsModule,
  ],
})
export class AppModule {}
