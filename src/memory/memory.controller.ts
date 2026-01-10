import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  UseGuards,
  Query,
} from '@nestjs/common';
import { MemoryService } from './memory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MemoryType } from '@prisma/client';

@Controller('sessions/:sessionId/memory')
@UseGuards(JwtAuthGuard)
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Post()
  async addMemory(
    @Param('sessionId') sessionId: string,
    @Body() memoryDto: any,
  ) {
    return this.memoryService.addMemory(sessionId, memoryDto);
  }

  @Get()
  async getContext(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit?: string,
  ) {
    return this.memoryService.getContext(
      sessionId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('type/:type')
  async getByType(
    @Param('sessionId') sessionId: string,
    @Param('type') type: MemoryType,
    @Query('limit') limit?: string,
  ) {
    return this.memoryService.getMemoriesByType(
      sessionId,
      type,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Patch(':id')
  async updateMemory(
    @Param('id') id: string,
    @Body() updateDto: { content: string; metadata?: Record<string, any> },
  ) {
    return this.memoryService.updateMemory(id, updateDto.content, updateDto.metadata);
  }

  @Delete(':id')
  async deleteMemory(@Param('id') id: string) {
    return this.memoryService.deleteMemory(id);
  }
}

