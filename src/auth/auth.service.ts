import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        password: hashedPassword,
        name: registerDto.name,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    return user;
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (user && (await bcrypt.compare(password, user.password))) {
      const { password: _, ...result } = user;
      return result;
    }

    return null;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { email: user.email, sub: user.id, role: user.role };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async createApiKey(userId: string, createApiKeyDto: CreateApiKeyDto) {
    const apiKey = `orion_${uuidv4()}_${Date.now()}`;

    const key = await this.prisma.apiKey.create({
      data: {
        key: apiKey,
        name: createApiKeyDto.name,
        userId,
        expiresAt: createApiKeyDto.expiresAt
          ? new Date(createApiKeyDto.expiresAt)
          : null,
      },
    });

    // Return full key only once for security
    return {
      id: key.id,
      name: key.name,
      key: apiKey, // Only returned on creation
      createdAt: key.createdAt,
      expiresAt: key.expiresAt,
    };
  }

  async getUserApiKeys(userId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return keys;
  }

  async revokeApiKey(userId: string, apiKeyId: string) {
    const key = await this.prisma.apiKey.findFirst({
      where: {
        id: apiKeyId,
        userId,
      },
    });

    if (!key) {
      throw new UnauthorizedException('API key not found');
    }

    return this.prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { isActive: false },
    });
  }
}

