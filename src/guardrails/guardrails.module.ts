import { Module } from '@nestjs/common';
import { GuardrailsService } from './guardrails.service';
import { GuardrailsController } from './guardrails.controller';

@Module({
  controllers: [GuardrailsController],
  providers: [GuardrailsService],
  exports: [GuardrailsService],
})
export class GuardrailsModule {}

