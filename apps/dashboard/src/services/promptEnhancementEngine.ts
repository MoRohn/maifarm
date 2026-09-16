/**
 * Prompt Enhancement Engine
 * Ensures all chat wizards generate excellent, focused prompts
 */

import { ChatMode } from '@/components/Chat/GlassmorphicChatModal';

interface EnhancementContext {
  mode: ChatMode;
  originalPrompt: string;
  taskDescription?: string;
  numberOfAgents?: number;
  creativityLevel?: number;
  timeoutMinutes?: number;
  focusAreas?: string[];
  projectComponents?: any[];
  attachments?: File[];
}

interface EnhancedPrompt {
  prompt: string;
  metadata: {
    clarity: number; // 0-100
    specificity: number; // 0-100
    actionability: number; // 0-100
    enhancements: string[];
  };
}

export class PromptEnhancementEngine {
  /**
   * Enhance a prompt based on mode and context
   */
  enhance(context: EnhancementContext): EnhancedPrompt {
    let enhancedPrompt = context.originalPrompt;
    const enhancements: string[] = [];
    
    // Mode-specific enhancements
    switch (context.mode) {
      case 'quick-task':
        enhancedPrompt = this.enhanceQuickTask(context, enhancements);
        break;
      case 'go-wild':
        enhancedPrompt = this.enhanceGoWild(context, enhancements);
        break;
      case 'new-farm':
        enhancedPrompt = this.enhanceNewFarm(context, enhancements);
        break;
    }
    
    // Universal enhancements
    enhancedPrompt = this.applyUniversalEnhancements(enhancedPrompt, context, enhancements);
    
    // Calculate quality metrics
    const metadata = this.calculateMetrics(enhancedPrompt, enhancements);
    
    return {
      prompt: enhancedPrompt,
      metadata
    };
  }
  
  /**
   * Enhance Quick Task prompts for efficiency
   */
  private enhanceQuickTask(context: EnhancementContext, enhancements: string[]): string {
    let prompt = context.originalPrompt;
    
    // Add clear success criteria
    if (!/success criteria:/i.test(prompt)) {
      prompt += '\n\nSuccess Criteria: Task is complete when the requested outcome is achieved with working code/output.';
      enhancements.push('Added success criteria');
    }
    
    // Add time constraint emphasis
    if (!prompt.startsWith('[TIME-BOXED')) {
      prompt = `[TIME-BOXED: ${context.timeoutMinutes || 5} minutes]\n\n${prompt}`;
      enhancements.push('Added time constraint');
    }
    
    // Add efficiency directive
    if (!/Approach:.*direct solution/i.test(prompt)) {
      prompt += '\n\nApproach: Focus on the most direct solution. Avoid over-engineering.';
      enhancements.push('Added efficiency directive');
    }
    
    // Add output format if missing
    if (!/Deliver:.*output/i.test(prompt)) {
      prompt += '\n\nDeliver: Clear, actionable output with any necessary code or documentation.';
      enhancements.push('Added output specification');
    }
    
    return prompt;
  }
  
  /**
   * Enhance GoWild prompts for creativity
   */
  private enhanceGoWild(context: EnhancementContext, enhancements: string[]): string {
    let prompt = context.originalPrompt;
    
    // Add creativity amplifiers
    const creativityLevel = context.creativityLevel || 80;
    if (!prompt.startsWith('[CREATIVE MODE')) {
      prompt = `[CREATIVE MODE: ${creativityLevel}% Innovation Level]\n\n${prompt}`;
      enhancements.push('Added creativity level');
    }
    
    // Add exploration directives
    const explorationPhrases = [
      'Challenge conventional approaches',
      'Explore unconventional solutions',
      'Think beyond standard patterns',
      'Innovate without constraints',
      'Discover novel possibilities'
    ];
    
    const selectedPhrase = explorationPhrases[Math.floor(Math.random() * explorationPhrases.length)];
    if (!/Creative Directive:/i.test(prompt)) {
      prompt += `\n\nCreative Directive: ${selectedPhrase}.`;
      enhancements.push('Added exploration directive');
    }
    
    // Add innovation areas
    if (context.focusAreas && context.focusAreas.length > 0) {
      if (!/Exploration Areas:/i.test(prompt)) {
        prompt += `\n\nExploration Areas: ${context.focusAreas.join(', ')}`;
        enhancements.push('Added focus areas');
      }
    } else {
      if (!/Exploration Areas:/i.test(prompt)) {
        prompt += '\n\nExploration Areas: Architecture, User Experience, Performance, Integration';
        enhancements.push('Added default exploration areas');
      }
    }
    
    // Add creative freedom
    if (!/Constraints: Minimal/i.test(prompt)) {
      prompt += '\n\nConstraints: Minimal - prioritize innovation over convention.';
      enhancements.push('Added creative freedom constraints');
    }
    if (!/Encouraged:/i.test(prompt)) {
      prompt += '\nEncouraged: Experimental approaches, unique solutions, creative problem-solving.';
      enhancements.push('Added creative freedom guidelines');
    }
    
    return prompt;
  }
  
  /**
   * Enhance New Farm prompts for comprehensive projects
   */
  private enhanceNewFarm(context: EnhancementContext, enhancements: string[]): string {
    let prompt = context.originalPrompt;
    
    // Add project structure
    if (!prompt.startsWith('[MULTI-AGENT PROJECT')) {
      prompt = `[MULTI-AGENT PROJECT: ${context.numberOfAgents || 4} Specialized Agents]\n\n${prompt}`;
      enhancements.push('Added agent allocation');
    }
    
    // Add component breakdown if available
    if (context.projectComponents && context.projectComponents.length > 0) {
      const componentList = context.projectComponents
        .map((c: any) => `• ${c.name}: ${c.description} (${c.agentCount} agent${c.agentCount > 1 ? 's' : ''})`)
        .join('\n');
      if (!/Project Components:/i.test(prompt)) {
        prompt += `\n\nProject Components:\n${componentList}`;
        enhancements.push('Added component breakdown');
      }
    }

    // Add collaboration directive
    if (!/Collaboration Strategy:/i.test(prompt)) {
      prompt += '\n\nCollaboration Strategy:';
      prompt += '\n• Agents work on assigned components';
      prompt += '\n• Share progress and integrate continuously';
      prompt += '\n• Maintain consistency across components';
      prompt += '\n• Document interfaces and dependencies';
      enhancements.push('Added collaboration strategy');
    }

    // Add quality standards
    if (!/Quality Standards:/i.test(prompt)) {
      prompt += '\n\nQuality Standards:';
      prompt += '\n• Production-ready code';
      prompt += '\n• Comprehensive error handling';
      prompt += '\n• Clear documentation';
      prompt += '\n• Test coverage where applicable';
      enhancements.push('Added quality standards');
    }

    // Add deliverables
    if (!/Deliverables:/i.test(prompt)) {
      prompt += '\n\nDeliverables:';
      prompt += '\n• Working implementation of all components';
      prompt += '\n• Integration between components';
      prompt += '\n• Documentation and setup instructions';
      enhancements.push('Added deliverables specification');
    }

    return prompt;
  }
  
  /**
   * Apply universal enhancements to any prompt
   */
  private applyUniversalEnhancements(prompt: string, context: EnhancementContext, enhancements: string[]): string {
    // Add context from attachments
    if (context.attachments && context.attachments.length > 0 && !/Reference Files:/i.test(prompt)) {
      const fileList = context.attachments.map(f => f.name).join(', ');
      prompt += `\n\nReference Files: ${fileList}`;
      enhancements.push('Added file references');
    }

    // Ensure clear action items
    if (!prompt.toLowerCase().includes('step') && !prompt.toLowerCase().includes('task') && !prompt.trimStart().toLowerCase().startsWith('task:')) {
      const hasQuestionMark = prompt.includes('?');
      if (!hasQuestionMark) {
        // Add implicit action
        prompt = `Task: ${prompt}`;
        enhancements.push('Clarified as task');
      }
    }
    
    // Add technology context if detected
    const techKeywords = {
      'react': 'Use React best practices and hooks',
      'node': 'Follow Node.js conventions',
      'python': 'Use Pythonic patterns',
      'typescript': 'Ensure type safety',
      'database': 'Optimize queries and indexes',
      'api': 'Follow RESTful conventions',
      'test': 'Include comprehensive test coverage'
    };
    
    for (const [keyword, directive] of Object.entries(techKeywords)) {
      if (prompt.toLowerCase().includes(keyword)) {
        if (!prompt.includes(directive)) {
          prompt += `\n• ${directive}`;
          enhancements.push(`Added ${keyword} best practices`);
        }
      }
    }
    
    return prompt;
  }
  
  /**
   * Calculate quality metrics for the enhanced prompt
   */
  private calculateMetrics(prompt: string, enhancements: string[]): EnhancedPrompt['metadata'] {
    // Clarity: Based on structure and formatting
    let clarity = 60; // Base score
    if (prompt.includes('\n\n')) clarity += 10; // Has sections
    if (prompt.includes('•') || prompt.includes('-')) clarity += 10; // Has bullet points
    if (prompt.includes(':')) clarity += 10; // Has labels
    if (prompt.length > 100 && prompt.length < 2000) clarity += 10; // Good length
    
    // Specificity: Based on details and context
    let specificity = 50; // Base score
    if (prompt.includes('Success Criteria') || prompt.includes('Deliverables')) specificity += 15;
    if (prompt.includes('minutes') || prompt.includes('hours')) specificity += 10;
    if (prompt.includes('•')) specificity += 10; // Has specific points
    if (enhancements.length > 3) specificity += 15; // Many enhancements added
    
    // Actionability: Based on clear directives
    let actionability = 55; // Base score
    if (prompt.toLowerCase().includes('create') || prompt.toLowerCase().includes('build')) actionability += 15;
    if (prompt.toLowerCase().includes('implement') || prompt.toLowerCase().includes('develop')) actionability += 10;
    if (prompt.includes('Approach:') || prompt.includes('Strategy:')) actionability += 10;
    if (prompt.includes('Step') || prompt.includes('Task')) actionability += 10;
    
    // Cap at 100
    clarity = Math.min(clarity, 100);
    specificity = Math.min(specificity, 100);
    actionability = Math.min(actionability, 100);
    
    return {
      clarity,
      specificity,
      actionability,
      enhancements
    };
  }
  
  /**
   * Generate a prompt summary for user confirmation
   */
  generateSummary(enhancedPrompt: EnhancedPrompt): string {
    const { metadata } = enhancedPrompt;
    const avgScore = Math.round((metadata.clarity + metadata.specificity + metadata.actionability) / 3);
    
    let quality = 'Good';
    if (avgScore >= 85) quality = 'Excellent';
    else if (avgScore >= 70) quality = 'Very Good';
    else if (avgScore < 50) quality = 'Needs Improvement';
    
    return `Prompt Quality: ${quality} (${avgScore}/100)\n` +
           `• Clarity: ${metadata.clarity}%\n` +
           `• Specificity: ${metadata.specificity}%\n` +
           `• Actionability: ${metadata.actionability}%\n\n` +
           `Enhancements Applied: ${metadata.enhancements.length}`;
  }
  
  /**
   * Extract key phrases for YAML generation
   */
  extractKeyPhrases(prompt: string): string[] {
    const phrases: string[] = [];
    
    // Extract quoted phrases
    const quotedMatches = prompt.match(/"([^"]+)"/g) || [];
    phrases.push(...quotedMatches.map(m => m.replace(/"/g, '')));
    
    // Extract technical terms
    const techTerms = ['API', 'UI', 'database', 'frontend', 'backend', 'service', 'component', 'module'];
    techTerms.forEach(term => {
      if (prompt.toLowerCase().includes(term.toLowerCase())) {
        phrases.push(term);
      }
    });
    
    // Extract action verbs
    const actionVerbs = ['create', 'build', 'implement', 'develop', 'design', 'optimize', 'refactor'];
    actionVerbs.forEach(verb => {
      const regex = new RegExp(`${verb}\\s+([\\w\\s]+)`, 'gi');
      const matches = prompt.match(regex) || [];
      phrases.push(...matches);
    });
    
    return [...new Set(phrases)]; // Remove duplicates
  }
}

// Export singleton instance
export const promptEnhancementEngine = new PromptEnhancementEngine();
