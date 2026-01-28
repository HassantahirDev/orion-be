import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SessionsModule } from './sessions/sessions.module';
import { GuardrailsModule } from './guardrails/guardrails.module';
import { AgentModule } from './agent/agent.module';
import { ToolsModule } from './tools/tools.module';
import { MemoryModule } from './memory/memory.module';
import { WebsocketModule } from './websocket/websocket.module';
import { LoggerModule } from './common/logger/logger.module';
import { VoiceModule } from './voice/voice.module';
import { EmailModule } from './email/email.module';
import { SpotifyPredictorModule } from './spotify-predictor/spotify-predictor.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
    PrismaModule,
    LoggerModule,
    AuthModule,
    UsersModule,
    SessionsModule,
    GuardrailsModule,
    AgentModule,
    ToolsModule,
    MemoryModule,
    WebsocketModule,
    VoiceModule,
    EmailModule,
    SpotifyPredictorModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

