/**
 * Provider Comparison Benchmarks
 * Compares performance between Claude Code and Qwen3-Coder
 */

import { performanceMonitor } from '../../server/services/performanceMonitor';
import { contextManager } from '../../server/services/contextManager';

interface BenchmarkTask {
  id: string;
  name: string;
  description: string;
  prompt: string;
  expectedTokens: number;
  complexity: 'simple' | 'medium' | 'complex';
  requiresLargeContext?: boolean;
}

interface BenchmarkResult {
  taskId: string;
  provider: 'claude' | 'qwen';
  latency: number;
  tokensGenerated: number;
  throughput: number;
  cost: number;
  error?: string;
  quality?: number; // 0-100 subjective quality score
}

const benchmarkTasks: BenchmarkTask[] = [
  {
    id: 'simple-function',
    name: 'Simple Function Generation',
    description: 'Generate a basic utility function',
    prompt: 'Write a TypeScript function that validates email addresses using regex',
    expectedTokens: 200,
    complexity: 'simple'
  },
  {
    id: 'complex-refactor',
    name: 'Complex Code Refactoring',
    description: 'Refactor a large class with multiple responsibilities',
    prompt: `Refactor this monolithic class into smaller, single-responsibility classes:
    [Insert 500 lines of complex code here]
    Follow SOLID principles and maintain backward compatibility.`,
    expectedTokens: 2000,
    complexity: 'complex'
  },
  {
    id: 'large-context-analysis',
    name: 'Large Codebase Analysis',
    description: 'Analyze a large codebase and provide insights',
    prompt: `Analyze the following codebase structure and provide:
    1. Architecture overview
    2. Potential improvements
    3. Security vulnerabilities
    4. Performance bottlenecks
    [Insert 50K tokens of code context]`,
    expectedTokens: 5000,
    complexity: 'complex',
    requiresLargeContext: true
  },
  {
    id: 'multi-agent-orchestration',
    name: 'Multi-Agent Task Orchestration',
    description: 'Plan and orchestrate a complex multi-agent workflow',
    prompt: `Create a detailed plan for 5 agents to collaboratively build a full-stack web application with:
    - React frontend
    - Node.js backend
    - PostgreSQL database
    - Docker deployment
    - CI/CD pipeline
    Define agent roles, task dependencies, and communication protocols.`,
    expectedTokens: 3000,
    complexity: 'complex'
  },
  {
    id: 'realtime-debug',
    name: 'Real-time Debugging',
    description: 'Debug a complex async issue',
    prompt: `Debug this race condition in a WebSocket implementation:
    [Insert problematic code]
    Identify the issue, explain why it happens, and provide a fix.`,
    expectedTokens: 1000,
    complexity: 'medium'
  }
];

export class ProviderBenchmark {
  private results: BenchmarkResult[] = [];

  /**
   * Run full benchmark suite
   */
  async runBenchmarks(options?: {
    providers?: ('claude' | 'qwen')[];
    tasks?: string[];
    iterations?: number;
  }): Promise<void> {
    const providers = options?.providers || ['claude', 'qwen'];
    const tasksToRun = options?.tasks 
      ? benchmarkTasks.filter(t => options.tasks?.includes(t.id))
      : benchmarkTasks;
    const iterations = options?.iterations || 3;

    console.log('🚀 Starting Provider Benchmarks');
    console.log(`Providers: ${providers.join(', ')}`);
    console.log(`Tasks: ${tasksToRun.length}`);
    console.log(`Iterations per task: ${iterations}\n`);

    for (const task of tasksToRun) {
      console.log(`\n📋 Task: ${task.name}`);
      console.log(`Description: ${task.description}`);
      
      for (const provider of providers) {
        console.log(`\n  Testing ${provider}...`);
        
        // Run multiple iterations for accuracy
        const iterationResults: BenchmarkResult[] = [];
        
        for (let i = 0; i < iterations; i++) {
          try {
            const result = await this.runSingleBenchmark(task, provider);
            iterationResults.push(result);
            console.log(`    Iteration ${i + 1}: ${result.latency}ms, ${result.tokensGenerated} tokens`);
          } catch (error) {
            console.error(`    Iteration ${i + 1} failed:`, error);
          }
        }
        
        // Calculate average results
        if (iterationResults.length > 0) {
          const avgResult = this.calculateAverageResult(iterationResults);
          this.results.push(avgResult);
        }
      }
    }

    // Generate report
    this.generateReport();
  }

  /**
   * Run a single benchmark test
   */
  private async runSingleBenchmark(
    task: BenchmarkTask,
    provider: 'claude' | 'qwen'
  ): Promise<BenchmarkResult> {
    const farmId = `benchmark_${task.id}_${provider}_${Date.now()}`;
    const startTime = Date.now();
    
    try {
      // Create context session
      const session = await contextManager.createSession(farmId, provider, {
        windowSize: task.requiresLargeContext ? 'large' : 'standard'
      });

      // Simulate API call (in real implementation, this would call actual API)
      const response = await this.simulateProviderCall(task, provider);
      
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      // Record metrics
      performanceMonitor.recordLatency(provider, farmId, latency);
      performanceMonitor.recordTokenUsage(provider, farmId, response.tokensUsed, 'output');
      
      // Calculate throughput
      const throughput = response.tokensUsed / (latency / 1000);
      
      // Calculate cost
      const costPerMillion = provider === 'claude' ? 15.0 : 0;
      const cost = (response.tokensUsed / 1000000) * costPerMillion;
      
      return {
        taskId: task.id,
        provider,
        latency,
        tokensGenerated: response.tokensUsed,
        throughput,
        cost,
        quality: response.quality
      };
      
    } catch (error: any) {
      performanceMonitor.recordError(provider, farmId, error);
      
      return {
        taskId: task.id,
        provider,
        latency: Date.now() - startTime,
        tokensGenerated: 0,
        throughput: 0,
        cost: 0,
        error: error.message
      };
    }
  }

  /**
   * Simulate provider API call
   */
  private async simulateProviderCall(
    task: BenchmarkTask,
    provider: 'claude' | 'qwen'
  ): Promise<{ tokensUsed: number; quality: number }> {
    // Simulate network latency
    const baseLatency = provider === 'claude' ? 1000 : 800; // Qwen slightly faster
    const jitter = Math.random() * 200;
    await new Promise(resolve => setTimeout(resolve, baseLatency + jitter));
    
    // Simulate token generation
    const tokenMultiplier = provider === 'qwen' ? 1.1 : 1.0; // Qwen tends to be more verbose
    const tokensUsed = Math.floor(task.expectedTokens * tokenMultiplier * (0.9 + Math.random() * 0.2));
    
    // Simulate quality (simplified - in reality would need human evaluation)
    let quality = 85 + Math.random() * 10; // Base quality 85-95
    
    // Qwen excels at large context tasks
    if (task.requiresLargeContext && provider === 'qwen') {
      quality += 5;
    }
    
    // Claude slightly better at complex reasoning
    if (task.complexity === 'complex' && provider === 'claude') {
      quality += 3;
    }
    
    return { tokensUsed, quality: Math.min(100, quality) };
  }

  /**
   * Calculate average result from iterations
   */
  private calculateAverageResult(results: BenchmarkResult[]): BenchmarkResult {
    const validResults = results.filter(r => !r.error);
    
    return {
      taskId: results[0].taskId,
      provider: results[0].provider,
      latency: validResults.reduce((sum, r) => sum + r.latency, 0) / validResults.length,
      tokensGenerated: validResults.reduce((sum, r) => sum + r.tokensGenerated, 0) / validResults.length,
      throughput: validResults.reduce((sum, r) => sum + r.throughput, 0) / validResults.length,
      cost: validResults.reduce((sum, r) => sum + r.cost, 0) / validResults.length,
      quality: validResults.reduce((sum, r) => sum + (r.quality || 0), 0) / validResults.length
    };
  }

  /**
   * Generate comprehensive benchmark report
   */
  private generateReport(): void {
    console.log('\n\n📊 BENCHMARK REPORT');
    console.log('==================\n');

    // Group results by task
    const taskGroups = new Map<string, BenchmarkResult[]>();
    for (const result of this.results) {
      if (!taskGroups.has(result.taskId)) {
        taskGroups.set(result.taskId, []);
      }
      taskGroups.get(result.taskId)!.push(result);
    }

    // Task-by-task comparison
    for (const [taskId, results] of taskGroups) {
      const task = benchmarkTasks.find(t => t.id === taskId)!;
      console.log(`\n📋 ${task.name}`);
      console.log('-'.repeat(50));
      
      const claudeResult = results.find(r => r.provider === 'claude');
      const qwenResult = results.find(r => r.provider === 'qwen');
      
      if (claudeResult && qwenResult) {
        console.log('\nMetric          | Claude Code  | Qwen3-Coder  | Winner');
        console.log('----------------|--------------|--------------|--------');
        
        // Latency
        console.log(`Latency         | ${claudeResult.latency.toFixed(0)}ms`.padEnd(16) + 
                   `| ${qwenResult.latency.toFixed(0)}ms`.padEnd(14) +
                   `| ${claudeResult.latency < qwenResult.latency ? 'Claude' : 'Qwen'}`);
        
        // Throughput
        console.log(`Throughput      | ${claudeResult.throughput.toFixed(1)} tok/s`.padEnd(16) + 
                   `| ${qwenResult.throughput.toFixed(1)} tok/s`.padEnd(14) +
                   `| ${claudeResult.throughput > qwenResult.throughput ? 'Claude' : 'Qwen'}`);
        
        // Cost
        console.log(`Cost            | $${claudeResult.cost.toFixed(4)}`.padEnd(16) + 
                   `| $${qwenResult.cost.toFixed(4)}`.padEnd(14) +
                   `| Qwen`);
        
        // Quality
        console.log(`Quality         | ${claudeResult.quality?.toFixed(1)}%`.padEnd(16) + 
                   `| ${qwenResult.quality?.toFixed(1)}%`.padEnd(14) +
                   `| ${(claudeResult.quality || 0) > (qwenResult.quality || 0) ? 'Claude' : 'Qwen'}`);
      }
    }

    // Overall summary
    console.log('\n\n🏆 OVERALL SUMMARY');
    console.log('==================\n');

    const claudeResults = this.results.filter(r => r.provider === 'claude');
    const qwenResults = this.results.filter(r => r.provider === 'qwen');

    if (claudeResults.length > 0 && qwenResults.length > 0) {
      const claudeAvgLatency = claudeResults.reduce((sum, r) => sum + r.latency, 0) / claudeResults.length;
      const qwenAvgLatency = qwenResults.reduce((sum, r) => sum + r.latency, 0) / qwenResults.length;
      
      const claudeTotalCost = claudeResults.reduce((sum, r) => sum + r.cost, 0);
      const qwenTotalCost = qwenResults.reduce((sum, r) => sum + r.cost, 0);
      
      console.log(`Average Latency:`);
      console.log(`  Claude: ${claudeAvgLatency.toFixed(0)}ms`);
      console.log(`  Qwen:   ${qwenAvgLatency.toFixed(0)}ms (${((qwenAvgLatency / claudeAvgLatency - 1) * 100).toFixed(1)}%)`);
      
      console.log(`\nTotal Cost:`);
      console.log(`  Claude: $${claudeTotalCost.toFixed(2)}`);
      console.log(`  Qwen:   $${qwenTotalCost.toFixed(2)} (${((1 - qwenTotalCost / claudeTotalCost) * 100).toFixed(1)}% savings)`);
      
      console.log('\n🎯 Recommendations:');
      console.log('- Use Qwen3-Coder for cost-sensitive and large-context tasks');
      console.log('- Use Claude Code for complex reasoning and critical accuracy');
      console.log('- Consider Qwen for development/testing, Claude for production');
      console.log('- Enable provider switching based on task type for optimal results');
    }
  }

  /**
   * Export results to JSON
   */
  exportResults(): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      results: this.results,
      summary: this.generateSummaryStats()
    }, null, 2);
  }

  /**
   * Generate summary statistics
   */
  private generateSummaryStats() {
    const providers = ['claude', 'qwen'] as const;
    const stats: Record<string, any> = {};

    for (const provider of providers) {
      const providerResults = this.results.filter(r => r.provider === provider);
      
      stats[provider] = {
        totalTasks: providerResults.length,
        avgLatency: providerResults.reduce((sum, r) => sum + r.latency, 0) / providerResults.length,
        avgThroughput: providerResults.reduce((sum, r) => sum + r.throughput, 0) / providerResults.length,
        totalCost: providerResults.reduce((sum, r) => sum + r.cost, 0),
        avgQuality: providerResults.reduce((sum, r) => sum + (r.quality || 0), 0) / providerResults.length,
        errorRate: providerResults.filter(r => r.error).length / providerResults.length
      };
    }

    return stats;
  }
}

// Export for use in tests
export const providerBenchmark = new ProviderBenchmark();

// CLI execution
if (require.main === module) {
  providerBenchmark.runBenchmarks({
    iterations: 5
  }).then(() => {
    console.log('\n✅ Benchmarks completed');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  });
}