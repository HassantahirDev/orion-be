import { IsString, IsEmail, IsOptional, IsArray } from 'class-validator';

export class SendEmailDto {
  @IsEmail({}, { each: true })
  to: string | string[];

  @IsString()
  subject: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  html?: string;

  @IsOptional()
  @IsEmail({}, { each: true })
  cc?: string | string[];

  @IsOptional()
  @IsEmail({}, { each: true })
  bcc?: string | string[];

  @IsOptional()
  @IsEmail()
  from?: string;
}

export class SendNotificationDto {
  @IsEmail({}, { each: true })
  to: string | string[];

  @IsString()
  subject: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  html?: string;
}

