import { IsOptional, IsObject } from 'class-validator';

export class CreateSessionDto {
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

