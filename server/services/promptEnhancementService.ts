/**
 * Prompt Enhancement Service
 * Enhances user prompts using Claude's creative capabilities for YAML generation
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface IPromptEnhancement {
  originalPrompt: string;
  enhancedPrompt: string;
  enhancementStrategy: string;
  metadata: {
    timestamp: string;
    enhancementId: string;
    processingTime: number;
  };
}

export interface IClaudeEnhancementRequest {
  prompt: string;
  context?: string;
  targetAgentCount?: number;
  taskType?: 'farm' | 'gowild' | 'quicktask';
  additionalInstructions?: string;
}

export interface IYamlGeneratorEnhanced {
  originalRequest: any;
  enhancedPrompt: string;
  yamlOutput?: string;
  enhancementApplied: boolean;
}

class PromptEnhancementService {
  private enhancementPromptTemplate = `You are an expert prompt engineer specializing in multi-agent AI orchestration.
Your task is to enhance the following user prompt to make it more effective for a multi-agent Claude Code system.

The enhanced prompt should:
1. Be clear, specific, and actionable for AI agents
2. Include measurable success criteria
3. Suggest a logical breakdown of work for multiple agents
4. Add relevant technical context where appropriate
5. Maintain the original intent while improving clarity
6. Include coordination hints for agent collaboration
7. Add creative elements that inspire innovative solutions

Original Prompt: {ORIGINAL_PROMPT}

Additional Context: {CONTEXT}

Target Agent Count: {AGENT_COUNT}

Task Type: {TASK_TYPE}

Please provide an enhanced version of this prompt that will help the AI agents work more effectively.
Focus on making the prompt inspiring, clear, and conducive to parallel work.

IMPORTANT: Return ONLY the enhanced prompt text, without any explanations or metadata.`;

  constructor() {
    console.log('[PromptEnhancement] Service initialized');
  }

  /**
   * Enhance a user prompt using Claude
   */
  public async enhancePrompt(request: IClaudeEnhancementRequest): Promise<IPromptEnhancement> {
    const startTime = Date.now();
    const enhancementId = uuidv4();
    
    try {
      console.log(`[PromptEnhancement] Enhancing prompt: "${request.prompt.substring(0, 100)}..."`);
      
      // Build the enhancement prompt
      const fullPrompt = this.enhancementPromptTemplate
        .replace('{ORIGINAL_PROMPT}', request.prompt)
        .replace('{CONTEXT}', request.context || 'General software development task')
        .replace('{AGENT_COUNT}', String(request.targetAgentCount || 3))
        .replace('{TASK_TYPE}', request.taskType || 'farm');
      
      // Add any additional instructions
      const finalPrompt = request.additionalInstructions 
        ? `${fullPrompt}\n\nAdditional Instructions: ${request.additionalInstructions}`
        : fullPrompt;
      
      // Call Claude for enhancement
      const enhancedPrompt = await this.callClaude(finalPrompt);
      
      const processingTime = Date.now() - startTime;
      
      const enhancement: IPromptEnhancement = {
        originalPrompt: request.prompt,
        enhancedPrompt: enhancedPrompt,
        enhancementStrategy: this.determineStrategy(request),
        metadata: {
          timestamp: new Date().toISOString(),
          enhancementId,
          processingTime
        }
      };
      
      console.log(`[PromptEnhancement] Enhancement completed in ${processingTime}ms`);
      
      // Store enhancement for reference
      await this.storeEnhancement(enhancement);
      
      return enhancement;
    } catch (error) {
      console.error('[PromptEnhancement] Enhancement failed:', error);
      
      // Fallback: return original prompt with metadata
      return {
        originalPrompt: request.prompt,
        enhancedPrompt: request.prompt, // Use original if enhancement fails
        enhancementStrategy: 'fallback',
        metadata: {
          timestamp: new Date().toISOString(),
          enhancementId,
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Call Claude CLI for prompt enhancement
   */
  private async callClaude(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Create a temporary file for the prompt
      const tempFile = `/tmp/enhancement_${Date.now()}.txt`;
      
      fs.writeFile(tempFile, prompt)
        .then(() => {
          // Call Claude via command line
          const claudeProcess = spawn('claude', [
            'code',
            '--no-images',
            '--max-tokens', '500',
            '--temperature', '0.7',
            prompt
          ], {
            timeout: 30000 // 30 second timeout
          });
          
          let output = '';
          let error = '';
          
          claudeProcess.stdout.on('data', (data) => {
            output += data.toString();
          });
          
          claudeProcess.stderr.on('data', (data) => {
            error += data.toString();
          });
          
          claudeProcess.on('close', async (code) => {
            // Clean up temp file
            try {
              await fs.unlink(tempFile);
            } catch {}
            
            if (code === 0 && output) {
              // Extract the enhanced prompt from output
              const enhanced = this.extractEnhancedPrompt(output);
              resolve(enhanced);
            } else {
              console.error('[PromptEnhancement] Claude process failed:', error);
              reject(new Error(`Claude enhancement failed: ${error}`));
            }
          });
          
          claudeProcess.on('error', async (err) => {
            // Clean up temp file
            try {
              await fs.unlink(tempFile);
            } catch {}
            
            console.error('[PromptEnhancement] Failed to spawn Claude process:', err);
            
            // Fallback to built-in enhancement
            const fallbackEnhanced = this.fallbackEnhancement(prompt);
            resolve(fallbackEnhanced);
          });
        })
        .catch(reject);
    });
  }

  /**
   * Extract enhanced prompt from Claude's output
   */
  private extractEnhancedPrompt(output: string): string {
    // Remove any markdown code blocks or explanations
    const lines = output.split('\n');
    const enhancedLines = lines.filter(line => 
      !line.startsWith('```') && 
      !line.startsWith('##') &&
      !line.includes('Enhanced prompt:') &&
      !line.includes('Here is')
    );
    
    return enhancedLines.join('\n').trim();
  }

  /**
   * Fallback enhancement using built-in logic
   */
  private fallbackEnhancement(originalPrompt: string): string {
    // Simple rule-based enhancement
    const enhancements = [
      '\n\nKey Requirements:',
      '- Ensure code quality with comprehensive testing',
      '- Implement proper error handling and logging',
      '- Follow best practices and design patterns',
      '- Document all major decisions and interfaces',
      '- Optimize for performance and scalability',
      '\nCollaboration Guidelines:',
      '- Coordinate through shared interfaces',
      '- Communicate progress via status updates',
      '- Review and integrate work from other agents',
      '- Ensure consistency across all components'
    ];
    
    return `${originalPrompt}${enhancements.join('\n')}`;
  }

  /**
   * Determine enhancement strategy based on request
   */
  private determineStrategy(request: IClaudeEnhancementRequest): string {
    if (request.taskType === 'gowild') {
      return 'creative-exploration';
    } else if (request.taskType === 'quicktask') {
      return 'focused-execution';
    } else if (request.targetAgentCount && request.targetAgentCount > 5) {
      return 'large-scale-coordination';
    } else {
      return 'balanced-collaboration';
    }
  }

  /**
   * Store enhancement for analytics and learning
   */
  private async storeEnhancement(enhancement: IPromptEnhancement): Promise<void> {
    try {
      const storageDir = '/tmp/prompt_enhancements';
      await fs.mkdir(storageDir, { recursive: true });
      
      const filename = `enhancement_${enhancement.metadata.enhancementId}.json`;
      const filepath = path.join(storageDir, filename);
      
      await fs.writeFile(filepath, JSON.stringify(enhancement, null, 2));
    } catch (error) {
      console.error('[PromptEnhancement] Failed to store enhancement:', error);
      // Non-critical error, continue
    }
  }

  /**
   * Get enhancement history
   */
  public async getEnhancementHistory(limit: number = 10): Promise<IPromptEnhancement[]> {
    try {
      const storageDir = '/tmp/prompt_enhancements';
      const files = await fs.readdir(storageDir);
      
      const enhancements: IPromptEnhancement[] = [];
      
      // Get the most recent files
      const sortedFiles = files
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);
      
      for (const file of sortedFiles) {
        try {
          const filepath = path.join(storageDir, file);
          const data = await fs.readFile(filepath, 'utf-8');
          enhancements.push(JSON.parse(data));
        } catch {}
      }
      
      return enhancements;
    } catch {
      return [];
    }
  }

  /**
   * Validate that enhanced prompt is accepted by Claude
   */
  public async validateEnhancedPrompt(prompt: string): Promise<boolean> {
    try {
      // Simple validation for now
      // Could be extended to actually test with Claude
      return prompt.length > 0 && prompt.length < 10000;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const promptEnhancementService = new PromptEnhancementService();