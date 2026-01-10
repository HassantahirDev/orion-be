import {
  Controller,
  Post,
  Body,
  UseGuards,
  Query,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EmailService } from './email.service';
import { SendEmailDto, SendNotificationDto } from './dto/send-email.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('email')
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('send')
  @UseGuards(JwtAuthGuard)
  async sendEmail(
    @GetUser('id') userId: string,
    @Body() sendEmailDto: SendEmailDto,
  ) {
    return this.emailService.sendEmail(sendEmailDto);
  }

  @Post('notification')
  @UseGuards(JwtAuthGuard)
  async sendNotification(
    @GetUser('id') userId: string,
    @Body() sendNotificationDto: SendNotificationDto,
  ) {
    return this.emailService.sendNotification(sendNotificationDto);
  }

  // Internal endpoint for tool execution (validates via session ID)
  @Post('internal/notification')
  async sendNotificationInternal(
    @Query('sessionId') sessionId: string | string[],
    @Body() sendNotificationDto: any,
  ) {
    this.logger.debug(`Email notification request - sessionId: ${sessionId}`, sendNotificationDto);

    // Handle array of sessionIds (take first one)
    const cleanSessionId = Array.isArray(sessionId) 
      ? sessionId[0] 
      : String(sessionId).split(',')[0].split('?')[0].split('&')[0].trim();

    if (!cleanSessionId) {
      throw new BadRequestException('Session ID is required for internal email notifications');
    }

    // Validate session exists
    const session = await this.prisma.session.findUnique({
      where: { id: cleanSessionId },
    });

    if (!session) {
      this.logger.warn(`Session not found: ${cleanSessionId} (original: ${sessionId})`);
      throw new BadRequestException(`Invalid session ID: ${cleanSessionId}`);
    }

    this.logger.debug(`Session validated: ${cleanSessionId}`);

    // Validate required fields
    if (!sendNotificationDto.to) {
      throw new BadRequestException('Recipient email (to) is required');
    }
    if (!sendNotificationDto.subject) {
      throw new BadRequestException('Subject is required');
    }
    if (!sendNotificationDto.message) {
      throw new BadRequestException('Message is required');
    }

    // Send notification
    return this.emailService.sendNotification(sendNotificationDto);
  }
}

