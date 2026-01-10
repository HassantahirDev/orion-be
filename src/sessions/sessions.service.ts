import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SessionStatus, EventType } from '@prisma/client';

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createSessionDto: CreateSessionDto) {
    return this.prisma.session.create({
      data: {
        userId,
        metadata: createSessionDto.metadata || {},
        status: SessionStatus.ACTIVE,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  }

  async findAll(userId: string, role: string) {
    const where = role === 'ADMIN' ? {} : { userId };

    return this.prisma.session.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        _count: {
          select: {
            memories: true,
            toolExecutions: true,
            events: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string, role: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        memories: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        toolExecutions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        events: {
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (role !== 'ADMIN' && session.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return session;
  }

  async updateStatus(
    id: string,
    status: SessionStatus,
    userId: string,
    role: string,
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (role !== 'ADMIN' && session.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.session.update({
      where: { id },
      data: {
        status,
        ...(status === SessionStatus.ENDED ? { endedAt: new Date() } : {}),
      },
    });
  }

  async addEvent(
    sessionId: string,
    type: EventType,
    data: Record<string, any>,
  ) {
    return this.prisma.sessionEvent.create({
      data: {
        sessionId,
        type,
        data,
      },
    });
  }

  async getSessionMemory(sessionId: string) {
    const memories = await this.prisma.memory.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });

    return memories;
  }

  async updateName(
    id: string,
    name: string,
    userId: string,
    role: string,
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (role !== 'ADMIN' && session.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const currentMetadata = (session.metadata as any) || {};

    return this.prisma.session.update({
      where: { id },
      data: {
        metadata: {
          ...currentMetadata,
          name,
          updated_at: new Date().toISOString(),
        },
      },
    });
  }

  async delete(id: string, userId: string, role: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (role !== 'ADMIN' && session.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    await this.prisma.session.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Session deleted successfully',
    };
  }
}

