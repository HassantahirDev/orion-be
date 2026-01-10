import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryType } from '@prisma/client';

export interface CreateMemoryDto {
  type?: MemoryType;
  content: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class MemoryService {
  constructor(private prisma: PrismaService) {}

  async addMemory(sessionId: string, memoryDto: CreateMemoryDto) {
    return this.prisma.memory.create({
      data: {
        sessionId,
        type: memoryDto.type || MemoryType.CONTEXT,
        content: memoryDto.content,
        metadata: memoryDto.metadata || {},
      },
    });
  }

  async getContext(sessionId: string, limit = 50) {
    const memories = await this.prisma.memory.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return memories.reverse(); // Return in chronological order
  }

  async getMemoriesByType(
    sessionId: string,
    type: MemoryType,
    limit = 20,
  ) {
    return this.prisma.memory.findMany({
      where: {
        sessionId,
        type,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async deleteMemory(memoryId: string) {
    return this.prisma.memory.delete({
      where: { id: memoryId },
    });
  }

  async updateMemory(memoryId: string, content: string, metadata?: Record<string, any>) {
    return this.prisma.memory.update({
      where: { id: memoryId },
      data: {
        content,
        metadata: metadata || {},
      },
    });
  }
}

