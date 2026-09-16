/**
 * Claude API Integration Service
 *
 * Provides intelligent dialogue, prompt refinement, and AI-powered assistance
 * directly within the MaiFarm CLI for enhanced user experience.
 */

import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import * as dotenv from 'dotenv';

// Load environment variables
const envPath = join(process.cwd(), '.env.development');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  content: string;
  suggestions?: string[];
  confidence?: number;
  metadata?: any;
}

export class ClaudeService {
  private apiKey: string | undefined;
  private apiUrl: string = 'https://api.anthropic.com/v1/messages';
  private model: string = 'claude-3-sonnet-20240229';
  private maxTokens: number = 4096;
  private conversationHistory: ClaudeMessage[] = [];
  private systemPrompt: string;

  constructor() {
    this.apiKey = this.loadApiKey();
    this.systemPrompt = this.buildSystemPrompt();
  }

  /**
   * Load API key from multiple sources
   */
  private loadApiKey(): string | undefined {
    // Check environment variables
    let key = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

    // Check MaiFarm config file
    if (!key) {
      const configPath = join(homedir(), '.maifarm', 'config.json');
      if (existsSync(configPath)) {
        try {
          const config = JSON.parse(readFileSync(configPath, 'utf-8'));
          key = config.claudeApiKey || config.anthropicApiKey;
        } catch {
          // Silent fail
        }
      }
    }

    // Check main project .env
    if (!key) {
      const mainEnvPath = join(process.cwd(), '.env');
      if (existsSync(mainEnvPath)) {
        const envConfig = dotenv.parse(readFileSync(mainEnvPath));
        key = envConfig.ANTHROPIC_API_KEY || envConfig.CLAUDE_API_KEY;
      }
    }

    return key;
  }

  /**
   * Build system prompt for Claude
   */
  private buildSystemPrompt(): string {
    return `You are an AI assistant integrated into the MaiFarm CLI, a farm-themed multi-agent orchestration system.

Your role is to:
1. Help users refine their prompts for better agent performance
2. Suggest optimal configurations (agent count, mode, timeout)
3. Provide intelligent task decomposition
4. Offer real-time guidance and troubleshooting
5. Generate creative and effective prompts
6. Analyze task complexity and recommend approaches

Key MaiFarm concepts:
- Farms: Projects with multiple AI agents working together
- Agents: Individual AI workers (Claude instances) with farm animal personalities
- Modes: Standard (balanced), Quick (5-min sprint), Wild (autonomous exploration)
- Harvest: Collecting outputs from completed farms
- Barn: Shared storage for reusable resources

Be helpful, concise, and maintain the farm theme where appropriate. Focus on practical advice that improves task outcomes.`;
  }

  /**
   * Check if Claude API is available
   */
  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Refine a user's prompt for better agent performance
   */
  async refinePrompt(originalPrompt: string, context?: any): Promise<ClaudeResponse> {
    if (!this.isAvailable()) {
      return {
        content: originalPrompt,
        suggestions: ['Configure Claude API key for intelligent prompt refinement']
      };
    }

    const spinner = ora({
      text: 'Consulting Claude for prompt optimization... 🤖',
      spinner: 'dots12'
    }).start();

    try {
      const messages: ClaudeMessage[] = [
        {
          role: 'user',
          content: `Please refine and improve this prompt for multi-agent AI collaboration:

Original Prompt: "${originalPrompt}"

Context:
- Agent Count: ${context?.agentCount || 'not specified'}
- Mode: ${context?.mode || 'standard'}
- Estimated Complexity: ${context?.complexity || 'medium'}

Provide:
1. An improved, clear, and specific version of the prompt
2. Suggestions for task decomposition if applicable
3. Recommended agent count and mode
4. Any potential challenges or considerations

Keep the refined prompt concise but comprehensive.`
        }
      ];

      const response = await this.sendRequest(messages);
      spinner.succeed('Prompt refined with Claude\'s intelligence! ✨');

      // Parse Claude's response
      const refined = this.parseRefinementResponse(response);

      return refined;

    } catch (error: any) {
      spinner.fail('Failed to refine prompt');
      console.error(chalk.red('Claude API error:', error.message));

      return {
        content: originalPrompt,
        suggestions: ['Using original prompt due to API error']
      };
    }
  }

  /**
   * Get task recommendations based on description
   */
  async getTaskRecommendations(taskDescription: string): Promise<ClaudeResponse> {
    if (!this.isAvailable()) {
      return {
        content: 'Configure Claude API for intelligent recommendations',
        suggestions: []
      };
    }

    const messages: ClaudeMessage[] = [
      {
        role: 'user',
        content: `Based on this task description: "${taskDescription}"

Recommend:
1. Optimal number of agents (1-10)
2. Best mode (standard/quick/wild)
3. Estimated time needed
4. Task breakdown into sub-tasks
5. Potential challenges
6. Success criteria

Format as actionable recommendations.`
      }
    ];

    try {
      const response = await this.sendRequest(messages);
      return this.parseRecommendationResponse(response);
    } catch (error) {
      return {
        content: 'Unable to generate recommendations',
        suggestions: ['Proceed with default settings']
      };
    }
  }

  /**
   * Interactive dialogue with Claude
   */
  async chat(message: string, context?: any): Promise<ClaudeResponse> {
    if (!this.isAvailable()) {
      return {
        content: 'Claude API not configured. Add ANTHROPIC_API_KEY to enable intelligent assistance.',
        suggestions: []
      };
    }

    // Add to conversation history
    this.conversationHistory.push({
      role: 'user',
      content: message
    });

    // Keep conversation history manageable
    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-20);
    }

    try {
      const response = await this.sendRequest(this.conversationHistory);

      // Add Claude's response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: response
      });

      return {
        content: response,
        confidence: 0.95
      };

    } catch (error: any) {
      return {
        content: `I encountered an error: ${error.message}`,
        suggestions: ['Try rephrasing your question']
      };
    }
  }

  /**
   * Analyze farm performance and suggest improvements
   */
  async analyzeFarmPerformance(farmData: any): Promise<ClaudeResponse> {
    if (!this.isAvailable()) {
      return {
        content: 'Performance analysis requires Claude API',
        suggestions: []
      };
    }

    const messages: ClaudeMessage[] = [
      {
        role: 'user',
        content: `Analyze this farm's performance and suggest improvements:

Farm Details:
- Name: ${farmData.name}
- Mode: ${farmData.mode}
- Agents: ${farmData.agentCount}
- Status: ${farmData.status}
- Duration: ${farmData.duration || 'ongoing'}
- Errors: ${farmData.errors || 0}
- Output Size: ${farmData.outputSize || 'unknown'}

Provide:
1. Performance assessment
2. Bottleneck identification
3. Optimization suggestions
4. Resource efficiency analysis`
      }
    ];

    try {
      const response = await this.sendRequest(messages);
      return {
        content: response,
        metadata: { farmId: farmData.id }
      };
    } catch {
      return {
        content: 'Unable to analyze performance',
        suggestions: ['Check farm logs manually']
      };
    }
  }

  /**
   * Generate creative prompts based on goals
   */
  async generatePrompt(goal: string, style?: string): Promise<ClaudeResponse> {
    if (!this.isAvailable()) {
      return {
        content: goal,
        suggestions: ['Add Claude API for creative prompt generation']
      };
    }

    const messages: ClaudeMessage[] = [
      {
        role: 'user',
        content: `Generate a detailed, effective prompt for AI agents to achieve this goal:

Goal: "${goal}"
Style: ${style || 'professional and clear'}

The prompt should be:
- Specific and actionable
- Include success criteria
- Break down complex tasks
- Specify expected outputs
- Include quality requirements`
      }
    ];

    try {
      const response = await this.sendRequest(messages);
      return {
        content: response,
        confidence: 0.9
      };
    } catch {
      return {
        content: goal,
        suggestions: ['Using original goal as prompt']
      };
    }
  }

  /**
   * Troubleshoot farm issues
   */
  async troubleshoot(issue: string, farmContext: any): Promise<ClaudeResponse> {
    if (!this.isAvailable()) {
      return {
        content: 'Troubleshooting requires Claude API',
        suggestions: ['Check documentation for common issues']
      };
    }

    const messages: ClaudeMessage[] = [
      {
        role: 'user',
        content: `Help troubleshoot this MaiFarm issue:

Issue: "${issue}"

Farm Context:
${JSON.stringify(farmContext, null, 2)}

Provide:
1. Likely cause
2. Step-by-step solution
3. Prevention tips
4. Alternative approaches`
      }
    ];

    try {
      const response = await this.sendRequest(messages);
      return {
        content: response,
        suggestions: this.extractActionableSteps(response)
      };
    } catch {
      return {
        content: 'Unable to troubleshoot',
        suggestions: ['Contact support or check logs']
      };
    }
  }

  /**
   * Send request to Claude API
   */
  private async sendRequest(messages: ClaudeMessage[]): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Claude API key not configured');
    }

    const response = await axios.post(
      this.apiUrl,
      {
        model: this.model,
        messages: messages,
        system: this.systemPrompt,
        max_tokens: this.maxTokens,
        temperature: 0.7
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    return response.data.content[0].text;
  }

  /**
   * Parse refinement response from Claude
   */
  private parseRefinementResponse(response: string): ClaudeResponse {
    // Extract refined prompt and suggestions
    const lines = response.split('\n');
    let refinedPrompt = '';
    const suggestions: string[] = [];
    let inRefinedSection = false;

    for (const line of lines) {
      if (line.toLowerCase().includes('refined') || line.toLowerCase().includes('improved')) {
        inRefinedSection = true;
        continue;
      }

      if (inRefinedSection && line.trim() && !line.startsWith('-') && !line.startsWith('*')) {
        refinedPrompt = line.trim().replace(/^["']|["']$/g, '');
        inRefinedSection = false;
      }

      if (line.startsWith('-') || line.startsWith('*') || line.match(/^\d+\./)) {
        suggestions.push(line.replace(/^[-*]|\d+\./, '').trim());
      }
    }

    return {
      content: refinedPrompt || response,
      suggestions: suggestions.slice(0, 5),
      confidence: 0.85
    };
  }

  /**
   * Parse recommendation response
   */
  private parseRecommendationResponse(response: string): ClaudeResponse {
    const recommendations: string[] = [];
    const lines = response.split('\n');

    for (const line of lines) {
      if (line.trim() && (line.match(/^\d+\./) || line.startsWith('-'))) {
        recommendations.push(line.replace(/^\d+\.|-/, '').trim());
      }
    }

    return {
      content: response,
      suggestions: recommendations.slice(0, 5),
      confidence: 0.9
    };
  }

  /**
   * Extract actionable steps from troubleshooting response
   */
  private extractActionableSteps(response: string): string[] {
    const steps: string[] = [];
    const lines = response.split('\n');

    for (const line of lines) {
      if (line.match(/^\d+\./) || line.toLowerCase().includes('step')) {
        steps.push(line.replace(/^\d+\./, '').trim());
      }
    }

    return steps.slice(0, 5);
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Get conversation context
   */
  getContext(): ClaudeMessage[] {
    return this.conversationHistory;
  }

  /**
   * Validate and test Claude connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.isAvailable()) {
      console.log(chalk.yellow('⚠️ Claude API key not configured'));
      console.log(chalk.gray('Add ANTHROPIC_API_KEY to your environment'));
      return false;
    }

    const spinner = ora('Testing Claude API connection...').start();

    try {
      const response = await this.sendRequest([
        {
          role: 'user',
          content: 'Say "MaiFarm CLI connected!" if you can hear me.'
        }
      ]);

      if (response.toLowerCase().includes('connected')) {
        spinner.succeed('Claude API connected successfully! 🎉');
        return true;
      } else {
        spinner.fail('Unexpected response from Claude');
        return false;
      }

    } catch (error: any) {
      spinner.fail(`Claude API connection failed: ${error.message}`);
      return false;
    }
  }
}

// Singleton instance
export const claudeService = new ClaudeService();

export default claudeService;