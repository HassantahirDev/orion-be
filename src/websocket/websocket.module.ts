import { Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { AgentModule } from '../agent/agent.module';
import { SessionsModule } from '../sessions/sessions.module';
import { GuardrailsModule } from '../guardrails/guardrails.module';
import { MemoryModule } from '../memory/memory.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AgentModule,
    SessionsModule,
    GuardrailsModule,
    MemoryModule,
    AuthModule,
  ],
  providers: [WebsocketGateway],
  exports: [WebsocketGateway],
})
export class WebsocketModule {}

