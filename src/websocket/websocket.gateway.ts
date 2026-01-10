import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AgentService } from '../agent/agent.service';
import { SessionsService } from '../sessions/sessions.service';
import { GuardrailsService } from '../guardrails/guardrails.service';
import { MemoryService } from '../memory/memory.service';
import { EventType, SessionStatus } from '@prisma/client';
import OpenAI from 'openai';

interface SessionMessageCount {
  [sessionId: string]: number;
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
  sessionId?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
  namespace: '/voice',
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  private readonly activeSessions = new Map<string, Set<string>>(); // sessionId -> Set of socketIds
  private readonly sessionMessageCounts: SessionMessageCount = {}; // Track message counts per session
  private openai: OpenAI;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
    private agentService: AgentService,
    private sessionsService: SessionsService,
    private guardrailsService: GuardrailsService,
    private memoryService: MemoryService,
  ) {
    const openaiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
    }
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Authenticate client
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        this.logger.warn(`Connection rejected: No token provided`);
        client.disconnect();
        return;
      }

      // Verify JWT
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET') || 'default-secret',
      });

      client.userId = payload.sub;

      // Get or create session
      const sessionId = client.handshake.query.sessionId as string;
      if (!sessionId) {
        this.logger.warn(`Connection rejected: No sessionId provided`);
        client.disconnect();
        return;
      }

      // Verify session belongs to user
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
      });

      if (!session || session.userId !== client.userId) {
        this.logger.warn(`Connection rejected: Invalid session`);
        client.disconnect();
        return;
      }

      client.sessionId = sessionId;

      // Track active session
      if (!this.activeSessions.has(sessionId)) {
        this.activeSessions.set(sessionId, new Set());
      }
      this.activeSessions.get(sessionId)!.add(client.id);

      this.logger.log(`Client connected: ${client.id}, Session: ${sessionId}`);

      // Emit connection event
      client.emit('connected', {
        sessionId,
        userId: client.userId,
        timestamp: new Date().toISOString(),
      });

      // Only log connection event if no other clients in this session
      const isFirstConnection = this.activeSessions.get(sessionId)?.size === 1;
      if (isFirstConnection) {
        await this.sessionsService.addEvent(sessionId, 'STATUS_CHANGE', {
          status: 'connected',
          socketId: client.id,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.sessionId) {
      const sessionSet = this.activeSessions.get(client.sessionId);
      if (sessionSet) {
        sessionSet.delete(client.id);
        if (sessionSet.size === 0) {
          this.activeSessions.delete(client.sessionId);
        }
      }

      this.logger.log(`Client disconnected: ${client.id}, Session: ${client.sessionId}`);

      // Only log disconnection event if this was the last client
      const wasLastConnection = !this.activeSessions.get(client.sessionId);
      if (client.sessionId && wasLastConnection) {
        await this.sessionsService.addEvent(client.sessionId, 'STATUS_CHANGE', {
          status: 'disconnected',
          socketId: client.id,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  @SubscribeMessage('text_input')
  async handleTextInput(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { text: string },
  ) {
    if (!client.sessionId || !client.userId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      const input = data.text.trim();

      // Determine if this needs complex agent planning or simple chat
      const needsAgentPlanning = await this.needsComplexProcessing(input);

      let response: string;

      if (needsAgentPlanning) {
        // Use full agent pipeline for complex tasks
        response = await this.handleComplexQuery(client.sessionId, input, client);
      } else {
        // Use fast direct chat for simple messages
        response = await this.handleSimpleChat(client.sessionId, input, client);
      }

      // Store in memory
      await this.memoryService.addMemory(client.sessionId, {
        type: 'CONTEXT',
        content: `User: ${input}\nAssistant: ${response}`,
        metadata: { timestamp: new Date().toISOString() },
      });

      // Auto-generate session name after first user message
      await this.autoGenerateSessionName(client.sessionId, input);

      // Note: Response already emitted via text_complete in handleSimpleChat or handleComplexQuery
      // Don't emit agent_response here to avoid duplicates - frontend handles text_complete
    } catch (error) {
      this.logger.error(`Text processing error: ${error.message}`);
      
      // Send user-friendly error message
      const errorMsg = error.message || 'An error occurred while processing your message';
      client.emit('text_complete', { fullText: `⚠️ ${errorMsg}` });
      client.emit('error', { message: error.message });
    }
  }

  private async needsComplexProcessing(input: string): Promise<boolean> {
    const lowerInput = input.toLowerCase();
    
    // Keywords that indicate need for tools/complex processing
    const toolKeywords = [
      'search', 'find', 'look up', 'weather', 'calculate', 
      'translate', 'create', 'generate', 'make', 'build',
      'send', 'email', 'message', 'book', 'schedule', 'remind'
    ];

    // Simple conversational patterns
    const simplePatterns = [
      /^(hi|hello|hey|yo|sup|okay|ok|yes|no|thanks|thank you)$/i,
      /^(what|who|how|why|when|where)\s+.{0,50}$/i, // Short questions
      /^(i|you|we|it|that|this)\s+.{0,50}$/i, // Short statements
    ];

    // Check if it's a simple message
    for (const pattern of simplePatterns) {
      if (pattern.test(input)) {
        return false;
      }
    }

    // Check if it needs tools
    return toolKeywords.some(keyword => lowerInput.includes(keyword));
  }

  private async handleSimpleChat(sessionId: string, input: string, client: AuthenticatedSocket): Promise<string> {
    try {
      // Validate input with guardrails (IMPORTANT: also validate simple chat!)
      const guardrailResult = await this.guardrailsService.validateInput(input, sessionId);
      
      if (!guardrailResult.allowed) {
        const errorMsg = `Input blocked: ${guardrailResult.reason}`;
        client.emit('text_complete', { fullText: errorMsg });
        return errorMsg;
      }

      const validatedInput = guardrailResult.maskedInput || input;

      // Get recent context (last 5 messages)
      const memories = await this.memoryService.getContext(sessionId);
      const recentContext = memories
        .slice(0, 5)
        .map(m => m.content)
        .join('\n');

      // Fast, direct OpenAI call with GPT-4o (latest model)
      if (!this.openai) {
        return "I'm here to help! How can I assist you?";
      }

      const stream = await this.openai.chat.completions.create({
        model: 'gpt-4o', // Latest GPT-4o model
        messages: [
          {
            role: 'system',
            content: 'You are ORION, a helpful and concise AI assistant. Provide brief, natural responses. Keep answers under 3 sentences unless more detail is specifically requested.',
          },
          ...(recentContext ? [{
            role: 'system' as const,
            content: `Recent conversation:\n${recentContext}`,
          }] : []),
          {
            role: 'user',
            content: validatedInput,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
        stream: true, // Enable streaming
      });

      let fullResponse = '';
      let buffer = '';

      // Stream response with typing effect
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          buffer += content;

          // Send chunks in small batches for smooth typing effect
          if (buffer.length >= 3) {
            client.emit('text_chunk', { text: buffer });
            buffer = '';
          }
        }
      }

      // Send any remaining buffer
      if (buffer) {
        client.emit('text_chunk', { text: buffer });
      }

      // Validate output before sending final response
      const isOutputValid = await this.guardrailsService.validateOutput(fullResponse, sessionId);
      if (!isOutputValid) {
        this.logger.warn(`Output blocked by guardrails for session ${sessionId}`);
        const safeResponse = "I'm sorry, but I cannot provide that response. Please try rephrasing your question.";
        client.emit('text_complete', { fullText: safeResponse });
        return safeResponse;
      }

      // Signal completion
      client.emit('text_complete', { fullText: fullResponse });

      return fullResponse || "I'm not sure how to respond to that.";
    } catch (error) {
      this.logger.error(`Simple chat error: ${error.message}`);
      return "I'm here to help! What would you like to know?";
    }
  }

  private async handleComplexQuery(sessionId: string, input: string, client: AuthenticatedSocket): Promise<string> {
    // Validate input with guardrails
    const guardrailResult = await this.guardrailsService.validateInput(
      input,
      sessionId,
    );

    if (!guardrailResult.allowed) {
      throw new Error(`Input blocked by guardrails: ${guardrailResult.reason}`);
    }

    const validatedInput = guardrailResult.maskedInput || input;

    // Get context
    const context = await this.memoryService.getContext(sessionId);

    // Plan with agent (storeMemory=false to avoid duplicate storage)
    const plan = await this.agentService.plan(
      sessionId,
      validatedInput,
      context.map((m) => m.content).join('\n'),
      false, // Don't store memory in agent.plan - we store it in handleTextInput
    );

    // Execute plan
    const results = await this.agentService.executePlan(
      sessionId,
      plan,
    );

    // Generate response
    const response = await this.generateResponse(results);
    
    // Validate output with guardrails
    const isOutputValid = await this.guardrailsService.validateOutput(response, sessionId);
    if (!isOutputValid) {
      this.logger.warn(`Output blocked by guardrails for session ${sessionId}`);
      throw new Error('Response blocked by guardrails');
    }
    
    // Stream the response with typing effect
    await this.streamResponse(client, response);
    
    return response;
  }

  private async streamResponse(client: AuthenticatedSocket, text: string): Promise<void> {
    const words = text.split(' ');
    let buffer = '';

    for (let i = 0; i < words.length; i++) {
      buffer += (i > 0 ? ' ' : '') + words[i];
      
      // Send in small batches
      if (i % 2 === 1 || i === words.length - 1) {
        client.emit('text_chunk', { text: buffer });
        buffer = '';
        // Small delay for typing effect
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }

    client.emit('text_complete', { fullText: text });
  }

  @SubscribeMessage('get_status')
  async handleGetStatus(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.sessionId) {
      client.emit('error', { message: 'No session' });
      return;
    }

    const session = await this.prisma.session.findUnique({
      where: { id: client.sessionId },
      include: {
        _count: {
          select: {
            memories: true,
            toolExecutions: true,
            events: true,
          },
        },
      },
    });

    if (session) {
      client.emit('status', {
        sessionId: session.id,
        status: session.status,
        activeConnections: this.activeSessions.get(client.sessionId)?.size || 0,
        stats: session._count,
      });
    }
  }

  // Helper methods
  private generateResponse(results: any[]): string {
    // Aggregate results from plan execution
    return results
      .map((r) => (r.result?.text || r.result?.message || JSON.stringify(r.result)))
      .filter(Boolean)
      .join('\n');
  }

  // Method to broadcast events to session
  async broadcastToSession(sessionId: string, event: string, data: any) {
    const sockets = this.activeSessions.get(sessionId);
    if (sockets) {
      sockets.forEach((socketId) => {
        this.server.to(socketId).emit(event, data);
      });
    }
  }

  // Check if message is substantive enough to generate a name
  private isSubstantiveMessage(message: string): boolean {
    const trimmed = message.trim().toLowerCase();
    
    // Too short to be substantive
    if (trimmed.length < 10) {
      return false;
    }

    // Common greetings and simple responses
    const simplePatterns = [
      /^(hi|hello|hey|yo|sup|greetings)(\s|!|\.)*$/i,
      /^(thanks|thank you|thx|ok|okay|yes|no|yep|nope)(\s|!|\.)*$/i,
      /^(good morning|good evening|good afternoon)(\s|!|\.)*$/i,
      /^(how are you|what's up|whats up)(\?|\s|!|\.)*$/i,
      /^(bye|goodbye|see you|later|cya)(\s|!|\.)*$/i,
    ];

    for (const pattern of simplePatterns) {
      if (pattern.test(trimmed)) {
        return false;
      }
    }

    // Check if it has actual content (questions, statements with verbs)
    const hasQuestionWords = /\b(what|why|how|when|where|who|can|could|would|should|is|are|do|does)\b/i.test(trimmed);
    const hasContentWords = /\b(help|need|want|issue|problem|question|about|regarding|looking|trying|create|make|build|fix|error)\b/i.test(trimmed);
    
    return hasQuestionWords || hasContentWords || trimmed.length > 20;
  }

  // Auto-generate session name based on first substantive user message
  private async autoGenerateSessionName(sessionId: string, userMessage: string) {
    try {
      // Check if session already has a name
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        return;
      }

      const metadata = (session.metadata as any) || {};
      if (metadata.name) {
        // Session already has a name
        return;
      }

      // Check if message is substantive enough
      if (!this.isSubstantiveMessage(userMessage)) {
        this.logger.debug(`Skipping name generation for non-substantive message: "${userMessage.substring(0, 30)}..."`);
        return;
      }

      // Generate intelligent name using OpenAI
      let generatedName: string;

      if (this.openai) {
        try {
          const completion = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant that generates short, descriptive titles for conversations. Generate a concise title (3-6 words maximum) that captures the main topic, question, or intent. Respond with ONLY the title, no quotes or extra text.',
              },
              {
                role: 'user',
                content: `Generate a short title for this user query: "${userMessage}"`,
              },
            ],
            temperature: 0.7,
            max_tokens: 20,
          });

          generatedName = completion.choices[0]?.message?.content?.trim() || userMessage.substring(0, 50);
        } catch (error) {
          this.logger.warn(`Failed to generate AI name: ${error.message}`);
          // Fallback: extract key words
          generatedName = this.extractKeywords(userMessage);
        }
      } else {
        // Fallback: extract keywords
        generatedName = this.extractKeywords(userMessage);
      }

      // Clean up the name
      generatedName = generatedName.replace(/['"]/g, '').trim();
      if (generatedName.length > 50) {
        generatedName = generatedName.substring(0, 47) + '...';
      }

      // Update session with generated name
      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          metadata: {
            ...metadata,
            name: generatedName,
            name_generated_at: new Date().toISOString(),
            named_from_message: userMessage.substring(0, 100),
          },
        },
      });

      this.logger.log(`Auto-generated name for session ${sessionId}: ${generatedName}`);

      // Broadcast name update to all clients in session
      this.broadcastToSession(sessionId, 'session_name_updated', {
        sessionId,
        name: generatedName,
      });
    } catch (error) {
      this.logger.error(`Error auto-generating session name: ${error.message}`);
      // Don't throw - naming is not critical
    }
  }

  // Extract keywords from message as fallback naming strategy
  private extractKeywords(message: string): string {
    // Remove common words
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'about', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'can', 'you', 'i', 'me', 'my', 'we', 'us']);
    
    const words = message
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));
    
    // Take first 4-5 meaningful words
    const keywords = words.slice(0, 5).join(' ');
    
    // Capitalize first letter of each word
    return keywords
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ') || message.substring(0, 50);
  }
}
