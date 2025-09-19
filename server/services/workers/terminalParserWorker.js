/**
 * Terminal Parser Worker Thread
 * Processes terminal output in a separate thread to avoid blocking main thread
 */

const { parentPort } = require('worker_threads');

// Activity patterns for detection
const ACTIVITY_PATTERNS = {
  command: /^\$\s+(.+)$/,
  error: /error|failed|exception|traceback/i,
  success: /success|completed|done|finished/i,
  file_operation: /creating|writing|reading|deleting|moving|copying/i,
  git_operation: /git\s+(add|commit|push|pull|clone|checkout)/i,
  build_operation: /npm|yarn|make|gradle|maven|cargo/i,
  test_operation: /test|spec|jest|mocha|pytest/i,
  api_call: /GET|POST|PUT|DELETE|PATCH|fetch|axios/i,
  thinking: /thinking|analyzing|processing|considering/i,
  code_block: /```[\s\S]*?```/,
  file_path: /(?:\/[\w.-]+)+(?:\/[\w.-]+)*\.[\w]+/g
};

// Parse terminal output for activities
function parseActivities(output, agentId, sequence) {
  const activities = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    // Check for command execution
    const commandMatch = line.match(ACTIVITY_PATTERNS.command);
    if (commandMatch) {
      activities.push({
        type: 'command',
        content: commandMatch[1],
        timestamp: Date.now(),
        agentId,
        sequence
      });
      continue;
    }
    
    // Check for errors
    if (ACTIVITY_PATTERNS.error.test(line)) {
      activities.push({
        type: 'error',
        content: line,
        timestamp: Date.now(),
        agentId,
        sequence,
        severity: detectErrorSeverity(line)
      });
      continue;
    }
    
    // Check for success messages
    if (ACTIVITY_PATTERNS.success.test(line)) {
      activities.push({
        type: 'success',
        content: line,
        timestamp: Date.now(),
        agentId,
        sequence
      });
      continue;
    }
    
    // Check for file operations
    if (ACTIVITY_PATTERNS.file_operation.test(line)) {
      const filePaths = line.match(ACTIVITY_PATTERNS.file_path) || [];
      activities.push({
        type: 'file_operation',
        content: line,
        files: filePaths,
        timestamp: Date.now(),
        agentId,
        sequence
      });
      continue;
    }
    
    // Check for git operations
    if (ACTIVITY_PATTERNS.git_operation.test(line)) {
      activities.push({
        type: 'git_operation',
        content: line,
        timestamp: Date.now(),
        agentId,
        sequence
      });
      continue;
    }
    
    // Check for build operations
    if (ACTIVITY_PATTERNS.build_operation.test(line)) {
      activities.push({
        type: 'build_operation',
        content: line,
        timestamp: Date.now(),
        agentId,
        sequence
      });
      continue;
    }
    
    // Check for test operations
    if (ACTIVITY_PATTERNS.test_operation.test(line)) {
      activities.push({
        type: 'test_operation',
        content: line,
        timestamp: Date.now(),
        agentId,
        sequence,
        result: detectTestResult(line)
      });
      continue;
    }
    
    // Check for API calls
    if (ACTIVITY_PATTERNS.api_call.test(line)) {
      activities.push({
        type: 'api_call',
        content: line,
        timestamp: Date.now(),
        agentId,
        sequence
      });
      continue;
    }
    
    // Check for thinking/processing
    if (ACTIVITY_PATTERNS.thinking.test(line)) {
      activities.push({
        type: 'thinking',
        content: line,
        timestamp: Date.now(),
        agentId,
        sequence
      });
    }
  }
  
  // Detect code blocks
  const codeBlocks = output.match(ACTIVITY_PATTERNS.code_block) || [];
  for (const block of codeBlocks) {
    const language = detectCodeLanguage(block);
    activities.push({
      type: 'code_block',
      content: block,
      language,
      timestamp: Date.now(),
      agentId,
      sequence
    });
  }
  
  return activities;
}

// Detect error severity
function detectErrorSeverity(line) {
  if (/fatal|critical|emergency/i.test(line)) return 'critical';
  if (/error|exception/i.test(line)) return 'error';
  if (/warning|warn/i.test(line)) return 'warning';
  return 'info';
}

// Detect test results
function detectTestResult(line) {
  if (/passed|success|✓/i.test(line)) return 'passed';
  if (/failed|error|✗|✕/i.test(line)) return 'failed';
  if (/skipped|pending/i.test(line)) return 'skipped';
  return 'unknown';
}

// Detect code language from code block
function detectCodeLanguage(block) {
  const match = block.match(/```(\w+)/);
  if (match) return match[1];
  
  // Heuristic detection
  if (/function|const|let|var|=>/i.test(block)) return 'javascript';
  if (/def |class |import |from |print/i.test(block)) return 'python';
  if (/interface |public |private |class /i.test(block)) return 'typescript';
  if (/struct |fn |impl |let |mut/i.test(block)) return 'rust';
  if (/func |package |import |var |const/i.test(block)) return 'go';
  
  return 'unknown';
}

// Calculate agent status from activities
function calculateAgentStatus(activities) {
  if (!activities.length) return 'idle';
  
  const recentActivities = activities.slice(-10); // Last 10 activities
  
  // Check for errors
  const hasErrors = recentActivities.some(a => a.type === 'error' && a.severity !== 'warning');
  if (hasErrors) return 'error';
  
  // Check for active operations
  const hasActiveOps = recentActivities.some(a => 
    ['command', 'build_operation', 'test_operation', 'api_call'].includes(a.type)
  );
  if (hasActiveOps) return 'working';
  
  // Check for thinking
  const isThinking = recentActivities.some(a => a.type === 'thinking');
  if (isThinking) return 'thinking';
  
  return 'idle';
}

// Calculate productivity score
function calculateProductivityScore(activities, timeWindow = 60000) {
  const now = Date.now();
  const recentActivities = activities.filter(a => now - a.timestamp < timeWindow);
  
  if (!recentActivities.length) return 0;
  
  let score = 0;
  
  // Weight different activity types
  const weights = {
    command: 10,
    file_operation: 15,
    git_operation: 20,
    build_operation: 15,
    test_operation: 20,
    api_call: 10,
    code_block: 25,
    success: 5,
    error: -10,
    thinking: 3
  };
  
  for (const activity of recentActivities) {
    score += weights[activity.type] || 0;
  }
  
  // Normalize to 0-100
  return Math.min(100, Math.max(0, score));
}

// Detect patterns and insights
function detectPatterns(activities) {
  const patterns = [];
  
  // Detect repeated errors
  const errorGroups = {};
  activities
    .filter(a => a.type === 'error')
    .forEach(error => {
      const key = error.content.substring(0, 50);
      errorGroups[key] = (errorGroups[key] || 0) + 1;
    });
  
  for (const [error, count] of Object.entries(errorGroups)) {
    if (count >= 3) {
      patterns.push({
        type: 'repeated_error',
        description: `Error occurring ${count} times: ${error}`,
        severity: 'warning',
        count
      });
    }
  }
  
  // Detect workflow patterns
  const commandSequence = activities
    .filter(a => a.type === 'command')
    .map(a => a.content);
  
  if (commandSequence.length >= 3) {
    // Check for common workflows
    const workflow = detectWorkflow(commandSequence);
    if (workflow) {
      patterns.push({
        type: 'workflow',
        description: workflow.description,
        commands: workflow.commands
      });
    }
  }
  
  return patterns;
}

// Detect common workflows
function detectWorkflow(commands) {
  const workflows = [
    {
      name: 'git_workflow',
      pattern: ['git add', 'git commit', 'git push'],
      description: 'Git commit workflow detected'
    },
    {
      name: 'test_workflow',
      pattern: ['npm test', 'npm run', 'git commit'],
      description: 'Test and commit workflow detected'
    },
    {
      name: 'build_workflow',
      pattern: ['npm install', 'npm run build'],
      description: 'Build workflow detected'
    }
  ];
  
  for (const workflow of workflows) {
    if (matchesWorkflow(commands, workflow.pattern)) {
      return {
        name: workflow.name,
        description: workflow.description,
        commands: workflow.pattern
      };
    }
  }
  
  return null;
}

// Check if commands match a workflow pattern
function matchesWorkflow(commands, pattern) {
  const commandStr = commands.join(' ');
  return pattern.every(p => commandStr.includes(p));
}

// Main message handler
parentPort.on('message', (message) => {
  const { type, data, timestamp } = message;
  
  if (type === 'parse') {
    const startTime = Date.now();
    
    try {
      const { sessionId, agentId, output, sequence } = data;
      
      // Parse activities from output
      const activities = parseActivities(output, agentId, sequence);
      
      // Calculate agent status
      const status = calculateAgentStatus(activities);
      
      // Calculate productivity score
      const productivityScore = calculateProductivityScore(activities);
      
      // Detect patterns
      const patterns = detectPatterns(activities);
      
      // Send results back to main thread
      parentPort.postMessage({
        sessionId,
        agentId,
        activities,
        status,
        productivityScore,
        patterns,
        parseTime: Date.now() - startTime,
        timestamp: Date.now()
      });
    } catch (error) {
      parentPort.postMessage({
        sessionId: data.sessionId,
        agentId: data.agentId,
        error: error.message,
        parseTime: Date.now() - startTime,
        timestamp: Date.now()
      });
    }
  }
});