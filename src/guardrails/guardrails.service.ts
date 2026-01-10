import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GuardrailAction, GuardrailLog } from '@prisma/client';

@Injectable()
export class GuardrailsService {
  private readonly logger = new Logger(GuardrailsService.name);
  private readonly enabled: boolean;
  private readonly piiMaskingEnabled: boolean;

  // Common prompt injection patterns
  private readonly promptInjectionPatterns = [
    /ignore\s+(previous|above|all)\s+instructions?/i,
    /system\s*:\s*(you are|act as|pretend)/i,
    /<\|(im_start|system|user)\|>/i,
    /\{.*(system|instruction|prompt).*\}/i,
    /(?:roleplay|jailbreak|override|bypass)/i,
    /tell me your (instructions|prompts?|system)/i,
  ];

  // PII patterns
  private readonly piiPatterns = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  };

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.enabled =
      this.configService.get<string>('ENABLE_GUARDRAILS') !== 'false';
    this.piiMaskingEnabled =
      this.configService.get<string>('PII_MASKING_ENABLED') !== 'false';
  }

  async validateInput(
    input: string,
    sessionId?: string,
  ): Promise<{ allowed: boolean; action: GuardrailAction; maskedInput?: string; reason?: string }> {
    if (!this.enabled) {
      return { allowed: true, action: GuardrailAction.ALLOW };
    }

    // Check for prompt injection
    const injectionMatch = this.promptInjectionPatterns.find((pattern) =>
      pattern.test(input),
    );

    if (injectionMatch) {
      await this.logGuardrail(
        sessionId,
        'prompt_injection_detection',
        GuardrailAction.BLOCK,
        input,
        'Prompt injection pattern detected',
      );

      return {
        allowed: false,
        action: GuardrailAction.BLOCK,
        reason: 'Potential prompt injection detected',
      };
    }

    // PII masking removed - emails and other PII are now allowed

    // Basic input validation
    if (input.length > 10000) {
      await this.logGuardrail(
        sessionId,
        'input_length_limit',
        GuardrailAction.BLOCK,
        input.substring(0, 100),
        `Input exceeds maximum length: ${input.length} characters`,
      );

      return {
        allowed: false,
        action: GuardrailAction.BLOCK,
        reason: 'Input exceeds maximum length',
      };
    }

    // Check for malicious content (basic)
    const maliciousPatterns = [
      /<script[^>]*>/gi,  // Any script tag opening
      /<\/script>/gi,     // Script closing tag
      /javascript:/gi,
      /on\w+\s*=/gi,      // Event handlers like onclick=
      /<iframe/gi,        // Iframe injection
      /eval\s*\(/gi,      // eval function
    ];

    const hasMaliciousContent = maliciousPatterns.some((pattern) =>
      pattern.test(input),
    );

    if (hasMaliciousContent) {
      await this.logGuardrail(
        sessionId,
        'malicious_content_detection',
        GuardrailAction.BLOCK,
        input.substring(0, 100),
        'Malicious content detected',
      );

      return {
        allowed: false,
        action: GuardrailAction.BLOCK,
        reason: 'Malicious content detected',
      };
    }

    return {
      allowed: true,
      action: GuardrailAction.ALLOW,
    };
  }

  async validateOutput(output: string, sessionId?: string): Promise<boolean> {
    if (!this.enabled) {
      return true;
    }

    // Check output length
    if (output.length > 50000) {
      await this.logGuardrail(
        sessionId,
        'output_length_limit',
        GuardrailAction.FILTER,
        output.substring(0, 100),
        `Output exceeds maximum length: ${output.length} characters`,
      );
      return false;
    }

    // Filter out any leaked system prompts or internal information
    const leakPatterns = [
      /API[_\s]?KEY/i,
      /SECRET/i,
      /PASSWORD/i,
      /TOKEN/i,
      /system\s*:\s*you\s+are/i,
      /<\|im_start\|>/i,
      /<\|system\|>/i,
    ];

    const hasLeak = leakPatterns.some((pattern) => pattern.test(output));
    if (hasLeak) {
      await this.logGuardrail(
        sessionId,
        'information_leak_detection',
        GuardrailAction.FILTER,
        output.substring(0, 100),
        'Potential information leak detected in output',
      );
      return false;
    }

    // Filter potentially harmful instructions
    const harmfulPatterns = [
      /(?:how to|instructions for).*(hack|crack|bypass|exploit)/i,
      /(?:create|make|build).*(virus|malware|ransomware|bomb|weapon)/i,
      /(?:illegal|unlawful).*(activity|action|method)/i,
    ];

    const isHarmful = harmfulPatterns.some((pattern) => pattern.test(output));
    if (isHarmful) {
      await this.logGuardrail(
        sessionId,
        'harmful_content_detection',
        GuardrailAction.FILTER,
        output.substring(0, 100),
        'Potentially harmful content detected in output',
      );
      return false;
    }

    return true;
  }

  private async logGuardrail(
    sessionId: string | undefined,
    rule: string,
    action: GuardrailAction,
    input: string | undefined,
    reason: string,
    metadata?: Record<string, any>,
  ): Promise<GuardrailLog> {
    return this.prisma.guardrailLog.create({
      data: {
        sessionId,
        rule,
        action,
        input: input?.substring(0, 500), // Limit input length in logs
        reason,
        metadata,
      },
    });
  }

  async getGuardrailLogs(sessionId?: string, limit = 100) {
    return this.prisma.guardrailLog.findMany({
      where: sessionId ? { sessionId } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

