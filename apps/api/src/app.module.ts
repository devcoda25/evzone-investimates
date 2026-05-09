import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
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
import { PaymentsModule } from "./modules/payments/payments.module";
import { WatchlistModule } from "./modules/watchlist.module";
import { ActivityModule } from "./modules/activity.module";
import { AiAdvisorModule } from "./modules/ai-advisor.module";
import { ComplianceModule } from "./modules/compliance.module";
import { VotesModule } from "./modules/votes.module";
import { MediaModule } from "./modules/media.module";
import { TenantsModule } from "./modules/tenants.module";

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
    TenantsModule,
    UsersModule,
    ProjectsModule,
    MediaModule,
    DocumentsModule,
    InvestmentsModule,
    DueDiligenceModule,
    AdminModule,
    ComplianceModule,
    NotificationsModule,
    MessagingModule,
    DealsModule,
    PaymentsModule,
    WatchlistModule,
    ActivityModule,
    AiAdvisorModule,
    VotesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
