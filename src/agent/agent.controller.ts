import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AgentService } from './agent.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';

export class PlanRequestDto {
  input: string;
  context?: string;
}

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('sessions/:sessionId/plan')
  @UseGuards(JwtAuthGuard)
  async plan(
    @Param('sessionId') sessionId: string,
    @Body() planRequest: PlanRequestDto,
  ) {
    return this.agentService.plan(
      sessionId,
      planRequest.input,
      planRequest.context,
    );
  }

  @Post('sessions/:sessionId/execute')
  @UseGuards(JwtAuthGuard)
  async execute(
    @Param('sessionId') sessionId: string,
    @Body() plan: any,
  ) {
    return this.agentService.executePlan(sessionId, plan);
  }
}

