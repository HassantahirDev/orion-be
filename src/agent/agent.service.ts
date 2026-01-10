import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryService } from '../memory/memory.service';
import { GuardrailsService } from '../guardrails/guardrails.service';
import { ToolsService } from '../tools/tools.service';
import { SessionsService } from '../sessions/sessions.service';

export interface AgentPlan {
  steps: AgentStep[];
  reasoning: string;
}

export interface AgentStep {
  action: string;
  tool?: string;
  parameters?: Record<string, any>;
  reasoning: string;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private openai: OpenAI;
  private anthropic: Anthropic;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private memoryService: MemoryService,
    private guardrailsService: GuardrailsService,
    private toolsService: ToolsService,
    private sessionsService: SessionsService,
  ) {
    const openaiKey = this.configService.get<string>('OPENAI_API_KEY');
    const anthropicKey = this.configService.get<string>('ANTHROPIC_API_KEY');

    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
    }

    if (anthropicKey) {
      this.anthropic = new Anthropic({ apiKey: anthropicKey });
    }
  }

  async plan(
    sessionId: string,
    userInput: string,
    context?: string,
    storeMemory: boolean = true, // Add flag to control memory storage
  ): Promise<AgentPlan> {
    // Validate input with guardrails
    const guardrailResult = await this.guardrailsService.validateInput(
      userInput,
      sessionId,
    );

    if (!guardrailResult.allowed) {
      throw new Error(`Input blocked by guardrails: ${guardrailResult.reason}`);
    }

    const input = guardrailResult.maskedInput || userInput;

    // Get session context
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    // Get relevant memories
    const memories = await this.memoryService.getContext(sessionId);

    // Get available tools
    const availableTools = await this.toolsService.findAll();

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(availableTools, memories);

    try {
      // Use OpenAI or Anthropic for planning
      const response = await this.generatePlan(input, systemPrompt, context);

      // Parse response into plan
      const plan = this.parsePlan(response);

      // Store planning event
      await this.sessionsService.addEvent(sessionId, 'AGENT_PLAN', {
        input,
        plan,
      });

      // Store memory only if requested (skip when called from WebSocket)
      if (storeMemory) {
        await this.memoryService.addMemory(sessionId, {
          type: 'CONTEXT',
          content: `User request: ${input}`,
          metadata: { planId: plan.steps.length },
        });
      }

      return plan;
    } catch (error) {
      this.logger.error(`Planning error: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async generatePlan(
    userInput: string,
    systemPrompt: string,
    context?: string,
  ): Promise<string> {
    const prompt = `User input: ${userInput}
${context ? `Context: ${context}` : ''}

Please create a step-by-step plan to accomplish this task. For each step, specify:
1. The action to take
2. If a tool is needed, which tool and its parameters
3. The reasoning for this step

Format your response as JSON with this structure:
{
  "reasoning": "overall reasoning",
  "steps": [
    {
      "action": "description of action",
      "tool": "tool name if needed",
      "parameters": {},
      "reasoning": "why this step"
    }
  ]
}`;

    if (this.openai) {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      return completion.choices[0].message.content || '';
    } else if (this.anthropic) {
      const message = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });

      return message.content[0].type === 'text'
        ? message.content[0].text
        : '';
    } else {
      throw new Error('No LLM provider configured');
    }
  }

  private parsePlan(response: string): AgentPlan {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback parsing
      return {
        reasoning: 'Failed to parse plan',
        steps: [
          {
            action: 'respond_to_user',
            reasoning: 'Error parsing agent plan',
          },
        ],
      };
    } catch (error) {
      this.logger.error(`Plan parsing error: ${error.message}`);
      return {
        reasoning: 'Error parsing plan',
        steps: [
          {
            action: 'respond_to_user',
            reasoning: 'Error parsing agent plan',
          },
        ],
      };
    }
  }

  private buildSystemPrompt(tools: any[], memories: any[]): string {
    const toolsDescription = tools
      .filter((t) => t.isActive)
      .map((t) => {
        const schema = t.schema as any;
        
        // Extract only parameter names for clarity
        let params: string[] = [];
        if (schema.type === 'http') {
          if (schema.bodyParams && Array.isArray(schema.bodyParams)) {
            params.push(...schema.bodyParams);
          }
          if (schema.queryParams && Array.isArray(schema.queryParams)) {
            // Skip auto-added params like sessionId
            const filteredQueryParams = schema.queryParams.filter((p: string) => p !== 'sessionId');
            params.push(...filteredQueryParams);
          }
        } else if (schema.parameters) {
          params = Object.keys(schema.parameters);
        }

        const paramsList = params.length > 0 ? `\n  Required parameters: ${params.join(', ')}` : '';
        
        return `- ${t.name}: ${t.description}${paramsList}`;
      })
      .join('\n');

    const recentMemories = memories
      .slice(0, 10)
      .map((m) => `- ${m.content}`)
      .join('\n');

    return `You are an AI agent that plans multi-step tasks for a voice AI system.

Available tools:
${toolsDescription || 'No tools available'}

Recent context:
${recentMemories || 'No recent context'}

Your job is to:
1. Understand the user's request
2. Break it down into executable steps
3. Identify which tools (if any) are needed for each step
4. Provide clear reasoning for each step

IMPORTANT RULES:
- Use the EXACT tool name from the "Available tools" list above (case-sensitive)
- If no tool is needed, set "tool" to null (not "None", not empty string)
- In "parameters", ONLY include the required parameter values as key-value pairs
- For send_email_notification: provide "to" (email), "subject" (string), "message" (string)
- Do NOT include schema metadata (url, type, method, headers, bodyParams, queryParams) in parameters

Example:
{
  "steps": [{
    "action": "Send email to user",
    "tool": "send_email_notification",
    "parameters": {
      "to": "user@example.com",
      "subject": "Hello",
      "message": "This is a test"
    }
  }]
}

Be concise and actionable.`;
  }

  async executePlan(sessionId: string, plan: AgentPlan): Promise<any[]> {
    const results = [];

    for (const step of plan.steps) {
      try {
        let result;

        // Validate tool name if provided
        if (step.tool) {
          const toolName = step.tool.trim();
          
          // Skip if tool is null, undefined, empty, or "None"
          if (!toolName || toolName === 'None' || toolName === 'null' || toolName === 'undefined') {
            this.logger.warn(`Skipping step with invalid tool name: "${toolName}"`);
            result = await this.generateResponse(step, sessionId);
          } else {
          // Execute tool
          result = await this.toolsService.execute(
            sessionId,
              toolName,
            step.parameters || {},
          );
          }
        } else {
          // Generate response or perform action
          result = await this.generateResponse(step, sessionId);
        }

        results.push({
          step,
          result,
          success: true,
        });
      } catch (error) {
        this.logger.error(`Step execution error: ${error.message}`, error.stack);
        results.push({
          step,
          result: { error: error.message },
          success: false,
        });
      }
    }

    return results;
  }

  private async generateResponse(
    step: AgentStep,
    sessionId: string,
  ): Promise<string> {
    // Generate natural language response using LLM
    if (this.openai) {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful voice assistant. Provide clear, concise responses.',
          },
          {
            role: 'user',
            content: `Action: ${step.action}\nReasoning: ${step.reasoning}\n\nGenerate an appropriate response.`,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      return completion.choices[0].message.content || '';
    } else if (this.anthropic) {
      const message = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        system:
          'You are a helpful voice assistant. Provide clear, concise responses.',
        messages: [
          {
            role: 'user',
            content: `Action: ${step.action}\nReasoning: ${step.reasoning}\n\nGenerate an appropriate response.`,
          },
        ],
      });

      return message.content[0].type === 'text'
        ? message.content[0].text
        : '';
    }

    return `I understand you want me to ${step.action}`;
  }
}

