import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { MemoryModule } from '../memory/memory.module';
import { GuardrailsModule } from '../guardrails/guardrails.module';
import { ToolsModule } from '../tools/tools.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
  imports: [MemoryModule, GuardrailsModule, ToolsModule, SessionsModule],
})
export class AgentModule {}

