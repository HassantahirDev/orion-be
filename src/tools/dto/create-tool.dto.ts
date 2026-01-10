import { IsString, IsObject, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class CreateToolDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsObject()
  schema: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  rateLimit?: number;
}

