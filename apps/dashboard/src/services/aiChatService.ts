import { ChatMode } from '@/components/Chat/GlassmorphicChatModal';
import { Message } from '@/components/Chat/ChatMessage';
import { api } from './apiClient';
import { EventEmitter } from 'events';
import { promptEnhancementEngine } from './promptEnhancementEngine';

export interface ChatContext {
  mode: ChatMode;
  taskDescription?: string;
  numberOfAgents?: number;
  creativityLevel?: number;
  timeoutMinutes?: number;
  focusAreas?: string[];
  attachments?: File[];
  yamlConfig?: string;
  finalPrompt?: string;
  boundaries?: {
    allowExternalAPIs: boolean;
    allowFileSystem: boolean;
    allowNetworkRequests: boolean;
  };
}

export interface StreamingResponse {
  content: string;
  isComplete: boolean;
  suggestions?: string[];
  buttons?: { label: string; action: string; variant?: 'primary' | 'secondary' }[];
}

class AIChatService extends EventEmitter {
  private conversationHistory: Message[] = [];
  private context: ChatContext = { mode: 'quick-task' };
  private abortController: AbortController | null = null;

  // Mode-specific system prompts
  private getSystemPrompt(mode: ChatMode): string {
    switch (mode) {
      case 'quick-task':
        return `You are an efficient task assistant for MaiFarm. Your goal is to help users quickly define and execute single-agent tasks.
        
Your personality is:
- Efficient and focused
- Time-conscious
- Clear and concise
- Helpful but brief

Your workflow:
1. Understand the task quickly
2. Ask only essential clarifying questions
3. Suggest optimizations for speed
4. Generate a focused YAML configuration
5. Confirm and execute

Keep responses short and actionable. Focus on getting the task done in under 5 minutes.`;

      case 'go-wild':
        return `You are a creative exploration guide for MaiFarm. Your goal is to help users unleash maximum creativity and explore innovative solutions without limits.
        
Your personality is:
- Wildly creative and encouraging
- Explorative and curious
- Enthusiastic about possibilities
- Fearless and adventurous

Your workflow:
1. Understand the creative vision
2. Immediately suggest optimal parameters (80% creativity, 3-5 agents, 30 minutes)
3. Focus on exploration areas and possibilities
4. Encourage wild, unconventional thinking
5. Generate an innovative YAML configuration

IMPORTANT: Do NOT ask about boundaries, limits, or constraints. Focus only on creative possibilities and exploration. Default to high creativity (80%), multiple agents (3-5), and reasonable time (30 minutes) without asking.`;

      case 'new-farm':
        return `You are a strategic farm architect for MaiFarm. Your goal is to help users design comprehensive multi-agent projects.
        
Your personality is:
- Strategic and thorough
- Collaborative and insightful
- Detail-oriented
- Resource-conscious

Your workflow:
1. Analyze the project comprehensively
2. Break down into optimal subtasks
3. Assign agents strategically
4. Plan resource allocation
5. Generate a complete project YAML

Focus on creating well-structured, scalable farm configurations.`;

      default:
        return 'You are an AI assistant helping to configure a MaiFarm task.';
    }
  }

  // Initialize conversation for a specific mode
  initializeConversation(mode: ChatMode): void {
    this.conversationHistory = [];
    this.context = { mode };
    
    // Add system prompt as first message (not shown to user)
    this.conversationHistory.push({
      id: 'system-1',
      role: 'system',
      content: this.getSystemPrompt(mode),
      timestamp: new Date()
    });
  }

  // Stream a response from the AI
  async streamResponse(
    userMessage: string,
    onChunk: (chunk: StreamingResponse) => void
  ): Promise<void> {
    // Cancel any existing stream
    if (this.abortController) {
      this.abortController.abort();
    }

    this.abortController = new AbortController();

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: this.conversationHistory,
          userMessage,
          mode: this.context.mode,
          context: this.context
        }),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          // Send final chunk with completion flag
          onChunk({
            content: buffer,
            isComplete: true,
            suggestions: this.generateSuggestions(),
            buttons: this.generateButtons()
          });
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Send partial content
        onChunk({
          content: buffer,
          isComplete: false
        });
      }

      // Add AI response to history
      this.conversationHistory.push({
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: buffer,
        timestamp: new Date()
      });

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Stream aborted');
      } else {
        console.error('Stream error:', error);
        throw error;
      }
    } finally {
      this.abortController = null;
    }
  }

  // Cancel ongoing stream
  cancelStream(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  // Generate context-aware suggestions
  private generateSuggestions(): string[] {
    const { mode } = this.context;
    const messageCount = this.conversationHistory.filter(m => m.role === 'user').length;

    // Early conversation suggestions - more varied
    if (messageCount <= 2) {
      switch (mode) {
        case 'quick-task': {
          const suggestions = [
            ['Add file context', 'Include examples', 'Specify format'],
            ['Set deadline', 'Define scope', 'List requirements'],
            ['Attach reference', 'Show current state', 'Explain goal'],
            ['Provide sample', 'Clarify output', 'Add constraints']
          ];
          return suggestions[Math.floor(Math.random() * suggestions.length)];
        }
        case 'go-wild': {
          const suggestions = [
            ['Explore alternatives', 'Think unconventionally', 'Challenge norms'],
            ['Define innovation goals', 'Suggest wild ideas', 'Push creative limits'],
            ['Add exploration areas', 'Increase creativity', 'Expand possibilities']
          ];
          return suggestions[Math.floor(Math.random() * suggestions.length)];
        }
        case 'new-farm': {
          const suggestions = [
            ['Add more agents', 'Define dependencies', 'Set milestones'],
            ['Outline architecture', 'Specify components', 'Plan phases'],
            ['Allocate resources', 'Set priorities', 'Define deliverables']
          ];
          return suggestions[Math.floor(Math.random() * suggestions.length)];
        }
      }
    }

    // Later conversation suggestions
    const laterSuggestions = [
      ['Review configuration', 'Generate YAML', 'Start execution'],
      ['Finalize setup', 'Preview plan', 'Launch task'],
      ['Confirm details', 'Check settings', 'Begin work']
    ];
    return laterSuggestions[Math.floor(Math.random() * laterSuggestions.length)];
  }

  // Generate action buttons based on context
  private generateButtons(): { label: string; action: string; variant?: 'primary' | 'secondary' }[] {
    const messageCount = this.conversationHistory.filter(m => m.role === 'user').length;

    if (messageCount >= 3) {
      return [
        { label: 'Generate YAML', action: 'generate-yaml', variant: 'primary' },
        { label: 'Start Over', action: 'reset', variant: 'secondary' }
      ];
    }

    return [];
  }

  // Update context from conversation
  updateContext(updates: Partial<ChatContext>): void {
    this.context = { ...this.context, ...updates };
    this.emit('context-updated', this.context);
  }

  // Generate YAML from current context
  async generateYAML(): Promise<string> {
    try {
      const response = await api.post('/api/yaml/generate-from-context', {
        context: this.context,
        mode: this.context.mode,
        messages: this.conversationHistory
      });

      if (response.data.yaml) {
        this.updateContext({ yamlConfig: response.data.yaml });
        return response.data.yaml;
      }

      throw new Error('Failed to generate YAML');
    } catch (error) {
      console.error('YAML generation error:', error);
      throw error;
    }
  }

  // Enhance prompt using conversation context and enhancement engine
  async enhancePrompt(basePrompt: string): Promise<string> {
    try {
      // First try server-side enhancement
      const response = await api.post('/api/prompts/enhance', {
        prompt: basePrompt,
        context: this.context,
        mode: this.context.mode
      });

      let enhancedPrompt = response.data.enhancedPrompt || basePrompt;

      // Then apply client-side enhancement engine
      const enhancement = promptEnhancementEngine.enhance({
        mode: this.context.mode,
        originalPrompt: enhancedPrompt,
        taskDescription: this.context.taskDescription,
        numberOfAgents: this.context.numberOfAgents,
        creativityLevel: this.context.creativityLevel,
        timeoutMinutes: this.context.timeoutMinutes,
        focusAreas: this.context.focusAreas,
        attachments: this.context.attachments
      });

      // Log enhancement quality
      const summary = promptEnhancementEngine.generateSummary(enhancement);
      console.log('Prompt Enhancement:', summary);

      this.updateContext({ finalPrompt: enhancement.prompt });
      return enhancement.prompt;
    } catch (error) {
      console.error('Prompt enhancement error:', error);
      
      // Fallback to client-side enhancement only
      const enhancement = promptEnhancementEngine.enhance({
        mode: this.context.mode,
        originalPrompt: basePrompt,
        taskDescription: this.context.taskDescription,
        numberOfAgents: this.context.numberOfAgents,
        creativityLevel: this.context.creativityLevel,
        timeoutMinutes: this.context.timeoutMinutes,
        focusAreas: this.context.focusAreas,
        attachments: this.context.attachments
      });
      
      this.updateContext({ finalPrompt: enhancement.prompt });
      return enhancement.prompt;
    }
  }

  // Analyze task complexity
  async analyzeComplexity(description: string): Promise<{
    complexity: 'simple' | 'moderate' | 'complex';
    recommendedAgents: number;
    estimatedTime: number;
    explanation: string;
  }> {
    try {
      const response = await api.post('/api/tasks/analyze-complexity', {
        prompt: description,
        mode: this.context.mode
      });

      return response.data;
    } catch (error) {
      // Default fallback
      return {
        complexity: 'moderate',
        recommendedAgents: this.context.mode === 'quick-task' ? 1 : 3,
        estimatedTime: this.context.mode === 'quick-task' ? 5 : 30,
        explanation: 'Unable to analyze complexity, using defaults'
      };
    }
  }

  // Get conversation summary
  getConversationSummary(): string {
    const userMessages = this.conversationHistory
      .filter(m => m.role === 'user')
      .map(m => m.content);

    if (userMessages.length === 0) return '';

    return userMessages.join(' → ');
  }

  // Export conversation as markdown
  exportConversation(): string {
    let markdown = `# MaiFarm Chat - ${this.context.mode}\n\n`;
    markdown += `**Date:** ${new Date().toLocaleString()}\n\n`;

    this.conversationHistory
      .filter(m => m.role !== 'system')
      .forEach(message => {
        const role = message.role === 'user' ? '👤 You' : '🤖 AI';
        markdown += `### ${role}\n${message.content}\n\n`;
      });

    if (this.context.yamlConfig) {
      markdown += `## Generated Configuration\n\n\`\`\`yaml\n${this.context.yamlConfig}\n\`\`\`\n`;
    }

    return markdown;
  }

  // Clear conversation
  clearConversation(): void {
    this.conversationHistory = [];
    this.context = { mode: this.context.mode };
    this.cancelStream();
  }
}

// Export singleton instance
export const aiChatService = new AIChatService();