import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { SessionStatus } from '@prisma/client';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @GetUser('id') userId: string,
    @Body() createSessionDto: CreateSessionDto,
  ) {
    return this.sessionsService.create(userId, createSessionDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@GetUser() user: any) {
    return this.sessionsService.findAll(user.id, user.role);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @GetUser() user: any) {
    return this.sessionsService.findOne(id, user.id, user.role);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  updateStatus(
    @Param('id') id: string,
    @Query('status') status: SessionStatus,
    @GetUser() user: any,
  ) {
    return this.sessionsService.updateStatus(id, status, user.id, user.role);
  }

  @Patch(':id/name')
  @UseGuards(JwtAuthGuard)
  updateName(
    @Param('id') id: string,
    @Body('name') name: string,
    @GetUser() user: any,
  ) {
    return this.sessionsService.updateName(id, name, user.id, user.role);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  delete(@Param('id') id: string, @GetUser() user: any) {
    return this.sessionsService.delete(id, user.id, user.role);
  }

  @Get(':id/memory')
  @UseGuards(JwtAuthGuard)
  getMemory(@Param('id') id: string) {
    return this.sessionsService.getSessionMemory(id);
  }
}

