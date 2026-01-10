import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateToolDto } from './dto/create-tool.dto';
import { SessionsService } from '../sessions/sessions.service';
import { ExecutionStatus } from '@prisma/client';
import axios from 'axios';

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);

  constructor(
    private prisma: PrismaService,
    private sessionsService: SessionsService,
  ) {}

  async create(createToolDto: CreateToolDto) {
    return this.prisma.tool.create({
      data: createToolDto,
    });
  }

  async findAll() {
    return this.prisma.tool.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const tool = await this.prisma.tool.findUnique({
      where: { id },
    });

    if (!tool) {
      throw new NotFoundException('Tool not found');
    }

    return tool;
  }

  async execute(
    sessionId: string,
    toolName: string,
    parameters: Record<string, any>,
  ): Promise<any> {
    const tool = await this.prisma.tool.findUnique({
      where: { name: toolName },
    });

    if (!tool || !tool.isActive) {
      throw new NotFoundException(`Tool "${toolName}" not found or inactive`);
    }

    // Create execution record
    const execution = await this.prisma.toolExecution.create({
      data: {
        sessionId,
        toolName,
        input: parameters,
        status: ExecutionStatus.RUNNING,
      },
    });

    const startTime = Date.now();

    try {
      // Execute tool based on schema
      const result = await this.executeTool(tool, parameters, sessionId);

      const duration = Date.now() - startTime;

      // Update execution record
      await this.prisma.toolExecution.update({
        where: { id: execution.id },
        data: {
          output: result,
          status: ExecutionStatus.COMPLETED,
          duration,
          completedAt: new Date(),
        },
      });

      // Log event
      await this.sessionsService.addEvent(sessionId, 'TOOL_CALL', {
        tool: toolName,
        input: parameters,
        output: result,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.prisma.toolExecution.update({
        where: { id: execution.id },
        data: {
          status: ExecutionStatus.FAILED,
          error: error.message,
          duration,
          completedAt: new Date(),
        },
      });

      this.logger.error(`Tool execution failed: ${error.message}`);
      throw error;
    }
  }

  private async executeTool(
    tool: any,
    parameters: Record<string, any>,
    sessionId?: string,
  ): Promise<any> {
    // Check tool schema for execution type
    const schema = tool.schema as any;

    // Inject sessionId into parameters if available
    if (sessionId && !parameters.sessionId) {
      parameters.sessionId = sessionId;
    }

    if (schema.type === 'http') {
      // HTTP-based tool
      return this.executeHttpTool(schema, parameters);
    } else if (schema.type === 'function') {
      // JavaScript function tool
      return this.executeFunctionTool(schema, parameters);
    } else {
      throw new Error(`Unsupported tool type: ${schema.type}`);
    }
  }

  private async executeHttpTool(schema: any, parameters: Record<string, any>): Promise<any> {
    const { method = 'GET', url, headers = {}, queryParams = {}, bodyParams = [] } = schema;

    // Replace URL parameters
    let finalUrl = url;
    if (parameters) {
      Object.keys(parameters).forEach((key) => {
        if (parameters[key] !== undefined && parameters[key] !== null) {
          finalUrl = finalUrl.replace(`{${key}}`, String(parameters[key]));
        }
      });
    }

    // Build query string (exclude params that are already in URL path)
    const urlParams = new Set();
    // Extract params already in URL (like {sessionId})
    const urlParamMatches = finalUrl.match(/\{(\w+)\}/g);
    if (urlParamMatches) {
      urlParamMatches.forEach(match => {
        const paramName = match.replace(/[{}]/g, '');
        urlParams.add(paramName);
      });
    }

    const queryParamsObj: Record<string, string> = {};
    queryParams.forEach((param: string) => {
      // Don't add to query if it's already in URL path
      if (!urlParams.has(param) && parameters[param] !== undefined && parameters[param] !== null) {
        queryParamsObj[param] = String(parameters[param]);
      }
    });

    const queryString = new URLSearchParams(queryParamsObj).toString();
    if (queryString) {
      finalUrl += finalUrl.includes('?') ? `&${queryString}` : `?${queryString}`;
    }

    // Build request body
    let requestBody: any = undefined;
    if (method !== 'GET' && bodyParams.length > 0) {
      requestBody = {};
      bodyParams.forEach((param: string) => {
        if (parameters[param] !== undefined) {
          requestBody[param] = parameters[param];
        }
      });
    }

    this.logger.debug(`Executing HTTP tool: ${method} ${finalUrl}`, { body: requestBody, params: parameters });

    try {
      const response = await axios({
        method,
        url: finalUrl,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        data: requestBody,
        timeout: 30000, // 30 second timeout
      });

      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || 'Unknown error';
      const statusCode = error.response?.status || 'N/A';
      const errorDetails = error.response?.data;
      
      this.logger.error(`HTTP tool execution failed: ${statusCode} - ${errorMessage}`, {
        url: finalUrl,
        method,
        body: requestBody,
        params: parameters,
        error: errorDetails,
      });
      
      throw new Error(`HTTP tool execution failed (${statusCode}): ${errorMessage}`);
    }
  }

  private async executeFunctionTool(
    schema: any,
    parameters: Record<string, any>,
  ): Promise<any> {
    // For security, we would typically sandbox function execution
    // This is a basic implementation - production should use proper sandboxing
    const { code } = schema;

    try {
      // Create a safe execution context
      const safeEval = new Function('params', `return (${code})(params)`);
      return safeEval(parameters);
    } catch (error: any) {
      throw new Error(`Function tool execution failed: ${error.message}`);
    }
  }
}

