import { EventEmitter } from 'events';

interface EnhancementRequest {
  prompt: string;
  context?: string;
  purpose?: 'farm' | 'task' | 'agent' | 'workflow';
  style?: 'technical' | 'creative' | 'balanced';
  maxLength?: number;
  provider?: 'claude' | 'openai';
}

interface EnhancementResponse {
  enhanced_prompt: string;
  original_prompt: string;
  suggestions: string[];
  improvements: {
    clarity?: string;
    specificity?: string;
    context?: string;
    structure?: string;
  };
  confidence: number;
}

interface EnhancementTemplate {
  id: string;
  purpose: string;
  template: string;
  variables: string[];
}

export class PromptEnhancerService extends EventEmitter {
  private static instance: PromptEnhancerService;
  private enhancementTemplates: Map<string, EnhancementTemplate>;
  private enhancementHistory: Array<{
    timestamp: Date;
    original: string;
    enhanced: string;
    feedback?: string;
  }> = [];

  private constructor() {
    super();
    this.enhancementTemplates = new Map();
    this.initializeTemplates();
  }

  static getInstance(): PromptEnhancerService {
    if (!PromptEnhancerService.instance) {
      PromptEnhancerService.instance = new PromptEnhancerService();
    }
    return PromptEnhancerService.instance;
  }

  private initializeTemplates() {
    // Farm creation template
    this.enhancementTemplates.set('farm-creation', {
      id: 'farm-creation',
      purpose: 'Enhance prompts for creating AI agent farms',
      template: `
Transform this request into a comprehensive multi-agent orchestration specification:

Original Request: {prompt}

Enhanced Specification should include:
1. Clear objective and success criteria
2. Specific agent roles with defined responsibilities
3. Task dependencies and coordination requirements
4. Performance metrics and quality checkpoints
5. Error handling and fallback strategies
6. Resource constraints and optimization goals

Context: {context}
Focus: Multi-agent collaboration for software development
Output: Detailed, actionable prompt that leverages each agent's strengths
      `,
      variables: ['prompt', 'context']
    });

    // Task enhancement template
    this.enhancementTemplates.set('task-enhancement', {
      id: 'task-enhancement',
      purpose: 'Enhance task descriptions for clarity and actionability',
      template: `
Enhance this task description for maximum clarity and efficiency:

Original Task: {prompt}

Improved task should:
- Have clear, measurable objectives
- Include specific technical requirements
- Define acceptance criteria
- Specify resource needs
- Include relevant context and constraints
- Break down into logical subtasks if complex

Purpose: {purpose}
Style: {style}
      `,
      variables: ['prompt', 'purpose', 'style']
    });

    // Agent coordination template
    this.enhancementTemplates.set('agent-coordination', {
      id: 'agent-coordination',
      purpose: 'Optimize prompts for multi-agent coordination',
      template: `
Design an optimal multi-agent coordination strategy for:

Task: {prompt}

Consider:
- Agent specializations and capabilities
- Parallel vs sequential execution
- Communication protocols between agents
- Work distribution and load balancing
- Synchronization points and dependencies
- Quality assurance checkpoints

Output a structured plan that maximizes efficiency and minimizes conflicts.
      `,
      variables: ['prompt']
    });

    // Model-First Reasoning template (arxiv 2512.14474)
    // Enforces explicit problem modeling before execution
    this.enhancementTemplates.set('model-first-reasoning', {
      id: 'model-first-reasoning',
      purpose: 'Enforce explicit problem modeling before agent execution to reduce hallucinations',
      template: `
IMPORTANT: Before beginning any implementation work, you MUST first construct an explicit problem model.

## Your Task:
{prompt}

## Step 1: Define Entities (REQUIRED)
List all relevant objects, files, functions, services, and resources involved in this task:
- For each entity: name, type (file/function/class/module/service/resource), key properties
- Map relationships between entities (depends_on, contains, produces, consumes)

## Step 2: Define State Variables (REQUIRED)
What state needs to be tracked during execution?
- Variable name, type, possible values (domain)
- Initial state vs target state
- Which variables indicate success?

## Step 3: Define Actions (REQUIRED)
What operations can you perform?
- For each action: name, description, preconditions (what must be true before), effects (what changes after)
- Prioritize actions (1-10 scale)
- Estimate duration for complex actions

## Step 4: Define Constraints (REQUIRED)
What rules and limitations must be followed?
- Temporal constraints (ordering requirements)
- Resource constraints (memory, API limits, file access)
- Logical constraints (invariants that must always hold)
- Dependencies between actions

## Step 5: Define Success Goals (REQUIRED)
What constitutes successful completion?
- Measurable success criteria
- Verification conditions (how to check if done correctly)
- Priority of goals if multiple

## Execution Protocol:
1. ONLY proceed with implementation AFTER completing all 5 steps above
2. Work ONLY within the bounds of your defined model
3. If you encounter something not in your model, STOP and extend the model first
4. Verify your outputs against the defined constraints and goals
5. Report any constraint violations immediately

Context: {context}
Agent Role: {agentRole}
      `,
      variables: ['prompt', 'context', 'agentRole']
    });

    // Causal Awareness template (inspired by DEMOCRITUS, arxiv 2512.07796)
    // Enforces understanding of causal dependencies
    this.enhancementTemplates.set('causal-awareness', {
      id: 'causal-awareness',
      purpose: 'Enforce understanding of causal dependencies for intelligent task ordering',
      template: `
## Causal Task Ordering

Your task has the following causal dependencies that MUST be respected:

### Task Order (from topological sort):
{taskOrder}

### Dependencies:
{dependencies}

### Causal Constraints:
{causalConstraints}

### Your Role:
You are responsible for the following tasks in this order:
{assignedTasks}

### Execution Rules:
1. Do NOT start a task until ALL its dependencies are complete
2. Before each task, verify the preconditions are satisfied
3. After completing a task, verify its effects are realized
4. If a dependency is blocked, work on independent tasks first
5. Report conflicts between causal expectations and actual state

### Your Task:
{prompt}

Proceed following the causal ordering above.
      `,
      variables: ['prompt', 'taskOrder', 'dependencies', 'causalConstraints', 'assignedTasks']
    });

    // Combined Model-First + Causal template for full integration
    this.enhancementTemplates.set('model-causal-integrated', {
      id: 'model-causal-integrated',
      purpose: 'Full integration of Model-First Reasoning with Causal Model awareness',
      template: `
## Problem Model Context
You are working within an explicitly modeled problem domain.

### Entities in Scope:
{entities}

### State Variables:
{variables}

### Your Assigned Actions:
{actions}

### Constraints to Follow:
{constraints}

### Goals to Achieve:
{goals}

## Causal Ordering Context
Task execution follows this causal order:

### Task Sequence:
{taskOrder}

### Your Dependencies:
{dependencies}

## Execution Protocol:
1. Verify all preconditions before starting each action
2. Follow the causal ordering - do not skip ahead
3. After each action, verify its effects
4. Check constraints continuously
5. Report progress toward goals

## Your Task:
{prompt}

Proceed methodically, respecting both the problem model and causal ordering.
      `,
      variables: ['prompt', 'entities', 'variables', 'actions', 'constraints', 'goals', 'taskOrder', 'dependencies']
    });
  }

  async enhancePrompt(request: EnhancementRequest): Promise<EnhancementResponse> {
    try {
      // Analyze the original prompt
      const analysis = this.analyzePrompt(request.prompt);
      
      // Select appropriate enhancement strategy
      const strategy = this.selectEnhancementStrategy(request);
      
      // Generate enhanced prompt using our AI-like logic
      let enhanced = await this.generateEnhancement(request, analysis, strategy);
      
      // Apply provider-specific enhancements
      // Note: Provider-specific optimizations removed after Llama/GPT-OSS deprecation
      if (request.provider === 'claude') {
        // Claude-specific enhancements could be added here
        // For now, Claude works well with the standard enhancement
      } else if (request.provider === 'openai') {
        // OpenAI-specific enhancements could be added here
        // For now, OpenAI works well with the standard enhancement
      }
      
      // Create suggestions based on analysis
      const suggestions = this.generateSuggestions(analysis, request);
      
      // Identify improvements made
      const improvements = this.identifyImprovements(request.prompt, enhanced);
      
      // Calculate confidence score
      const confidence = this.calculateConfidence(analysis, enhanced);
      
      // Store in history
      this.enhancementHistory.push({
        timestamp: new Date(),
        original: request.prompt,
        enhanced: enhanced
      });
      
      // Emit enhancement event
      this.emit('prompt:enhanced', {
        original: request.prompt,
        enhanced: enhanced,
        purpose: request.purpose
      });
      
      return {
        enhanced_prompt: enhanced,
        original_prompt: request.prompt,
        suggestions,
        improvements,
        confidence
      };
    } catch (error) {
      console.error('Prompt enhancement error:', error);
      throw error;
    }
  }

  private analyzePrompt(prompt: string): any {
    const analysis = {
      length: prompt.length,
      complexity: this.calculateComplexity(prompt),
      clarity: this.assessClarity(prompt),
      specificity: this.assessSpecificity(prompt),
      keywords: this.extractKeywords(prompt),
      intent: this.detectIntent(prompt),
      technicalTerms: this.extractTechnicalTerms(prompt),
      hasObjective: prompt.includes('to ') || prompt.includes('for '),
      hasContext: prompt.length > 50,
      hasConstraints: prompt.includes('must') || prompt.includes('should'),
      hasCriteria: prompt.includes('ensure') || prompt.includes('verify')
    };
    
    return analysis;
  }

  private calculateComplexity(prompt: string): string {
    const sentences = prompt.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgWordCount = prompt.split(/\s+/).length / Math.max(sentences.length, 1);
    
    if (avgWordCount < 10) return 'simple';
    if (avgWordCount < 20) return 'moderate';
    return 'complex';
  }

  private assessClarity(prompt: string): number {
    // Score from 0 to 1
    let score = 1.0;
    
    // Deduct for vague terms
    const vagueTerms = ['thing', 'stuff', 'something', 'somehow', 'maybe'];
    vagueTerms.forEach(term => {
      if (prompt.toLowerCase().includes(term)) score -= 0.1;
    });
    
    // Deduct for missing punctuation
    if (!prompt.includes('.') && !prompt.includes('!') && !prompt.includes('?')) {
      score -= 0.1;
    }
    
    // Deduct for excessive length without structure
    if (prompt.length > 200 && !prompt.includes('\n')) {
      score -= 0.2;
    }
    
    return Math.max(0, score);
  }

  private assessSpecificity(prompt: string): number {
    let score = 0.5; // Start neutral
    
    // Add points for specific technical terms
    const techTerms = ['API', 'database', 'frontend', 'backend', 'component', 'function', 'class', 'test'];
    techTerms.forEach(term => {
      if (prompt.toLowerCase().includes(term.toLowerCase())) score += 0.1;
    });
    
    // Add points for numbers and metrics
    if (/\d+/.test(prompt)) score += 0.1;
    
    // Add points for file/path references
    if (/[\/\\]|\.\w+/.test(prompt)) score += 0.1;
    
    return Math.min(1, score);
  }

  private extractKeywords(prompt: string): string[] {
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were']);
    const words = prompt.toLowerCase().split(/\W+/).filter(word => word.length > 2 && !commonWords.has(word));
    
    // Count frequency
    const frequency: Map<string, number> = new Map();
    words.forEach(word => {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    });
    
    // Sort by frequency and return top keywords
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  private detectIntent(prompt: string): string {
    const lower = prompt.toLowerCase();
    
    if (lower.includes('fix') || lower.includes('debug') || lower.includes('error')) return 'fix';
    if (lower.includes('create') || lower.includes('build') || lower.includes('implement')) return 'create';
    if (lower.includes('test') || lower.includes('verify') || lower.includes('check')) return 'test';
    if (lower.includes('refactor') || lower.includes('optimize') || lower.includes('improve')) return 'refactor';
    if (lower.includes('analyze') || lower.includes('review') || lower.includes('audit')) return 'analyze';
    if (lower.includes('deploy') || lower.includes('release') || lower.includes('publish')) return 'deploy';
    
    return 'general';
  }

  private extractTechnicalTerms(prompt: string): string[] {
    const technicalPatterns = [
      /\b(API|REST|GraphQL|WebSocket)\b/gi,
      /\b(React|Vue|Angular|Svelte)\b/gi,
      /\b(Node|Python|Java|TypeScript|JavaScript)\b/gi,
      /\b(Docker|Kubernetes|AWS|Azure|GCP)\b/gi,
      /\b(MongoDB|PostgreSQL|MySQL|Redis)\b/gi,
      /\b(Jest|Cypress|Mocha|Playwright)\b/gi,
      /\b(Git|GitHub|GitLab|CI\/CD)\b/gi
    ];
    
    const terms = new Set<string>();
    technicalPatterns.forEach(pattern => {
      const matches = prompt.match(pattern);
      if (matches) {
        matches.forEach(match => terms.add(match));
      }
    });
    
    return Array.from(terms);
  }

  private selectEnhancementStrategy(request: EnhancementRequest): string {
    if (request.purpose === 'farm') return 'farm-creation';
    if (request.purpose === 'task') return 'task-enhancement';
    if (request.purpose === 'agent') return 'agent-coordination';
    
    // Default based on content analysis
    const lower = request.prompt.toLowerCase();
    if (lower.includes('agent') || lower.includes('coordinate')) return 'agent-coordination';
    if (lower.includes('task') || lower.includes('implement')) return 'task-enhancement';
    
    return 'farm-creation';
  }

  private async generateEnhancement(
    request: EnhancementRequest,
    analysis: any,
    strategy: string
  ): Promise<string> {
    const template = this.enhancementTemplates.get(strategy);

    if (!template) {
      // Fallback enhancement without template
      return this.defaultEnhancement(request, analysis);
    }

    // FIXED: Use actual AI API for prompt enhancement instead of rule-based logic
    try {
      const { aiProviderManager } = await import('../config/aiProviders');

      // Check if AI provider is available
      const provider = request.provider === 'openai' ? 'openai' : 'claude';
      const providerEnum = provider === 'openai' ?
        (await import('../config/aiProviders')).AIProvider.OPENAI :
        (await import('../config/aiProviders')).AIProvider.CLAUDE;

      if (!aiProviderManager.isProviderEnabled(providerEnum)) {
        // Fall back to rule-based if no AI provider available
        return this.ruleBasedEnhancement(request, analysis, strategy);
      }

      // Build enhancement prompt using template
      const systemPrompt = template.template
        .replace('{prompt}', request.prompt)
        .replace('{context}', request.context || 'No additional context provided')
        .replace('{purpose}', request.purpose || 'general')
        .replace('{style}', request.style || 'balanced');

      const { aiOrchestrator } = await import('./aiOrchestrator');

      // Call AI provider to enhance prompt
      const response = await aiOrchestrator.submitTask({
        farmId: 'prompt-enhancement',
        agentId: 'enhancer',
        taskId: `enhance-${Date.now()}`,
        prompt: systemPrompt,
        provider: provider as 'claude' | 'openai'
      });

      return response.response || this.ruleBasedEnhancement(request, analysis, strategy);
    } catch (error) {
      console.error('AI-based prompt enhancement failed, falling back to rule-based:', error);
      // Fallback to rule-based enhancement on error
      return this.ruleBasedEnhancement(request, analysis, strategy);
    }
  }

  private ruleBasedEnhancement(
    request: EnhancementRequest,
    analysis: any,
    strategy: string
  ): string {
    let enhanced = request.prompt;
    
    // Add objective if missing
    if (!analysis.hasObjective) {
      enhanced = `Objective: ${enhanced}`;
    }
    
    // Add technical context based on detected terms
    if (analysis.technicalTerms.length > 0) {
      const techContext = `\n\nTechnical Context: Working with ${analysis.technicalTerms.join(', ')}`;
      enhanced += techContext;
    }
    
    // Add structure based on intent
    switch (analysis.intent) {
      case 'fix':
        enhanced += '\n\nDebugging Requirements:\n';
        enhanced += '- Identify root cause of the issue\n';
        enhanced += '- Implement comprehensive fix\n';
        enhanced += '- Add tests to prevent regression\n';
        enhanced += '- Document the solution\n';
        break;
        
      case 'create':
        enhanced += '\n\nImplementation Requirements:\n';
        enhanced += '- Design modular, maintainable architecture\n';
        enhanced += '- Follow best practices and coding standards\n';
        enhanced += '- Include comprehensive error handling\n';
        enhanced += '- Write unit and integration tests\n';
        enhanced += '- Create documentation\n';
        break;
        
      case 'test':
        enhanced += '\n\nTesting Requirements:\n';
        enhanced += '- Unit tests for individual components\n';
        enhanced += '- Integration tests for system interactions\n';
        enhanced += '- Edge case handling\n';
        enhanced += '- Performance benchmarks\n';
        enhanced += '- Coverage reports\n';
        break;
        
      case 'refactor':
        enhanced += '\n\nRefactoring Goals:\n';
        enhanced += '- Improve code readability and maintainability\n';
        enhanced += '- Optimize performance where applicable\n';
        enhanced += '- Reduce technical debt\n';
        enhanced += '- Maintain backward compatibility\n';
        enhanced += '- Update documentation\n';
        break;
    }
    
    // Add collaboration instructions for multi-agent context
    if (strategy === 'farm-creation' || strategy === 'agent-coordination') {
      enhanced += '\n\nMulti-Agent Coordination:\n';
      enhanced += '- Agents should work in parallel where possible\n';
      enhanced += '- Clear communication between agents via coordination files\n';
      enhanced += '- Each agent focuses on their specialized domain\n';
      enhanced += '- Regular synchronization points for integration\n';
      enhanced += '- Collective quality assurance before completion\n';
    }
    
    // Add success criteria if not present
    if (!analysis.hasCriteria) {
      enhanced += '\n\nSuccess Criteria:\n';
      enhanced += '- All requirements implemented and tested\n';
      enhanced += '- Code passes linting and type checking\n';
      enhanced += '- Documentation is complete and accurate\n';
      enhanced += '- No regression in existing functionality\n';
    }
    
    return enhanced;
  }

  private defaultEnhancement(request: EnhancementRequest, analysis: any): string {
    let enhanced = request.prompt;
    
    // Basic improvements
    if (analysis.clarity < 0.5) {
      enhanced = enhanced.replace(/\bthing\b/gi, 'component');
      enhanced = enhanced.replace(/\bstuff\b/gi, 'functionality');
    }
    
    // Add structure
    if (!enhanced.includes('\n')) {
      const sentences = enhanced.split(/(?<=[.!?])\s+/);
      if (sentences.length > 2) {
        enhanced = sentences.join('\n');
      }
    }
    
    // Add context if missing
    if (!analysis.hasContext && request.context) {
      enhanced = `Context: ${request.context}\n\n${enhanced}`;
    }
    
    return enhanced;
  }

  private generateSuggestions(analysis: any, request: EnhancementRequest): string[] {
    const suggestions: string[] = [];
    
    if (analysis.clarity < 0.7) {
      suggestions.push('Consider using more specific technical terms instead of generic words');
    }
    
    if (analysis.specificity < 0.5) {
      suggestions.push('Add specific requirements, metrics, or acceptance criteria');
    }
    
    if (!analysis.hasObjective) {
      suggestions.push('Clearly state the primary objective or goal');
    }
    
    if (!analysis.hasConstraints) {
      suggestions.push('Include any constraints, limitations, or requirements');
    }
    
    if (analysis.complexity === 'complex' && !request.prompt.includes('\n')) {
      suggestions.push('Break down complex requirements into structured sections');
    }
    
    if (analysis.technicalTerms.length === 0) {
      suggestions.push('Include relevant technical details about the stack or architecture');
    }
    
    return suggestions;
  }

  private identifyImprovements(original: string, enhanced: string): any {
    const improvements: any = {};
    
    if (enhanced.length > original.length * 1.5) {
      improvements.structure = 'Added detailed structure and organization';
    }
    
    if (enhanced.includes('Requirements:') || enhanced.includes('Criteria:')) {
      improvements.specificity = 'Added specific requirements and success criteria';
    }
    
    if (enhanced.includes('Context:') && !original.includes('Context:')) {
      improvements.context = 'Added contextual information for better understanding';
    }
    
    if (enhanced.split('\n').length > original.split('\n').length) {
      improvements.clarity = 'Improved readability with better formatting';
    }
    
    return improvements;
  }

  private calculateConfidence(analysis: any, enhanced: string): number {
    let confidence = 0.5; // Base confidence
    
    // Increase confidence based on improvements
    if (analysis.clarity > 0.7) confidence += 0.1;
    if (analysis.specificity > 0.6) confidence += 0.1;
    if (analysis.hasObjective) confidence += 0.1;
    if (analysis.technicalTerms.length > 2) confidence += 0.1;
    if (enhanced.length > 100) confidence += 0.1;
    
    return Math.min(0.95, confidence); // Cap at 95%
  }

  // Public methods for external use
  
  async getEnhancementHistory(limit: number = 10): Promise<any[]> {
    return this.enhancementHistory.slice(-limit);
  }

  async provideFeedback(originalPrompt: string, feedback: string): Promise<void> {
    const entry = this.enhancementHistory.find(h => h.original === originalPrompt);
    if (entry) {
      entry.feedback = feedback;
      this.emit('feedback:received', { original: originalPrompt, feedback });
    }
  }

  getTemplates(): EnhancementTemplate[] {
    return Array.from(this.enhancementTemplates.values());
  }
}

// Export singleton instance
export const promptEnhancer = PromptEnhancerService.getInstance();