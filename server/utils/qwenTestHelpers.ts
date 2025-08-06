import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface QwenTestConfig {
  provider: 'qwen';
  apiKey?: string;
  endpoint?: string;
  timeout?: number;
  debugMode?: boolean;
}

interface QwenCommandResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  duration: number;
}

interface QwenValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata: {
    provider: string;
    version?: string;
    apiAvailable: boolean;
    cliInstalled: boolean;
  };
}

export class QwenTestUtilities {
  private config: QwenTestConfig;
  private coordinationPath = '/tmp/claude_coordination';
  private testSessionPath = '/tmp/qwen_test_sessions';

  constructor(config: QwenTestConfig = { provider: 'qwen' }) {
    this.config = {
      timeout: 30000, // 30 second default timeout
      debugMode: process.env.NODE_ENV === 'test',
      ...config
    };
  }

  /**
   * Initialize test environment for Qwen
   */
  async initializeTestEnvironment(): Promise<void> {
    // Create test directories
    await fs.mkdir(this.testSessionPath, { recursive: true });
    await fs.mkdir(this.coordinationPath, { recursive: true });
    await fs.mkdir(`${this.coordinationPath}/work_claims`, { recursive: true });
    await fs.mkdir(`${this.coordinationPath}/qwen_test`, { recursive: true });

    // Clear any existing test data
    await this.cleanupTestData();
  }

  /**
   * Check if Qwen CLI is available
   */
  async checkQwenCLI(): Promise<{ installed: boolean; version?: string }> {
    try {
      const result = await this.executeCommand('qwen-code', ['--version']);
      if (result.success) {
        const versionMatch = result.output.match(/version\s*([\d.]+)/i);
        return {
          installed: true,
          version: versionMatch ? versionMatch[1] : undefined
        };
      }
      return { installed: false };
    } catch (error) {
      // Try alternative command formats
      const altResult = await this.executeCommand('claude', ['--version'], {
        env: { AI_PROVIDER: 'qwen' }
      });
      
      if (altResult.success && altResult.output.includes('qwen')) {
        return { installed: true, version: 'proxy' };
      }
      
      return { installed: false };
    }
  }

  /**
   * Check if Qwen API is accessible
   */
  async checkQwenAPI(): Promise<{ available: boolean; error?: string }> {
    const apiKey = this.config.apiKey || process.env.QWEN_API_KEY;
    const endpoint = this.config.endpoint || process.env.QWEN_API_ENDPOINT;

    if (!apiKey) {
      return { available: false, error: 'QWEN_API_KEY not configured' };
    }

    // Test API connectivity with a simple request
    try {
      const testPayload = {
        model: 'qwen3-coder',
        messages: [{ role: 'user', content: 'Test connection' }],
        max_tokens: 10
      };

      const response = await fetch(endpoint || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testPayload)
      });

      if (response.ok) {
        return { available: true };
      } else {
        const error = await response.text();
        return { available: false, error: `API responded with ${response.status}: ${error}` };
      }
    } catch (error) {
      return { available: false, error: `Connection failed: ${error}` };
    }
  }

  /**
   * Execute a command with timeout and capture output
   */
  async executeCommand(
    command: string, 
    args: string[], 
    options?: { env?: Record<string, string>; cwd?: string }
  ): Promise<QwenCommandResult> {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        cwd: options?.cwd || process.cwd(),
        env: { ...process.env, ...options?.env },
        stdio: 'pipe'
      });

      let output = '';
      let error = '';
      let killed = false;

      // Set timeout
      const timeout = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
        resolve({
          success: false,
          output,
          error: 'Command timed out',
          exitCode: -1,
          duration: Date.now() - startTime
        });
      }, this.config.timeout!);

      proc.stdout?.on('data', (data) => {
        output += data.toString();
        if (this.config.debugMode) {
          console.log(`[QWEN TEST] stdout: ${data}`);
        }
      });

      proc.stderr?.on('data', (data) => {
        error += data.toString();
        if (this.config.debugMode) {
          console.error(`[QWEN TEST] stderr: ${data}`);
        }
      });

      proc.on('exit', (code) => {
        clearTimeout(timeout);
        if (!killed) {
          resolve({
            success: code === 0,
            output,
            error: error || undefined,
            exitCode: code || 0,
            duration: Date.now() - startTime
          });
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        if (!killed) {
          resolve({
            success: false,
            output,
            error: err.message,
            exitCode: -1,
            duration: Date.now() - startTime
          });
        }
      });
    });
  }

  /**
   * Create a test farm configuration
   */
  async createTestFarm(config: {
    agents: number;
    prompt: string;
    steps?: string[];
    collaborative?: boolean;
  }): Promise<string> {
    const farmId = `test_farm_${uuidv4().substring(0, 8)}`;
    const sessionName = `qwen_test_${farmId}`;

    const farmConfig = {
      id: farmId,
      name: `Test Farm ${farmId}`,
      description: 'Qwen integration test farm',
      numberOfAgents: config.agents,
      prompt: config.prompt,
      steps: config.steps,
      collaborative: config.collaborative,
      sessionName,
      provider: 'qwen'
    };

    // Save farm configuration for testing
    const configPath = path.join(this.testSessionPath, `${farmId}.json`);
    await fs.writeFile(configPath, JSON.stringify(farmConfig, null, 2));

    return farmId;
  }

  /**
   * Validate Qwen integration
   */
  async validateIntegration(): Promise<QwenValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check CLI installation
    const cliCheck = await this.checkQwenCLI();
    if (!cliCheck.installed) {
      errors.push('Qwen CLI is not installed. Run: npm install -g @qwen/qwen-code');
    }

    // Check API availability
    const apiCheck = await this.checkQwenAPI();
    if (!apiCheck.available) {
      errors.push(`Qwen API is not accessible: ${apiCheck.error}`);
    }

    // Check proxy configuration if using Claude proxy
    const proxyCheck = await this.checkProxySetup();
    if (!proxyCheck.configured && !cliCheck.installed) {
      warnings.push('Neither native Qwen CLI nor proxy is configured');
    }

    // Check coordination directory permissions
    try {
      await fs.access(this.coordinationPath, fs.constants.W_OK);
    } catch (error) {
      errors.push(`Cannot write to coordination directory: ${this.coordinationPath}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        provider: 'qwen',
        version: cliCheck.version,
        apiAvailable: apiCheck.available,
        cliInstalled: cliCheck.installed
      }
    };
  }

  /**
   * Check if Claude-to-Qwen proxy is configured
   */
  private async checkProxySetup(): Promise<{ configured: boolean; type?: string }> {
    // Check for proxy packages
    const proxyPackages = [
      '@musistudio/claude-code-router',
      '@dashscope-js/claude-code-config'
    ];

    for (const pkg of proxyPackages) {
      try {
        await import(pkg);
        return { configured: true, type: pkg };
      } catch {
        // Package not installed
      }
    }

    // Check environment variable
    if (process.env.AI_PROVIDER === 'qwen') {
      return { configured: true, type: 'environment' };
    }

    return { configured: false };
  }

  /**
   * Create a mock Qwen response for testing
   */
  createMockResponse(content: string, agentId: number): string {
    return JSON.stringify({
      choices: [{
        message: {
          role: 'assistant',
          content: content
        }
      }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150
      },
      model: 'qwen3-coder',
      agent_id: agentId
    });
  }

  /**
   * Monitor farm execution for testing
   */
  async monitorFarmExecution(farmId: string, duration: number = 5000): Promise<{
    logs: string[];
    errors: string[];
    agentStatuses: Map<number, string>;
  }> {
    const logs: string[] = [];
    const errors: string[] = [];
    const agentStatuses = new Map<number, string>();

    const startTime = Date.now();
    
    while (Date.now() - startTime < duration) {
      try {
        // Check coordination files
        const activeAgentsPath = path.join(this.coordinationPath, 'active_agents.json');
        if (await this.fileExists(activeAgentsPath)) {
          const content = await fs.readFile(activeAgentsPath, 'utf-8');
          const agents = JSON.parse(content);
          
          for (const [uid, data] of Object.entries(agents as any)) {
            if (uid.includes(farmId)) {
              const agentId = data.agent_id;
              agentStatuses.set(agentId, data.status);
              logs.push(`Agent ${agentId}: ${data.status}`);
            }
          }
        }

        // Check for errors
        const errorLogPath = path.join(this.testSessionPath, `${farmId}_errors.log`);
        if (await this.fileExists(errorLogPath)) {
          const errorContent = await fs.readFile(errorLogPath, 'utf-8');
          errors.push(...errorContent.split('\n').filter(Boolean));
        }

      } catch (error) {
        errors.push(`Monitoring error: ${error}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return { logs, errors, agentStatuses };
  }

  /**
   * Clean up test data
   */
  async cleanupTestData(): Promise<void> {
    try {
      // Clean test sessions
      const testFiles = await fs.readdir(this.testSessionPath);
      for (const file of testFiles) {
        if (file.startsWith('test_farm_')) {
          await fs.unlink(path.join(this.testSessionPath, file)).catch(() => {});
        }
      }

      // Clean coordination files
      const coordFiles = await fs.readdir(`${this.coordinationPath}/qwen_test`).catch(() => []);
      for (const file of coordFiles) {
        await fs.unlink(path.join(`${this.coordinationPath}/qwen_test`, file)).catch(() => {});
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  /**
   * Helper to check if file exists
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate test report
   */
  async generateTestReport(results: any[]): Promise<string> {
    const report = {
      timestamp: new Date().toISOString(),
      provider: 'qwen',
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        apiConfigured: !!process.env.QWEN_API_KEY,
        proxyConfigured: !!process.env.AI_PROVIDER
      },
      results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length
      }
    };

    const reportPath = path.join(this.testSessionPath, `qwen_test_report_${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    return reportPath;
  }
}

// Export singleton for convenience
export const qwenTestUtils = new QwenTestUtilities();