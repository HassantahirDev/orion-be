import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { VoiceService } from './voice.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { IsString, IsOptional, IsIn } from 'class-validator';

class GeneratePromptDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  userName?: string;

  @IsOptional()
  @IsString()
  agentType?: string;
}

class StoreMessageDto {
  @IsString()
  sessionId: string;

  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  content: string;
}

class GenerateNameDto {
  @IsString()
  sessionId: string;

  @IsOptional()
  @IsString()
  lastUserMessage?: string;
}

@Controller('voice')
@UseGuards(JwtAuthGuard)
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  /**
   * Get enhanced system prompt for voice agent
   * POST /voice/prompt
   */
  @Post('prompt')
  async getEnhancedPrompt(
    @GetUser('id') userId: string,
    @Body() dto: GeneratePromptDto,
  ) {
    return this.voiceService.generateEnhancedPrompt(
      userId,
      dto.sessionId || null,
      dto.userName,
    );
  }

  /**
   * Get agent configuration (API key, agent ID, etc.)
   * GET /voice/config
   */
  @Get('config')
  async getAgentConfig(@Query('type') agentType: string = 'default') {
    return this.voiceService.getAgentConfig(agentType);
  }

  /**
   * Store voice message in session
   * POST /voice/message
   */
  @Post('message')
  async storeMessage(
    @GetUser('id') userId: string,
    @Body() dto: StoreMessageDto,
  ) {
    return this.voiceService.storeVoiceMessage(
      userId,
      dto.sessionId,
      dto.role,
      dto.content,
    );
  }

  /**
   * Check if conversation is complete
   * GET /voice/sessions/:sessionId/complete
   */
  @Get('sessions/:sessionId/complete')
  async checkComplete(@Param('sessionId') sessionId: string) {
    return this.voiceService.checkConversationComplete(sessionId);
  }

  /**
   * Generate conversation name
   * POST /voice/sessions/:sessionId/name
   */
  @Post('sessions/:sessionId/name')
  async generateName(
    @Param('sessionId') sessionId: string,
    @Body() dto: GenerateNameDto,
  ) {
    return this.voiceService.generateConversationName(
      sessionId,
      dto.lastUserMessage,
    );
  }
}

