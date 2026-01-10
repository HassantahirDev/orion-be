import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryService } from '../memory/memory.service';
import { SessionsService } from '../sessions/sessions.service';

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private memoryService: MemoryService,
    private sessionsService: SessionsService,
  ) {}

  /**
   * Generate enhanced system prompt with user context and conversation history
   */
  async generateEnhancedPrompt(
    userId: string,
    sessionId: string | null,
    userName?: string,
  ) {
    try {
      // 1. Get user profile data
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          email: true,
          role: true,
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const firstName = userName || user.name?.split(' ')[0] || 'there';

      // 2. Load conversation history if session exists
      let conversationHistory: any[] = [];
      let hasHistory = false;

      if (sessionId) {
        const memories = await this.memoryService.getContext(sessionId, 20);
        conversationHistory = memories.map((m) => ({
          role: m.type === 'CONTEXT' ? 'assistant' : 'user',
          content: m.content,
        }));
        hasHistory = conversationHistory.length > 0;
      }

      // 3. Build conversation summary
      let conversationSummary = '';
      if (hasHistory) {
        conversationSummary = `\n\nCONVERSATION HISTORY (for context - do not repeat):
${conversationHistory
  .slice(-10)
  .map((msg) => `${msg.role}: ${msg.content}`)
  .join('\n')}`;
      }

      // 4. Build enhanced system prompt
      const BASE_SYSTEM_PROMPT = `You are ORION, an advanced AI assistant with real-time voice capabilities. You are helpful, knowledgeable, and can execute tasks using various tools available to you.

CAPABILITIES:
- You can answer questions on any topic
- You can use external tools to fetch real-time information (weather, facts, calculations, etc.)
- You maintain context across the conversation
- You are conversational and natural in speech

CONVERSATION STYLE:
- Keep responses concise and natural for voice interaction
- Use friendly, conversational tone
- Avoid overly long responses in a single turn
- Ask clarifying questions when needed

USER INFORMATION:
- Name: ${user.name || 'User'}
- Email: ${user.email}
- Role: ${user.role}`;

      const enhancedSystemPrompt = [
        BASE_SYSTEM_PROMPT,
        conversationSummary,
      ]
        .filter(Boolean)
        .join('');

      // 5. Generate first message
      const getFirstMessage = () => {
        if (hasHistory) {
          return `Welcome back${firstName ? ' ' + firstName : ''}! Let's continue our conversation.`;
        }
        return `Hey ${firstName}! I'm ORION, your AI assistant. How can I help you today?`;
      };

      return {
        success: true,
        system_prompt: enhancedSystemPrompt,
        first_message: getFirstMessage(),
        session_id: sessionId,
        has_history: hasHistory,
        user_name: firstName,
      };
    } catch (error) {
      this.logger.error('Error generating enhanced prompt:', error);
      throw error;
    }
  }

  /**
   * Store voice message in session memory
   */
  async storeVoiceMessage(
    userId: string,
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
  ) {
    try {
      // Verify session belongs to user
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new NotFoundException('Session not found');
      }

      if (session.userId !== userId) {
        throw new NotFoundException('Session does not belong to user');
      }

      // Process content - extract any internal tags
      let processedContent = content;
      let metadata: any = {};

      // Extract locked QA pairs if present
      const lockedQAMatch = content.match(
        /\[LOCKED_QA\]([\s\S]*?)\[\/LOCKED_QA\]/gi,
      );
      if (lockedQAMatch) {
        metadata.locked_qa = lockedQAMatch;
        // Remove tags for storage
        processedContent = content
          .replace(/\[LOCKED_QA\][\s\S]*?\[\/LOCKED_QA\]/gi, '')
          .trim();
      }

      // Extract extraction data if present
      const extractionMatch = content.match(
        /\[EXTRACTION_DATA\]([\s\S]*?)\[\/EXTRACTION_DATA\]/gi,
      );
      if (extractionMatch) {
        metadata.extraction_data = extractionMatch;
        processedContent = processedContent
          .replace(/\[EXTRACTION_DATA\][\s\S]*?\[\/EXTRACTION_DATA\]/gi, '')
          .trim();
      }

      // Check for completion status
      const completionMatch = content.match(/\[CHAT_STATUS:(COMPLETE|FINAL)\]/i);
      if (completionMatch) {
        metadata.completion_status = completionMatch[1];
        processedContent = processedContent
          .replace(/\[CHAT_STATUS:(COMPLETE|FINAL)\]/gi, '')
          .trim();
      }

      // Store as memory
      const memory = await this.memoryService.addMemory(sessionId, {
        type: role === 'user' ? 'CONTEXT' : 'FACT',
        content: processedContent,
        metadata: {
          source: 'voice',
          role,
          ...metadata,
        },
      });

      // Log voice event
      await this.sessionsService.addEvent(sessionId, 'AUDIO_INPUT', {
        role,
        contentLength: processedContent.length,
        hasMetadata: Object.keys(metadata).length > 0,
      });

      return {
        success: true,
        message: memory,
        processed_content: processedContent,
        metadata,
      };
    } catch (error) {
      this.logger.error('Error storing voice message:', error);
      throw error;
    }
  }

  /**
   * Get Eleven Labs agent configuration
   */
  async getAgentConfig(agentType: string = 'default') {
    const agentIdMap: Record<string, string> = {
      default: this.configService.get('ELEVENLABS_AGENT_ID'),
      tedx: this.configService.get('ELEVENLABS_TEDX_AGENT_ID'),
      sxsw: this.configService.get('ELEVENLABS_SXSW_AGENT_ID'),
      talk_designer: this.configService.get(
        'ELEVENLABS_TALK_DESIGNER_AGENT_ID',
      ),
      messaging_mentor: this.configService.get(
        'ELEVENLABS_MESSAGING_MENTOR_AGENT_ID',
      ),
      audience_whisperer: this.configService.get(
        'ELEVENLABS_AUDIENCE_WHISPERER_AGENT_ID',
      ),
      watering_hole: this.configService.get(
        'ELEVENLABS_WATERING_HOLE_FINDER_AGENT_ID',
      ),
    };

    const agentId =
      agentIdMap[agentType] ||
      agentIdMap.default ||
      'agent_2001k6ywvh26e5dt8477sq55edqk'; // Fallback

    return {
      agent_id: agentId,
      api_key: this.configService.get('ELEVENLABS_API_KEY'),
      model: 'eleven_turbo_v2_5',
      language: 'en',
    };
  }

  /**
   * Check if conversation is complete based on messages
   */
  async checkConversationComplete(sessionId: string) {
    try {
      const memories = await this.memoryService.getContext(sessionId, 50);

      // Check for completion status in metadata
      const hasCompletionStatus = memories.some((m) => {
        const metadata = m.metadata as any;
        return (
          metadata?.completion_status === 'COMPLETE' ||
          metadata?.completion_status === 'FINAL'
        );
      });

      return {
        success: true,
        is_complete: hasCompletionStatus,
        message_count: memories.length,
      };
    } catch (error) {
      this.logger.error('Error checking conversation completion:', error);
      throw error;
    }
  }

  /**
   * Generate conversation name based on content
   */
  async generateConversationName(sessionId: string, lastUserMessage?: string) {
    try {
      const memories = await this.memoryService.getContext(sessionId, 10);

      if (memories.length === 0) {
        return {
          success: true,
          name: 'New Voice Conversation',
        };
      }

      // Use the first user message or last user message for naming
      const firstUserMemory = memories.find(
        (m) => (m.metadata as any)?.role === 'user',
      );
      const nameBase =
        lastUserMessage || firstUserMemory?.content || 'Voice Conversation';

      // Truncate to reasonable length
      const name = nameBase.length > 50 ? nameBase.substring(0, 47) + '...' : nameBase;

      // Update session metadata with name
      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          metadata: {
            name,
            generated_at: new Date().toISOString(),
          },
        },
      });

      return {
        success: true,
        name,
      };
    } catch (error) {
      this.logger.error('Error generating conversation name:', error);
      throw error;
    }
  }
}

