import { performance } from 'perf_hooks';
import * as autocannon from 'autocannon';
import { logger } from './logger';
import { 
  recordApiRequest,
  recordTaskCompletion,
  recordAgentPerformance,
  recordFarmLifecycle 
} from './metricsCollector';

export interface BenchmarkResult {
  id: string;
  name: string;
  timestamp: Date;
  duration: number;
  metrics: {
    requests?: {
      total: number;
      average: number;
      min: number;
      max: number;
      stddev: number;
      percentiles: {
        p50: number;
        p90: number;
        p95: number;
        p99: number;
      };
    };
    throughput?: {
      average: number;
      min: number;
      max: number;
    };
    latency?: {
      average: number;
      min: number;
      max: number;
      stddev: number;
    };
    errors?: number;
    timeouts?: number;
  };
  systemMetrics?: {
    cpuUsage: number[];
    memoryUsage: number[];
  };
}

export interface BenchmarkScenario {
  name: string;
  description: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  duration: number; // in seconds
  connections: number;
  pipelining?: number;
  warmup?: number; // warmup duration in seconds
}

export class PerformanceBenchmark {
  private results: Map<string, BenchmarkResult[]> = new Map();
  private isRunning: boolean = false;

  // Predefined benchmark scenarios
  private scenarios: BenchmarkScenario[] = [
    {
      name: 'api-health-check',
      description: 'Health check endpoint performance',
      endpoint: '/api/health',
      method: 'GET',
      duration: 30,
      connections: 10,
      warmup: 5
    },
    {
      name: 'metrics-endpoint',
      description: 'Metrics endpoint performance',
      endpoint: '/api/metrics',
      method: 'GET',
      duration: 30,
      connections: 20,
      warmup: 5
    },
    {
      name: 'farm-creation',
      description: 'Farm creation API performance',
      endpoint: '/api/farms',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'benchmark-farm',
        type: 'performance-test',
        config: {
          agents: 5,
          tasks: 10
        }
      }),
      duration: 60,
      connections: 5,
      warmup: 10
    },
    {
      name: 'websocket-messages',
      description: 'WebSocket message throughput',
      endpoint: '/ws',
      method: 'GET',
      duration: 60,
      connections: 50,
      warmup: 10
    },
    {
      name: 'agent-operations',
      description: 'Agent lifecycle operations',
      endpoint: '/api/agents',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'benchmark-agent',
        farmId: 'test-farm'
      }),
      duration: 60,
      connections: 10,
      warmup: 10
    }
  ];

  // Run a specific benchmark scenario
  async runScenario(scenarioName: string, baseUrl: string = 'http://localhost:8080'): Promise<BenchmarkResult> {
    const scenario = this.scenarios.find(s => s.name === scenarioName);
    if (!scenario) {
      throw new Error(`Benchmark scenario '${scenarioName}' not found`);
    }

    if (this.isRunning) {
      throw new Error('Another benchmark is already running');
    }

    this.isRunning = true;
    const benchmarkId = `${scenario.name}-${Date.now()}`;
    const startTime = performance.now();

    logger.info('Starting performance benchmark', {
      benchmarkId,
      scenario: scenario.name
    });

    try {
      // Collect system metrics during benchmark
      const systemMetrics = {
        cpuUsage: [] as number[],
        memoryUsage: [] as number[]
      };

      const metricsInterval = setInterval(() => {
        // Collect CPU and memory usage
        const cpuUsage = process.cpuUsage();
        const memUsage = process.memoryUsage();
        
        systemMetrics.cpuUsage.push((cpuUsage.user + cpuUsage.system) / 1000000); // Convert to seconds
        systemMetrics.memoryUsage.push(memUsage.heapUsed / 1024 / 1024); // Convert to MB
      }, 1000);

      // Run warmup if specified
      if (scenario.warmup) {
        logger.info('Running warmup phase', {
          benchmarkId,
          duration: scenario.warmup
        });

        await this.runAutocannon({
          ...scenario,
          url: `${baseUrl}${scenario.endpoint}`,
          duration: scenario.warmup
        });
      }

      // Run the actual benchmark
      const result = await this.runAutocannon({
        ...scenario,
        url: `${baseUrl}${scenario.endpoint}`,
        duration: scenario.duration
      });

      clearInterval(metricsInterval);

      const endTime = performance.now();
      const benchmarkResult: BenchmarkResult = {
        id: benchmarkId,
        name: scenario.name,
        timestamp: new Date(),
        duration: endTime - startTime,
        metrics: {
          requests: {
            total: result.requests.total,
            average: result.requests.average,
            min: result.requests.min,
            max: result.requests.max,
            stddev: result.requests.stddev,
            percentiles: {
              p50: result.requests.p50,
              p90: result.requests.p90,
              p95: result.requests.p95,
              p99: result.requests.p99
            }
          },
          throughput: {
            average: result.throughput.average,
            min: result.throughput.min,
            max: result.throughput.max
          },
          latency: {
            average: result.latency.average,
            min: result.latency.min,
            max: result.latency.max,
            stddev: result.latency.stddev
          },
          errors: result.errors,
          timeouts: result.timeouts
        },
        systemMetrics
      };

      // Store result
      if (!this.results.has(scenario.name)) {
        this.results.set(scenario.name, []);
      }
      this.results.get(scenario.name)!.push(benchmarkResult);

      // Log to monitoring system
      logger.info('Benchmark completed', {
        benchmarkId,
        scenario: scenario.name,
        requests: result.requests.total,
        errors: result.errors,
        avgLatency: result.latency.average
      });

      return benchmarkResult;
    } catch (error) {
      logger.error('Benchmark failed', error as Error, {
        benchmarkId,
        scenario: scenario.name
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  // Run autocannon benchmark
  private async runAutocannon(config: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const instance = autocannon({
        url: config.url,
        method: config.method,
        headers: config.headers,
        body: config.body,
        duration: config.duration,
        connections: config.connections,
        pipelining: config.pipelining || 1,
        timeout: 30
      }, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });

      autocannon.track(instance, { renderProgressBar: false });
    });
  }

  // Run all benchmark scenarios
  async runAllScenarios(baseUrl?: string): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    for (const scenario of this.scenarios) {
      try {
        const result = await this.runScenario(scenario.name, baseUrl);
        results.push(result);
        
        // Add delay between scenarios
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        logger.error(`Failed to run scenario ${scenario.name}`, error as Error);
      }
    }

    return results;
  }

  // Compare benchmark results
  compareResults(scenarioName: string, count: number = 5): {
    scenario: string;
    comparisons: Array<{
      timestamp: Date;
      throughput: number;
      latency: number;
      errors: number;
    }>;
    trends: {
      throughputTrend: 'improving' | 'degrading' | 'stable';
      latencyTrend: 'improving' | 'degrading' | 'stable';
      errorTrend: 'improving' | 'degrading' | 'stable';
    };
  } {
    const results = this.results.get(scenarioName) || [];
    const recent = results.slice(-count);

    const comparisons = recent.map(r => ({
      timestamp: r.timestamp,
      throughput: r.metrics.throughput?.average || 0,
      latency: r.metrics.latency?.average || 0,
      errors: r.metrics.errors || 0
    }));

    // Calculate trends
    let throughputTrend: 'improving' | 'degrading' | 'stable' = 'stable';
    let latencyTrend: 'improving' | 'degrading' | 'stable' = 'stable';
    let errorTrend: 'improving' | 'degrading' | 'stable' = 'stable';

    if (comparisons.length >= 2) {
      const first = comparisons[0];
      const last = comparisons[comparisons.length - 1];

      // Throughput: higher is better
      const throughputChange = ((last.throughput - first.throughput) / first.throughput) * 100;
      if (throughputChange > 5) throughputTrend = 'improving';
      else if (throughputChange < -5) throughputTrend = 'degrading';

      // Latency: lower is better
      const latencyChange = ((last.latency - first.latency) / first.latency) * 100;
      if (latencyChange < -5) latencyTrend = 'improving';
      else if (latencyChange > 5) latencyTrend = 'degrading';

      // Errors: lower is better
      const errorChange = last.errors - first.errors;
      if (errorChange < 0) errorTrend = 'improving';
      else if (errorChange > 0) errorTrend = 'degrading';
    }

    return {
      scenario: scenarioName,
      comparisons,
      trends: {
        throughputTrend,
        latencyTrend,
        errorTrend
      }
    };
  }

  // Get benchmark history
  getHistory(scenarioName?: string): BenchmarkResult[] {
    if (scenarioName) {
      return this.results.get(scenarioName) || [];
    }

    const allResults: BenchmarkResult[] = [];
    this.results.forEach(results => {
      allResults.push(...results);
    });

    return allResults.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Generate performance report
  generateReport(scenarioName?: string): string {
    const results = scenarioName 
      ? this.results.get(scenarioName) || []
      : this.getHistory();

    if (results.length === 0) {
      return 'No benchmark results available';
    }

    let report = '# Performance Benchmark Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;

    const groupedByScenario = new Map<string, BenchmarkResult[]>();
    results.forEach(result => {
      if (!groupedByScenario.has(result.name)) {
        groupedByScenario.set(result.name, []);
      }
      groupedByScenario.get(result.name)!.push(result);
    });

    groupedByScenario.forEach((scenarioResults, scenario) => {
      report += `## ${scenario}\n\n`;
      
      const latest = scenarioResults[scenarioResults.length - 1];
      report += `### Latest Results (${latest.timestamp.toISOString()})\n`;
      report += `- Total Requests: ${latest.metrics.requests?.total || 0}\n`;
      report += `- Average Throughput: ${latest.metrics.throughput?.average.toFixed(2) || 0} req/sec\n`;
      report += `- Average Latency: ${latest.metrics.latency?.average.toFixed(2) || 0} ms\n`;
      report += `- Errors: ${latest.metrics.errors || 0}\n`;
      report += `- Timeouts: ${latest.metrics.timeouts || 0}\n\n`;

      report += `### Percentiles\n`;
      if (latest.metrics.requests?.percentiles) {
        const p = latest.metrics.requests.percentiles;
        report += `- p50: ${p.p50} ms\n`;
        report += `- p90: ${p.p90} ms\n`;
        report += `- p95: ${p.p95} ms\n`;
        report += `- p99: ${p.p99} ms\n\n`;
      }

      // Add trend analysis
      const comparison = this.compareResults(scenario, 5);
      report += `### Trends\n`;
      report += `- Throughput: ${comparison.trends.throughputTrend}\n`;
      report += `- Latency: ${comparison.trends.latencyTrend}\n`;
      report += `- Errors: ${comparison.trends.errorTrend}\n\n`;
    });

    return report;
  }

  // Export results to JSON
  exportResults(): string {
    const exportData = {
      timestamp: new Date().toISOString(),
      scenarios: Array.from(this.results.entries()).map(([scenario, results]) => ({
        scenario,
        results
      }))
    };

    return JSON.stringify(exportData, null, 2);
  }
}

// Export singleton instance
export const performanceBenchmark = new PerformanceBenchmark();