import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuditModule } from "@evzone/audit";
import { JwtAuthGuard, RolesGuard } from "@evzone/auth";
import { configuration } from "@evzone/config";
import { PrismaModule } from "@evzone/database";
import { EventsModule } from "@evzone/events";
import { PermissionsModule } from "@evzone/permissions";
import { RedisModule } from "@evzone/redis";
import { StorageModule } from "@evzone/storage";
import { AdminModule } from "./modules/admin.module";
import { ApiAuthModule } from "./modules/auth.module";
import { DocumentsModule } from "./modules/documents.module";
import { DueDiligenceModule } from "./modules/due-diligence.module";
import { InvestmentsModule } from "./modules/investments.module";
import { MessagingModule } from "./modules/messaging.module";
import { NotificationsModule } from "./modules/notifications.module";
import { ProjectsModule } from "./modules/projects.module";
import { UsersModule } from "./modules/users.module";
import { DealsModule } from "./modules/deals.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configuration,
      envFilePath: [".env", ".env.local"],
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("jwt.accessSecret"),
        signOptions: {
          issuer: config.get<string>("jwt.issuer"),
          audience: config.get<string>("jwt.audience"),
        },
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    RedisModule,
    StorageModule,
    EventsModule,
    AuditModule,
    PermissionsModule,
    ApiAuthModule,
    UsersModule,
    ProjectsModule,
    DocumentsModule,
    InvestmentsModule,
    DueDiligenceModule,
    AdminModule,
    NotificationsModule,
    MessagingModule,
    DealsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
