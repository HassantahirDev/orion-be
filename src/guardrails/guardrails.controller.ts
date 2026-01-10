import { Controller, Get, Query, UseGuards, Param } from '@nestjs/common';
import { GuardrailsService } from './guardrails.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('guardrails')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GuardrailsController {
  constructor(private readonly guardrailsService: GuardrailsService) {}

  @Get('logs')
  @Roles(Role.ADMIN)
  getLogs(@Query('sessionId') sessionId?: string, @Query('limit') limit?: string) {
    return this.guardrailsService.getGuardrailLogs(
      sessionId,
      limit ? parseInt(limit, 10) : 100,
    );
  }
}

