import { db, redis } from '../database/connection';
import { Task, Agent } from '../types/api';
import { taskQueue } from './taskQueue';
import { taskCounter, taskDuration } from '../api/metrics';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

export interface TaskExecutor {
  execute(task: Task, agent: Agent): Promise<any>;
  cancel(taskId: string): Promise<void>;
}

export class BaseTaskExecutor extends EventEmitter implements TaskExecutor {
  protected runningTasks: Map<string, ChildProcess> = new Map();

  async execute(task: Task, agent: Agent): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Update task status to processing
      await this.updateTaskStatus(task.id, 'processing', agent.id);
      
      // Execute based on task type
      let result: any;
      
      switch (task.type) {
        case 'code_generation':
          result = await this.executeCodeGeneration(task, agent);
          break;
        case 'code_review':
          result = await this.executeCodeReview(task, agent);
          break;
        case 'test_execution':
          result = await this.executeTestExecution(task, agent);
          break;
        case 'documentation':
          result = await this.executeDocumentation(task, agent);
          break;
        case 'analysis':
          result = await this.executeAnalysis(task, agent);
          break;
        default:
          result = await this.executeGeneric(task, agent);
      }
      
      // Update task with result
      await this.completeTask(task.id, result);
      
      // Update metrics
      const duration = (Date.now() - startTime) / 1000;
      taskDuration.observe({ type: task.type, farm_id: task.farmId }, duration);
      taskCounter.inc({ status: 'completed', farm_id: task.farmId, type: task.type });
      
      // Update agent metrics
      await this.updateAgentMetrics(agent.id, true, duration);
      
      return result;
    } catch (error) {
      // Handle task failure
      await this.failTask(task.id, error);
      
      // Update metrics
      taskCounter.inc({ status: 'failed', farm_id: task.farmId, type: task.type });
      
      // Update agent metrics
      await this.updateAgentMetrics(agent.id, false);
      
      throw error;
    } finally {
      // Clean up
      this.runningTasks.delete(task.id);
      
      // Update agent status back to idle
      await this.updateAgentStatus(agent.id, 'idle');
    }
  }

  async cancel(taskId: string): Promise<void> {
    const process = this.runningTasks.get(taskId);
    if (process) {
      process.kill('SIGTERM');
      this.runningTasks.delete(taskId);
    }
    
    await this.updateTaskStatus(taskId, 'cancelled');
  }

  protected async executeCodeGeneration(task: Task, agent: Agent): Promise<any> {
    const { prompt, language, framework } = task.payload;
    
    // Simulate code generation with Claude
    const result = await this.callClaudeAPI({
      prompt: `Generate ${language} code using ${framework}: ${prompt}`,
      maxTokens: 2000,
      temperature: 0.7
    });
    
    return {
      code: result.completion,
      language,
      framework,
      timestamp: new Date()
    };
  }

  protected async executeCodeReview(task: Task, agent: Agent): Promise<any> {
    const { code, language, reviewType } = task.payload;
    
    // Simulate code review
    const result = await this.callClaudeAPI({
      prompt: `Review the following ${language} code for ${reviewType}: \n\n${code}`,
      maxTokens: 1500,
      temperature: 0.3
    });
    
    return {
      review: result.completion,
      suggestions: this.extractSuggestions(result.completion),
      severity: this.calculateSeverity(result.completion),
      timestamp: new Date()
    };
  }

  protected async executeTestExecution(task: Task, agent: Agent): Promise<any> {
    const { testCommand, workingDirectory } = task.payload;
    
    return new Promise((resolve, reject) => {
      const process = spawn(testCommand, {
        cwd: workingDirectory,
        shell: true
      });
      
      this.runningTasks.set(task.id, process);
      
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        resolve({
          exitCode: code,
          stdout,
          stderr,
          success: code === 0,
          timestamp: new Date()
        });
      });
      
      process.on('error', reject);
      
      // Apply timeout
      setTimeout(() => {
        if (this.runningTasks.has(task.id)) {
          process.kill('SIGTERM');
          reject(new Error('Test execution timeout'));
        }
      }, task.timeout);
    });
  }

  protected async executeDocumentation(task: Task, agent: Agent): Promise<any> {
    const { codebase, docType, format } = task.payload;
    
    const result = await this.callClaudeAPI({
      prompt: `Generate ${docType} documentation in ${format} format for: ${codebase}`,
      maxTokens: 3000,
      temperature: 0.5
    });
    
    return {
      documentation: result.completion,
      format,
      type: docType,
      timestamp: new Date()
    };
  }

  protected async executeAnalysis(task: Task, agent: Agent): Promise<any> {
    const { target, analysisType, depth } = task.payload;
    
    const result = await this.callClaudeAPI({
      prompt: `Perform ${analysisType} analysis with depth ${depth} on: ${target}`,
      maxTokens: 2500,
      temperature: 0.4
    });
    
    return {
      analysis: result.completion,
      findings: this.extractFindings(result.completion),
      recommendations: this.extractRecommendations(result.completion),
      timestamp: new Date()
    };
  }

  protected async executeGeneric(task: Task, agent: Agent): Promise<any> {
    // Generic task execution
    const result = await this.callClaudeAPI({
      prompt: JSON.stringify(task.payload),
      maxTokens: 2000,
      temperature: 0.5
    });
    
    return {
      result: result.completion,
      timestamp: new Date()
    };
  }

  protected async callClaudeAPI(params: any): Promise<any> {
    // This is a placeholder - in production, integrate with actual Claude API
    // For now, simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      completion: `Simulated response for: ${params.prompt.substring(0, 100)}...`,
      usage: {
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300
      }
    };
  }

  protected async updateTaskStatus(taskId: string, status: string, agentId?: string): Promise<void> {
    const updates: any = {
      status,
      updated_at: new Date()
    };
    
    if (status === 'processing') {
      updates.started_at = new Date();
    }
    
    if (agentId) {
      updates.agent_id = agentId;
    }
    
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    await db.query(
      `UPDATE tasks SET ${setClause} WHERE id = $1`,
      [taskId, ...Object.values(updates)]
    );
  }

  protected async completeTask(taskId: string, result: any): Promise<void> {
    await db.query(
      `UPDATE tasks 
       SET status = 'completed', result = $1, completed_at = $2, updated_at = $2
       WHERE id = $3`,
      [result, new Date(), taskId]
    );
    
    await taskQueue.complete(taskId);
  }

  protected async failTask(taskId: string, error: any): Promise<void> {
    const errorDetails = {
      message: error.message || 'Unknown error',
      stack: error.stack,
      code: error.code
    };
    
    await db.query(
      `UPDATE tasks 
       SET status = 'failed', error = $1, updated_at = $2
       WHERE id = $3`,
      [errorDetails, new Date(), taskId]
    );
    
    await taskQueue.markFailed(taskId, error);
  }

  protected async updateAgentStatus(agentId: string, status: string): Promise<void> {
    await db.query(
      'UPDATE agents SET status = $1, updated_at = $2 WHERE id = $3',
      [status, new Date(), agentId]
    );
  }

  protected async updateAgentMetrics(agentId: string, success: boolean, duration?: number): Promise<void> {
    const metric = success ? 'tasksCompleted' : 'tasksFailed';
    
    await db.query(
      `UPDATE agents 
       SET metrics = jsonb_set(
         metrics,
         '{${metric}}',
         to_jsonb(COALESCE((metrics->>'${metric}')::int, 0) + 1)
       ),
       updated_at = $1
       WHERE id = $2`,
      [new Date(), agentId]
    );
    
    if (success && duration) {
      await db.query(
        `UPDATE agents 
         SET metrics = jsonb_set(
           metrics,
           '{averageExecutionTime}',
           to_jsonb(
             (COALESCE((metrics->>'averageExecutionTime')::float, 0) * 
              COALESCE((metrics->>'tasksCompleted')::int, 0) + $1) / 
             (COALESCE((metrics->>'tasksCompleted')::int, 0) + 1)
           )
         )
         WHERE id = $2`,
        [duration, agentId]
      );
    }
  }

  protected extractSuggestions(review: string): string[] {
    // Simple extraction logic - enhance in production
    const suggestions: string[] = [];
    const lines = review.split('\n');
    
    for (const line of lines) {
      if (line.includes('suggest') || line.includes('recommend')) {
        suggestions.push(line.trim());
      }
    }
    
    return suggestions;
  }

  protected extractFindings(analysis: string): string[] {
    // Simple extraction logic - enhance in production
    const findings: string[] = [];
    const lines = analysis.split('\n');
    
    for (const line of lines) {
      if (line.includes('found') || line.includes('detected')) {
        findings.push(line.trim());
      }
    }
    
    return findings;
  }

  protected extractRecommendations(analysis: string): string[] {
    // Simple extraction logic - enhance in production
    const recommendations: string[] = [];
    const lines = analysis.split('\n');
    
    for (const line of lines) {
      if (line.includes('recommend') || line.includes('should')) {
        recommendations.push(line.trim());
      }
    }
    
    return recommendations;
  }

  protected calculateSeverity(review: string): 'low' | 'medium' | 'high' | 'critical' {
    const lowerReview = review.toLowerCase();
    
    if (lowerReview.includes('critical') || lowerReview.includes('severe')) {
      return 'critical';
    }
    if (lowerReview.includes('high') || lowerReview.includes('important')) {
      return 'high';
    }
    if (lowerReview.includes('medium') || lowerReview.includes('moderate')) {
      return 'medium';
    }
    
    return 'low';
  }
}

export const taskExecutor = new BaseTaskExecutor();