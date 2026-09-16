/**
 * Chat API for AI-powered conversational task creation
 */

import { Request, Response, Router } from 'express';
import { logger } from '../utils/logger';
import OpenAI from 'openai';
import { Readable } from 'stream';

const router = Router();

// Initialize AI providers
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Anthropic client would be initialized here if using Claude
// const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatContext {
  mode: 'quick-task' | 'go-wild' | 'new-farm';
  taskDescription?: string;
  numberOfAgents?: number;
  creativityLevel?: number;
  timeoutMinutes?: number;
  focusAreas?: string[];
  yamlConfig?: string;
  finalPrompt?: string;
}

/**
 * Stream chat response
 */
router.post('/stream', async (req: Request, res: Response) => {
  try {
    const { messages, userMessage, mode, context } = req.body;
    
    // Add user message to history
    const fullMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: userMessage }
    ];

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering

    // Use OpenAI streaming (or Claude when available)
    const provider = process.env.AI_PROVIDER || 'openai';
    
    if (provider === 'openai') {
      const stream = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
        messages: fullMessages as any,
        stream: true,
        temperature: mode === 'go-wild' ? 0.8 : 0.7,
        max_tokens: 1000,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          res.write(content);
        }
      }
    } else {
      // Fallback for demo/testing - simulate streaming
      const simulatedResponse = generateSimulatedResponse(mode, userMessage, context);
      
      // Stream the response character by character
      for (let i = 0; i < simulatedResponse.length; i++) {
        res.write(simulatedResponse[i]);
        await new Promise(resolve => setTimeout(resolve, 10)); // Simulate typing
      }
    }
    
    res.end();
  } catch (error) {
    logger.error('Chat streaming error:', error);
    res.status(500).json({ error: 'Failed to stream chat response' });
  }
});

/**
 * Generate YAML from conversation context
 */
router.post('/yaml/generate-from-context', async (req: Request, res: Response) => {
  try {
    const { context, mode, messages } = req.body;
    
    // Generate YAML based on mode and context
    const yaml = generateYAMLFromContext(context, mode);
    
    res.json({ 
      success: true,
      yaml 
    });
  } catch (error) {
    logger.error('YAML generation error:', error);
    res.status(500).json({ error: 'Failed to generate YAML' });
  }
});

/**
 * Enhance prompt based on context
 */
router.post('/prompts/enhance', async (req: Request, res: Response) => {
  try {
    const { prompt, context, mode } = req.body;
    
    // Enhance the prompt based on mode
    const enhancedPrompt = enhancePrompt(prompt, context, mode);
    
    res.json({ 
      success: true,
      enhancedPrompt 
    });
  } catch (error) {
    logger.error('Prompt enhancement error:', error);
    res.status(500).json({ error: 'Failed to enhance prompt' });
  }
});

// Helper function to generate simulated responses for testing
function generateSimulatedResponse(mode: string, userMessage: string, context: ChatContext): string {
  const lowerMessage = userMessage.toLowerCase();
  
  if (mode === 'quick-task') {
    if (lowerMessage.includes('typescript') || lowerMessage.includes('error')) {
      return "I'll help you fix those TypeScript errors quickly! Let me understand your setup:\n\n1. Are these errors in a specific file or across the project?\n2. Are they type-related or syntax errors?\n3. Do you have a tsconfig.json configured?\n\nThis looks like a task that can be completed in about 3-5 minutes with a single agent.";
    }
    if (lowerMessage.includes('test')) {
      return "Writing unit tests - great choice! Here's what I need to know:\n\n1. Which framework are you using (Jest, Vitest, etc.)?\n2. Which components/functions need tests?\n3. Do you need coverage reports?\n\nI can set up a focused agent to write comprehensive tests in under 5 minutes.";
    }
    return "I understand you need to " + userMessage + ". Let me help you structure this as a quick task that can be completed efficiently by a single agent.";
  }
  
  if (mode === 'go-wild') {
    return "What an exciting creative challenge! 🎨🎨\n\nFor '" + userMessage + "', I suggest we:\n\n1. Set creativity level to high (80%)\n2. Use 3-5 agents for diverse exploration\n3. Allow 30 minutes for deep innovation\n\nWould you like to add any specific areas to explore?";
  }
  
  if (mode === 'new-farm') {
    return "Let's architect this project properly! 🏗️\n\nFor '" + userMessage + "', I recommend:\n\n1. Breaking it into 3-4 main components\n2. Assigning specialized agents to each part\n3. Setting up parallel execution where possible\n\nShall we define the specific subtasks and dependencies?";
  }
  
  return "I'll help you with that. Can you provide more details about what you'd like to accomplish?";
}

// Helper function to generate YAML from context
function generateYAMLFromContext(context: ChatContext, mode: string): string {
  const baseYAML = `# ${mode === 'quick-task' ? 'Quick Task' : mode === 'go-wild' ? 'Creative Exploration' : 'Farm Project'} Configuration
# Generated from AI Chat Wizard

name: "${context.taskDescription || 'AI Generated Task'}"
mode: "${mode}"
version: "1.0"

agents:
  count: ${context.numberOfAgents || (mode === 'quick-task' ? 1 : 3)}
  type: ${mode === 'quick-task' ? 'focused' : mode === 'go-wild' ? 'creative' : 'collaborative'}
  
execution:
  timeout: ${context.timeoutMinutes || (mode === 'quick-task' ? 5 : 30)}
  parallel: ${mode !== 'quick-task'}
  retries: ${mode === 'quick-task' ? 1 : 3}
  
${mode === 'go-wild' ? `creativity:
  level: ${context.creativityLevel || 80}
  exploration:
    - "Push creative limits"
    - "Explore unconventional solutions"
    - "Document discoveries"
` : ''}
  
prompt: |
  ${context.finalPrompt || context.taskDescription || 'Execute the defined task efficiently'}
  
${context.focusAreas && context.focusAreas.length > 0 ? `focus_areas:
${context.focusAreas.map(area => `  - "${area}"`).join('\n')}
` : ''}

output:
  format: "structured"
  collect_artifacts: true
  generate_report: true`;

  return baseYAML;
}

// Helper function to enhance prompts
function enhancePrompt(prompt: string, context: ChatContext, mode: string): string {
  let enhanced = prompt;
  
  if (mode === 'quick-task') {
    enhanced = `[QUICK TASK - 5 MIN LIMIT]\n${prompt}\n\nFocus on: Direct solution, minimal setup, clear output.`;
  } else if (mode === 'go-wild') {
    enhanced = `[CREATIVE EXPLORATION]\n${prompt}\n\nEncouraged: Innovation, experimentation, unconventional approaches.\nCreativity Level: ${context.creativityLevel || 70}%`;
  } else if (mode === 'new-farm') {
    enhanced = `[MULTI-AGENT PROJECT]\n${prompt}\n\nApproach: Systematic, collaborative, well-documented.\nAgents: ${context.numberOfAgents || 3} working in parallel.`;
  }
  
  // Add focus areas if specified
  if (context.focusAreas && context.focusAreas.length > 0) {
    enhanced += `\n\nKey Focus Areas:\n${context.focusAreas.map(area => `- ${area}`).join('\n')}`;
  }
  
  return enhanced;
}

export default router;