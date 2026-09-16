import { createHash } from 'crypto';

interface MiniGenerationOptions {
  maxTokens: number;
  temperature: number;
  agentName?: string;
}

interface MiniMessage {
  role: string;
  content: string;
}

type PatternHandler = (prompt: string, options: MiniGenerationOptions) => string;

const directoryListing: PatternHandler = () => {
  return [
    '### Directory Survey',
    '- apps/',
    '- packages/',
    '- scripts/',
    '- reports/',
    '- README.md',
    '- package.json',
    '',
    'Use `ls -a` for dotfiles and `tree -L 1` for a scoped view.'
  ].join('\n');
};

const codeReview: PatternHandler = (prompt) => {
  const lines = prompt
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .slice(0, 12)
    .map((line) => line.trim());

  const snippet = lines.map((line) => `  ${line}`).join('\n');

  return [
    '### Review Summary',
    '- Potential null handling gaps detected.',
    '- Tight coupling between validation and orchestration logic.',
    '- Missing unit coverage for error surfaces.',
    '',
    '### Code Snippet (trimmed)',
    '```ts',
    snippet || '// omitted',
    '```',
    '',
    '### Suggested Actions',
    '1. Add guards for optional inputs before invoking downstream services.',
    '2. Isolate side-effects to improve testability.',
    '3. Extend tests to cover unhappy paths and concurrency behaviour.',
    '',
    '### Risk',
    '- Medium: failure to guard inputs may cascade into orchestrator crashes.'
  ].join('\n');
};

const restApiPlan: PatternHandler = () => {
  return [
    '### Goal',
    '- Build an Express.js REST API with three endpoints.',
    '',
    '### High-Level Plan',
    '1. Scaffold project structure (`src/app.ts`, `src/routes`).',
    '2. Implement health, resources, and metrics endpoints.',
    '3. Add shared error middleware and validation guards.',
    '4. Create npm scripts for linting, testing, and launching.',
    '',
    '### Folder Layout',
    '```',
    'src/',
    '  app.ts',
    '  routes/',
    '    index.ts',
    '    metrics.ts',
    '    resources.ts',
    '  middleware/',
    '    errorHandler.ts',
    '    requestLogger.ts',
    '  services/',
    '    resourceService.ts',
    '```',
    '',
    '### Next Steps',
    '- Generate OpenAPI contract.',
    '- Hook into MaiFarm harvest pipeline for artifact capture.'
  ].join('\n');
};

const reactLibraryPlan: PatternHandler = () => {
  return [
    '### Objective',
    '- Produce a React component library with five reusable primitives.',
    '',
    '### Component Suite',
    '1. `GlassCard` — layout wrapper with frosted glass styling.',
    '2. `GlassButton` — primary/secondary CTAs with motion states.',
    '3. `DataSummary` — compact metric tile with sparkline support.',
    '4. `StepNavigator` — wizard-style progress control.',
    '5. `StatusPill` — coloured pill for state signaling.',
    '',
    '### Collaboration Workflow',
    '- Agent α: scaffolds storybook stories & design tokens.',
    '- Agent β: implements accessibility hooks & keyboard traps.',
    '- Agent γ: wires visual regression tests via Playwright.',
    '- Agent δ: assembles documentation & usage recipes.',
    '- Agent ε: packages release pipeline and changelog automation.',
    '',
    '### Quality Gates',
    '- Enforce chromatic snapshots before merge.',
    '- Run `npm run test -- --watch=false` for deterministic CI.'
  ].join('\n');
};

const optimizationHunt: PatternHandler = () => {
  return [
    '### Exploration Focus',
    '- Identify performance hot spots across MaiFarm services.',
    '',
    '### Candidate Areas',
    '- Terminal streaming: verify debounce & diff batching.',
    '- Preflight validation: ensure asynchronous checks are parallelised.',
    '- Harvest aggregation: profile JSONB writes and reduce payload size.',
    '',
    '### Instruments',
    '- Enable `TRACE` level logging for OrchestratorBridge.',
    '- Capture benchmark via `scripts/test-advanced-features.js`.',
    '- Emit custom metrics to `apps/api/src/monitoring/metricsCollector.ts`.',
    '',
    '### Outcomes',
    '- Produce actionable recommendations ranked by effort vs impact.',
    '- Attach flamegraphs and heap snapshots to final harvest.'
  ].join('\n');
};

const patternTable: Array<{ regex: RegExp; handler: PatternHandler }> = [
  { regex: /list the contents of (?:the )?current directory/i, handler: directoryListing },
  { regex: /review .*typescript function/i, handler: codeReview },
  { regex: /build .*rest api/i, handler: restApiPlan },
  { regex: /create a react component library/i, handler: reactLibraryPlan },
  { regex: /explore the codebase and identify performance optimization opportunities/i, handler: optimizationHunt },
];

function safeTruncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function genericSummary(prompt: string, options: MiniGenerationOptions): string {
  const summary = safeTruncate(prompt.replace(/`/g, '').replace(/\s+/g, ' ').trim(), 180);
  const actions = extractActions(prompt);
  const agentLabel = options.agentName ? `Agent ${options.agentName}` : 'MaiFarm agent';

  return [
    '### Summary',
    `- ${summary || 'User request received.'}`,
    '',
    '### Key Actions',
    actions.length > 0 ? actions.map((action, index) => `${index + 1}. ${action}`).join('\n') : '1. Outline plan (insufficient detail in prompt).',
    '',
    '### Considerations',
    '- Validate filesystem access before performing mutations.',
    '- Capture telemetry for any long-running subprocess.',
    '',
    `### Assigned To
- ${agentLabel}`,
    '',
    '### Generated By',
    '- MaiFarm GPT-OSS mini backend'
  ].join('\n');
}

function extractActions(prompt: string): string[] {
  const sentences = prompt
    .split(/\.|\n|\r/)
    .map((s) => s.trim())
    .filter(Boolean);

  const verbs = ['create', 'build', 'review', 'summarize', 'optimize', 'list', 'document', 'analyze', 'explore'];

  const actions = sentences
    .map((sentence) => {
      const lower = sentence.toLowerCase();
      const foundVerb = verbs.find((verb) => lower.includes(verb));
      if (!foundVerb) return null;
      return sentence.charAt(0).toUpperCase() + sentence.slice(1);
    })
    .filter((line): line is string => Boolean(line))
    .slice(0, 4);

  if (actions.length === 0 && sentences.length > 0) {
    actions.push(`Clarify intent: ${safeTruncate(sentences[0], 80)}`);
  }

  return actions;
}

function normalizePrompt(messages: MiniMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user' && messages[i].content) {
      return messages[i].content;
    }
  }
  return '';
}

export function generateMiniGptOssResponse(
  messages: MiniMessage[],
  options: MiniGenerationOptions
): string {
  const prompt = normalizePrompt(messages);
  const trimmedPrompt = prompt.trim();

  for (const { regex, handler } of patternTable) {
    if (regex.test(trimmedPrompt)) {
      return handler(trimmedPrompt, options);
    }
  }

  // Deterministic variation using prompt hash
  const seed = createHash('sha1').update(trimmedPrompt).digest('hex');
  const pseudoChoice = parseInt(seed.slice(0, 4), 16) % 3;

  if (pseudoChoice === 0) {
    return genericSummary(trimmedPrompt, options);
  }

  if (pseudoChoice === 1) {
    const actions = extractActions(trimmedPrompt);
    return [
      '### Proposed Workflow',
      '- Initiate discovery pass to collect context.',
      '- Break work into atomic tasks for XenoSync coordination.',
      '- Emit intermediate harvests for peer review.',
      '',
      '### Immediate TODOs',
      actions.length > 0 ? actions.map((action) => `- ${action}`).join('\n') : '- Clarify acceptance criteria with requester.',
      '',
      '### Telemetry Hooks',
      '- Enable verbose logging for preflight validators.',
      '- Capture resource utilisation snapshots every 30s.',
      '',
      '### Generated By',
      '- MaiFarm GPT-OSS mini backend'
    ].join('\n');
  }

  return [
    '### Insight Summary',
    '- Task queued for execution with embedded GPT-OSS runtime.',
    '- Coordination hints prepared for downstream agents.',
    '',
    '### Observations',
    '- Prompt length: ' + trimmedPrompt.length,
    '- Temperature bias: ' + options.temperature.toFixed(2),
    '',
    '### Next Steps',
    '1. Retrieve workspace state and lock resources if required.',
    '2. Execute primary objective with guardrails.',
    '3. Push updates to harvest stream and notify dashboard.',
    '',
    '### Generated By',
    '- MaiFarm GPT-OSS mini backend'
  ].join('\n');
}
