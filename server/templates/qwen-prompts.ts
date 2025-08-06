/**
 * Qwen3-Coder optimized prompt templates
 * 
 * These templates are designed to leverage Qwen3-Coder's specific capabilities:
 * - 480B parameters (35B active) for efficient processing
 * - Enhanced chain-of-thought reasoning
 * - Large context window (256K tokens)
 * - Strong code generation capabilities
 */

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  provider: 'qwen' | 'claude' | 'both';
  template: string;
  variables?: string[];
  category: string;
  optimizations?: {
    chainOfThought?: boolean;
    stepByStep?: boolean;
    contextWindow?: 'standard' | 'large';
    specialInstructions?: string[];
  };
}

export const qwenPromptTemplates: PromptTemplate[] = [
  {
    id: 'qwen-farm-orchestration',
    name: 'Farm Orchestration with Chain of Thought',
    description: 'Optimized for Qwen3-Coder\'s reasoning capabilities',
    provider: 'qwen',
    category: 'orchestration',
    template: `[Task Orchestration for Multiple Agents]

Project: {{projectName}}
Description: {{projectDescription}}
Number of Agents: {{agentCount}}

Please orchestrate this task using a chain-of-thought approach:

1. **Analysis Phase** (Think step by step):
   - Break down the main objective into subtasks
   - Identify dependencies between tasks
   - Determine optimal agent allocation

2. **Planning Phase**:
   - Create a detailed execution plan
   - Assign specific roles to each agent
   - Define clear interfaces between agents

3. **Implementation Strategy**:
   - For each agent, provide:
     * Specific responsibilities
     * Required capabilities
     * Expected outputs
     * Communication protocols

4. **Coordination Protocol**:
   - Define how agents will share progress
   - Specify synchronization points
   - Handle potential conflicts

Please structure your response with clear sections and use your enhanced reasoning to optimize the workflow.`,
    variables: ['projectName', 'projectDescription', 'agentCount'],
    optimizations: {
      chainOfThought: true,
      stepByStep: true,
      contextWindow: 'standard'
    }
  },

  {
    id: 'qwen-code-generation-large',
    name: 'Large Codebase Generation',
    description: 'Leverages Qwen\'s 256K context window for comprehensive code generation',
    provider: 'qwen',
    category: 'development',
    template: `[Large-Scale Code Generation Task]

Project Type: {{projectType}}
Technologies: {{technologies}}
Architecture: {{architecture}}

Context Files (if provided):
{{contextFiles}}

Requirements:
{{requirements}}

Using your large context window and code generation capabilities, please:

1. **Architecture Design**:
   - Design the overall system architecture
   - Define module boundaries and interfaces
   - Consider scalability and maintainability

2. **Implementation Plan**:
   - Break down into logical components
   - Prioritize implementation order
   - Identify reusable patterns

3. **Code Generation**:
   - Generate complete, production-ready code
   - Include proper error handling
   - Add comprehensive documentation
   - Follow best practices for {{technologies}}

4. **Testing Strategy**:
   - Unit test templates
   - Integration test scenarios
   - Performance considerations

Please generate the complete implementation with all necessary files and configurations.`,
    variables: ['projectType', 'technologies', 'architecture', 'contextFiles', 'requirements'],
    optimizations: {
      chainOfThought: true,
      contextWindow: 'large',
      specialInstructions: [
        'Use the full context window for comprehensive analysis',
        'Generate complete, runnable code',
        'Include all necessary configuration files'
      ]
    }
  },

  {
    id: 'qwen-refactoring-analysis',
    name: 'Deep Refactoring Analysis',
    description: 'Comprehensive code analysis and refactoring using Qwen\'s analytical capabilities',
    provider: 'qwen',
    category: 'refactoring',
    template: `[Deep Code Refactoring Analysis]

Codebase Overview:
{{codebaseDescription}}

Files to Analyze:
{{filePaths}}

Refactoring Goals:
{{refactoringGoals}}

Please perform a comprehensive analysis:

**Step 1: Code Analysis**
- Identify code smells and anti-patterns
- Analyze complexity metrics
- Find duplicate code segments
- Assess test coverage gaps

**Step 2: Dependency Analysis**
- Map out module dependencies
- Identify circular dependencies
- Suggest decoupling strategies

**Step 3: Refactoring Plan**
For each identified issue:
- Describe the problem
- Propose solution with code examples
- Estimate impact and effort
- Provide migration strategy

**Step 4: Implementation Roadmap**
- Prioritize refactoring tasks
- Define phases with clear milestones
- Suggest automated tooling

Use your analytical capabilities to provide deep insights and practical solutions.`,
    variables: ['codebaseDescription', 'filePaths', 'refactoringGoals'],
    optimizations: {
      chainOfThought: true,
      stepByStep: true,
      contextWindow: 'large'
    }
  },

  {
    id: 'qwen-collaborative-development',
    name: 'Multi-Agent Collaborative Development',
    description: 'Optimized prompt for coordinating multiple Qwen agents',
    provider: 'qwen',
    category: 'collaboration',
    template: `[Multi-Agent Collaborative Development Task]

Project: {{projectName}}
Team Size: {{teamSize}} agents
Collaboration Mode: {{collaborationMode}}

Agent Roles:
{{agentRoles}}

Shared Context:
{{sharedContext}}

**Collaboration Protocol:**

1. **Initial Coordination**:
   - Each agent acknowledges their role
   - Establish communication channels
   - Define shared data structures

2. **Task Distribution**:
   Agent assignments based on specialization:
   {{taskAssignments}}

3. **Progress Synchronization**:
   - Regular status updates every {{syncInterval}}
   - Shared progress tracking in: /tmp/claude_coordination/
   - Conflict resolution protocol

4. **Integration Points**:
   - Define clear interfaces between components
   - Specify data formats and APIs
   - Handle dependencies explicitly

5. **Quality Assurance**:
   - Cross-agent code reviews
   - Integration testing responsibilities
   - Performance monitoring

Each agent should maintain awareness of others' progress and actively collaborate.`,
    variables: ['projectName', 'teamSize', 'collaborationMode', 'agentRoles', 'sharedContext', 'taskAssignments', 'syncInterval'],
    optimizations: {
      chainOfThought: true,
      specialInstructions: [
        'Emphasize clear communication protocols',
        'Define explicit handoff points',
        'Include conflict resolution strategies'
      ]
    }
  },

  {
    id: 'qwen-exploration-mode',
    name: 'Autonomous Exploration Mode',
    description: 'GoWild mode optimized for Qwen\'s creative capabilities',
    provider: 'qwen',
    category: 'exploration',
    template: `[Autonomous Exploration Task - GoWild Mode]

Base Objective: {{objective}}
Creativity Level: {{creativityLevel}}/5
Boundaries: {{boundaries}}
Time Limit: {{timeLimit}}

**Exploration Framework:**

Phase 1 - Divergent Thinking ({{phase1Time}}):
- Generate multiple innovative approaches
- Challenge conventional solutions
- Explore edge cases and unusual patterns
- Document all ideas, even unconventional ones

Phase 2 - Analysis & Filtering ({{phase2Time}}):
- Evaluate feasibility of each approach
- Consider technical constraints
- Assess innovation vs. practicality
- Select top 3 most promising directions

Phase 3 - Deep Exploration ({{phase3Time}}):
For each selected direction:
- Prototype key concepts
- Identify potential breakthroughs
- Document learning and insights
- Prepare proof-of-concept code

Phase 4 - Synthesis ({{phase4Time}}):
- Combine best elements from explorations
- Create unified solution
- Document innovative aspects
- Prepare implementation roadmap

Remember: Be creative but stay within defined boundaries. Document all discoveries for future reference.`,
    variables: ['objective', 'creativityLevel', 'boundaries', 'timeLimit', 'phase1Time', 'phase2Time', 'phase3Time', 'phase4Time'],
    optimizations: {
      chainOfThought: true,
      specialInstructions: [
        'Encourage creative exploration',
        'Balance innovation with practicality',
        'Document thought process thoroughly'
      ]
    }
  }
];

/**
 * Get provider-specific prompt optimizations
 */
export function getProviderOptimizations(provider: 'claude' | 'qwen'): Record<string, any> {
  if (provider === 'qwen') {
    return {
      maxTokens: 256000, // Qwen's larger context window
      temperature: 0.7, // Slightly lower for more focused responses
      topP: 0.9,
      presencePenalty: 0.1,
      frequencyPenalty: 0.1,
      systemPrompt: `You are Qwen3-Coder, a highly capable AI assistant with 480B parameters optimized for code generation and complex reasoning tasks. 
      You have access to a 256K token context window, allowing you to process and generate large amounts of code.
      Use chain-of-thought reasoning for complex problems and provide comprehensive, production-ready solutions.`
    };
  }
  
  // Claude defaults
  return {
    maxTokens: 200000,
    temperature: 0.8,
    topP: 0.95,
    systemPrompt: `You are Claude, an AI assistant created by Anthropic to be helpful, harmless, and honest.`
  };
}

/**
 * Enhance prompt based on provider capabilities
 */
export function enhancePromptForProvider(
  prompt: string, 
  provider: 'claude' | 'qwen',
  options?: {
    useChainOfThought?: boolean;
    contextSize?: 'standard' | 'large';
    taskType?: string;
  }
): string {
  let enhancedPrompt = prompt;
  
  if (provider === 'qwen') {
    // Add Qwen-specific enhancements
    if (options?.useChainOfThought) {
      enhancedPrompt = `Please approach this task using chain-of-thought reasoning. Think through each step carefully before proceeding.\n\n${enhancedPrompt}`;
    }
    
    if (options?.contextSize === 'large') {
      enhancedPrompt = `[Note: This task may involve processing large amounts of data. You have access to a 256K token context window.]\n\n${enhancedPrompt}`;
    }
    
    // Add task-specific optimizations
    if (options?.taskType === 'code-generation') {
      enhancedPrompt += '\n\nPlease ensure the generated code is complete, well-documented, and follows best practices.';
    } else if (options?.taskType === 'analysis') {
      enhancedPrompt += '\n\nProvide comprehensive analysis with specific examples and actionable recommendations.';
    }
  }
  
  return enhancedPrompt;
}

/**
 * Get recommended template for a given task type and provider
 */
export function getRecommendedTemplate(
  taskType: string,
  provider: 'claude' | 'qwen'
): PromptTemplate | undefined {
  // Filter templates by provider compatibility
  const compatibleTemplates = qwenPromptTemplates.filter(
    t => t.provider === provider || t.provider === 'both'
  );
  
  // Find best match for task type
  return compatibleTemplates.find(t => 
    t.category === taskType || 
    t.name.toLowerCase().includes(taskType.toLowerCase())
  );
}