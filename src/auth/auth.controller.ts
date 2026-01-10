import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Delete,
  Param,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('api-keys')
  async createApiKey(
    @GetUser('id') userId: string,
    @Body() createApiKeyDto: CreateApiKeyDto,
  ) {
    return this.authService.createApiKey(userId, createApiKeyDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('api-keys')
  async getApiKeys(@GetUser('id') userId: string) {
    return this.authService.getUserApiKeys(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('api-keys/:id')
  async revokeApiKey(
    @GetUser('id') userId: string,
    @Param('id') apiKeyId: string,
  ) {
    return this.authService.revokeApiKey(userId, apiKeyId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@GetUser() user: any) {
    return user;
  }
}

