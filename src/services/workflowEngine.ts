// Workflow orchestration engine for executing complex workflows

import { v4 as uuidv4 } from 'uuid';
import {
  Workflow,
  WorkflowExecution,
  WorkflowNode,
  WorkflowEdge,
  NodeExecution,
  WorkflowError,
  WorkflowContext,
  WorkflowValidation,
  ValidationError,
  NodeErrorHandling
} from '@/types/workflow';
import { AgentInstance } from '@/types/agent';
import { agentLifecycle } from './agentLifecycle';
import { websocketService } from './websocket';
import { metricsCollector } from './metricsCollector';

interface ExecutionOptions {
  farmId: string;
  inputs?: Record<string, any>;
  context?: {
    farm?: any;
    agents?: AgentInstance[];
  };
}

class WorkflowEngine {
  private workflows: Map<string, Workflow> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private executionQueues: Map<string, NodeExecution[]> = new Map();
  private activeExecutions: Set<string> = new Set();

  async createWorkflow(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
    const newWorkflow: Workflow = {
      ...workflow,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Validate workflow
    const validation = await this.validateWorkflow(newWorkflow);
    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors[0]?.message || 'Validation failed'}`);
    }

    this.workflows.set(newWorkflow.id, newWorkflow);
    return newWorkflow;
  }

  async executeWorkflow(workflowId: string, options: ExecutionOptions): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Create execution
    const execution: WorkflowExecution = {
      id: uuidv4(),
      workflowId,
      status: 'pending',
      startTime: new Date(),
      context: {
        variables: this.initializeVariables(workflow, options.inputs),
        inputs: options.inputs || {},
        outputs: {},
        metadata: {
          farmId: options.farmId,
          ...options.context,
        },
      },
      nodeExecutions: [],
      errors: [],
      metrics: {
        totalNodes: workflow.nodes.length,
        completedNodes: 0,
        failedNodes: 0,
        skippedNodes: 0,
        averageNodeDuration: 0,
        totalDuration: 0,
      },
    };

    this.executions.set(execution.id, execution);
    this.activeExecutions.add(execution.id);

    // Start execution
    this.executeWorkflowAsync(execution.id);

    websocketService.broadcast({
      type: 'workflow_execution_started',
      payload: execution,
      timestamp: new Date()
    });

    return execution;
  }

  async suspendExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'active') {
      return;
    }

    execution.status = 'suspended';
    this.activeExecutions.delete(executionId);

    websocketService.broadcast({
      type: 'workflow_execution_suspended',
      payload: { executionId },
      timestamp: new Date()
    });
  }

  pauseExecution(): void {
    // Pause all active executions
    for (const executionId of this.activeExecutions) {
      const execution = this.executions.get(executionId);
      if (execution && execution.status === 'active') {
        execution.status = 'suspended';
        this.activeExecutions.delete(executionId);
      }
    }
  }

  resumeExecution(): void {
    // Resume all suspended executions
    for (const [executionId, execution] of this.executions) {
      if (execution.status === 'suspended') {
        execution.status = 'active';
        this.activeExecutions.add(executionId);
        // Resume execution
        this.executeWorkflowAsync(executionId);
      }
    }
  }

  async resumeExecutionById(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'suspended') {
      return;
    }

    execution.status = 'active';
    this.activeExecutions.add(executionId);

    // Resume execution
    this.executeWorkflowAsync(executionId);

    websocketService.broadcast({
      type: 'workflow_execution_resumed',
      payload: { executionId },
      timestamp: new Date()
    });
  }

  async cancelExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution || ['completed', 'failed', 'cancelled'].includes(execution.status)) {
      return;
    }

    execution.status = 'cancelled';
    execution.endTime = new Date();
    this.activeExecutions.delete(executionId);

    // Cancel any running node executions
    const runningNodes = execution.nodeExecutions.filter(n => n.status === 'active');
    for (const node of runningNodes) {
      node.status = 'failed';
      node.endTime = new Date();
    }

    this.updateExecutionMetrics(execution);

    websocketService.broadcast({
      type: 'workflow_execution_cancelled',
      payload: { executionId },
      timestamp: new Date()
    });
  }

  async validateWorkflow(workflow: Workflow): Promise<WorkflowValidation> {
    const errors: ValidationError[] = [];

    // Check for start and end nodes
    const startNodes = workflow.nodes.filter(n => n.type === 'start');
    const endNodes = workflow.nodes.filter(n => n.type === 'end');

    if (startNodes.length === 0) {
      errors.push({
        type: 'logic',
        message: 'Workflow must have at least one start node',
      });
    }

    if (endNodes.length === 0) {
      errors.push({
        type: 'logic',
        message: 'Workflow must have at least one end node',
      });
    }

    // Check for disconnected nodes
    const connectedNodes = new Set<string>();
    workflow.edges.forEach(edge => {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    });

    workflow.nodes.forEach(node => {
      if (node.type !== 'start' && node.type !== 'end' && !connectedNodes.has(node.id)) {
        errors.push({
          type: 'logic',
          nodeId: node.id,
          message: `Node ${node.data.label} is not connected to the workflow`,
        });
      }
    });

    // Check for cycles
    if (this.hasCycles(workflow)) {
      errors.push({
        type: 'logic',
        message: 'Workflow contains cycles',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  private async executeWorkflowAsync(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    const workflow = this.workflows.get(execution.workflowId);
    if (!workflow) return;

    try {
      execution.status = 'active';
      
      // Find start nodes
      const startNodes = workflow.nodes.filter(n => n.type === 'start');
      
      // Initialize execution queue
      const queue: WorkflowNode[] = [...startNodes];
      const visited = new Set<string>();

      while (queue.length > 0 && this.activeExecutions.has(executionId)) {
        const node = queue.shift()!;
        
        if (visited.has(node.id)) continue;
        visited.add(node.id);

        // Check if all dependencies are satisfied
        const dependencies = this.getNodeDependencies(workflow, node.id);
        const allDependenciesComplete = dependencies.every(depId => {
          const depExecution = execution.nodeExecutions.find(n => n.nodeId === depId);
          return depExecution?.status === 'completed';
        });

        if (!allDependenciesComplete) {
          // Re-queue the node
          queue.push(node);
          continue;
        }

        // Execute the node
        await this.executeNode(execution, workflow, node);

        // Add successor nodes to queue
        const successors = this.getNodeSuccessors(workflow, node.id);
        successors.forEach(successor => {
          if (!visited.has(successor.id)) {
            queue.push(successor);
          }
        });

        // Check for parallel execution opportunities
        if (node.type === 'parallel') {
          const parallelBranches = this.getParallelBranches(workflow, node.id);
          await this.executeParallelNodes(execution, workflow, parallelBranches);
        }
      }

      // Update execution status
      if (this.activeExecutions.has(executionId)) {
        const failedNodes = execution.nodeExecutions.filter(n => n.status === 'failed');
        execution.status = failedNodes.length > 0 ? 'failed' : 'completed';
        execution.endTime = new Date();
        this.updateExecutionMetrics(execution);
        this.activeExecutions.delete(executionId);
      }

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.errors.push({
        timestamp: new Date(),
        type: 'system',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      this.activeExecutions.delete(executionId);
    }

    websocketService.broadcast({
      type: 'workflow_execution_completed',
      payload: execution,
      timestamp: new Date()
    });
  }

  private async executeNode(
    execution: WorkflowExecution,
    workflow: Workflow,
    node: WorkflowNode
  ): Promise<void> {
    const nodeExecution: NodeExecution = {
      nodeId: node.id,
      status: 'active',
      startTime: new Date(),
    };

    execution.nodeExecutions.push(nodeExecution);

    try {
      // Prepare inputs
      nodeExecution.inputs = await this.prepareNodeInputs(execution, node);

      // Execute based on node type
      switch (node.type) {
        case 'start':
        case 'end':
          nodeExecution.status = 'completed';
          break;

        case 'task':
          await this.executeTaskNode(execution, node, nodeExecution);
          break;

        case 'decision':
          await this.executeDecisionNode(execution, workflow, node, nodeExecution);
          break;

        case 'wait':
          await this.executeWaitNode(node, nodeExecution);
          break;

        case 'loop':
          await this.executeLoopNode(execution, workflow, node, nodeExecution);
          break;

        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }

      nodeExecution.endTime = new Date();
      
      // Store outputs in context
      if (nodeExecution.outputs) {
        execution.context.outputs[node.id] = nodeExecution.outputs;
      }

    } catch (error) {
      nodeExecution.status = 'failed';
      nodeExecution.endTime = new Date();
      nodeExecution.error = {
        nodeId: node.id,
        timestamp: new Date(),
        type: 'execution',
        message: error instanceof Error ? error.message : 'Unknown error',
      };

      // Handle error based on error handling policy
      if (nodeExecution.error) {
        await this.handleNodeError(execution, workflow, node, nodeExecution);
      }
    }

    // Broadcast node execution update
    websocketService.broadcast({
      type: 'workflow_node_executed',
      payload: {
        executionId: execution.id,
        nodeExecution,
      },
      timestamp: new Date()
    });
  }

  private async executeTaskNode(
    execution: WorkflowExecution,
    node: WorkflowNode,
    nodeExecution: NodeExecution
  ): Promise<void> {
    const { taskType, agentType, config } = node.data;

    if (taskType === 'agent' && agentType) {
      // Find available agent
      const farmId = execution.context.metadata.farmId;
      const agents = execution.context.metadata.agents as AgentInstance[];
      
      const availableAgent = agents.find(
        a => a.type === agentType && a.state.current === 'idle'
      );

      if (!availableAgent) {
        throw new Error(`No available ${agentType} agent`);
      }

      // Assign task to agent
      const task = await agentLifecycle.assignTask(availableAgent.instanceId, {
        type: 'custom',
        priority: 'medium',
        payload: {
          ...config,
          inputs: nodeExecution.inputs,
        },
      });

      // Wait for task completion
      nodeExecution.outputs = await this.waitForTaskCompletion(task.id);
      nodeExecution.status = 'completed';

    } else if (taskType === 'system') {
      // Execute system task
      nodeExecution.outputs = await this.executeSystemTask(config, nodeExecution.inputs);
      nodeExecution.status = 'completed';

    } else if (taskType === 'external') {
      // Execute external API call
      nodeExecution.outputs = await this.executeExternalTask(config, nodeExecution.inputs);
      nodeExecution.status = 'completed';
    }
  }

  private async executeDecisionNode(
    execution: WorkflowExecution,
    workflow: Workflow,
    node: WorkflowNode,
    nodeExecution: NodeExecution
  ): Promise<void> {
    // Evaluate conditions on outgoing edges
    const edges = workflow.edges.filter(e => e.source === node.id);
    
    for (const edge of edges) {
      if (edge.condition) {
        const result = await this.evaluateCondition(edge.condition, execution.context);
        if (result) {
          // This is the path to take
          nodeExecution.outputs = { selectedPath: edge.target };
          nodeExecution.status = 'completed';
          return;
        }
      }
    }

    // Default path
    const defaultEdge = edges.find(e => !e.condition);
    if (defaultEdge) {
      nodeExecution.outputs = { selectedPath: defaultEdge.target };
      nodeExecution.status = 'completed';
    } else {
      throw new Error('No valid path from decision node');
    }
  }

  private async executeWaitNode(
    node: WorkflowNode,
    nodeExecution: NodeExecution
  ): Promise<void> {
    const waitTime = node.data.config?.duration || 1000;
    await new Promise(resolve => setTimeout(resolve, waitTime));
    nodeExecution.status = 'completed';
  }

  private async executeLoopNode(
    execution: WorkflowExecution,
    workflow: Workflow,
    node: WorkflowNode,
    nodeExecution: NodeExecution
  ): Promise<void> {
    const { config } = node.data;
    const iterations = config?.iterations || 1;
    const loopBody = this.getLoopBody(workflow, node.id);

    for (let i = 0; i < iterations; i++) {
      execution.context.variables[`${node.id}_index`] = i;
      
      // Execute loop body
      for (const bodyNode of loopBody) {
        await this.executeNode(execution, workflow, bodyNode);
      }
    }

    nodeExecution.status = 'completed';
  }

  private async executeParallelNodes(
    execution: WorkflowExecution,
    workflow: Workflow,
    branches: WorkflowNode[][]
  ): Promise<void> {
    const promises = branches.map(branch =>
      this.executeBranch(execution, workflow, branch)
    );

    await Promise.all(promises);
  }

  private async executeBranch(
    execution: WorkflowExecution,
    workflow: Workflow,
    branch: WorkflowNode[]
  ): Promise<void> {
    for (const node of branch) {
      await this.executeNode(execution, workflow, node);
    }
  }

  private async handleNodeError(
    execution: WorkflowExecution,
    workflow: Workflow,
    node: WorkflowNode,
    nodeExecution: NodeExecution
  ): Promise<void> {
    const errorHandling = node.data?.errorHandling;
    
    if (!errorHandling || !nodeExecution.error) {
      // Default behavior - fail the workflow
      if (nodeExecution.error) {
        execution.errors.push(nodeExecution.error);
      }
      return;
    }

    switch (errorHandling.strategy) {
      case 'retry':
        if ((nodeExecution.retryCount || 0) < (errorHandling.retryConfig?.times || 3)) {
          nodeExecution.retryCount = (nodeExecution.retryCount || 0) + 1;
          await new Promise(resolve => 
            setTimeout(resolve, errorHandling.retryConfig?.delay || 1000)
          );
          await this.executeNode(execution, workflow, node);
        } else {
          if (nodeExecution.error) {
            execution.errors.push(nodeExecution.error);
          }
        }
        break;

      case 'skip':
        nodeExecution.status = 'skipped';
        break;

      case 'compensate':
        if (errorHandling.compensationTask) {
          // Execute compensation task
          const compensationNode = workflow.nodes.find(
            n => n.id === errorHandling.compensationTask
          );
          if (compensationNode) {
            await this.executeNode(execution, workflow, compensationNode);
          }
        }
        break;

      case 'fail':
      default:
        if (nodeExecution.error) {
          execution.errors.push(nodeExecution.error);
        }
        break;
    }
  }

  private async prepareNodeInputs(
    execution: WorkflowExecution,
    node: WorkflowNode
  ): Promise<Record<string, any>> {
    const inputs: Record<string, any> = {};

    if (node.data.inputs) {
      for (const input of node.data.inputs) {
        const value = this.resolveValue(input.name, execution.context);
        inputs[input.name] = value !== undefined ? value : input.default;
      }
    }

    return inputs;
  }

  private resolveValue(path: string, context: WorkflowContext): any {
    const parts = path.split('.');
    let value: any = context;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  private async evaluateCondition(
    condition: any,
    context: WorkflowContext
  ): Promise<boolean> {
    // Simple expression evaluation
    // In production, use a proper expression evaluator
    try {
      const expression = condition.value;
      const func = new Function('context', `return ${expression}`);
      return func(context);
    } catch {
      return false;
    }
  }

  private async executeSystemTask(
    config: any,
    inputs: any
  ): Promise<any> {
    // Simulate system task execution
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { success: true, ...inputs };
  }

  private async executeExternalTask(
    config: any,
    inputs: any
  ): Promise<any> {
    // Simulate external API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { data: 'external_response', ...inputs };
  }

  private async waitForTaskCompletion(taskId: string): Promise<any> {
    // In production, this would poll or subscribe to task status
    await new Promise(resolve => setTimeout(resolve, 5000));
    return { taskId, result: 'completed' };
  }

  private initializeVariables(
    workflow: Workflow,
    inputs?: Record<string, any>
  ): Record<string, any> {
    const variables: Record<string, any> = {};

    workflow.variables?.forEach(variable => {
      if (inputs && variable.name in inputs) {
        variables[variable.name] = inputs[variable.name];
      } else if (variable.value !== undefined) {
        variables[variable.name] = variable.value;
      } else if (variable.required) {
        throw new Error(`Required variable ${variable.name} not provided`);
      }
    });

    return variables;
  }

  private updateExecutionMetrics(execution: WorkflowExecution): void {
    const metrics = execution.metrics;
    
    metrics.completedNodes = execution.nodeExecutions.filter(
      n => n.status === 'completed'
    ).length;
    
    metrics.failedNodes = execution.nodeExecutions.filter(
      n => n.status === 'failed'
    ).length;
    
    metrics.skippedNodes = execution.nodeExecutions.filter(
      n => n.status === 'skipped'
    ).length;

    const durations = execution.nodeExecutions
      .filter(n => n.startTime && n.endTime)
      .map(n => n.endTime!.getTime() - n.startTime!.getTime());

    if (durations.length > 0) {
      metrics.averageNodeDuration = 
        durations.reduce((a, b) => a + b, 0) / durations.length;
    }

    if (execution.startTime && execution.endTime) {
      metrics.totalDuration = 
        execution.endTime.getTime() - execution.startTime.getTime();
    }
  }

  private getNodeDependencies(workflow: Workflow, nodeId: string): string[] {
    return workflow.edges
      .filter(edge => edge.target === nodeId)
      .map(edge => edge.source);
  }

  private getNodeSuccessors(workflow: Workflow, nodeId: string): WorkflowNode[] {
    const successorIds = workflow.edges
      .filter(edge => edge.source === nodeId)
      .map(edge => edge.target);

    return workflow.nodes.filter(node => successorIds.includes(node.id));
  }

  private getParallelBranches(workflow: Workflow, nodeId: string): WorkflowNode[][] {
    const branches: WorkflowNode[][] = [];
    const successors = this.getNodeSuccessors(workflow, nodeId);

    successors.forEach(successor => {
      const branch = this.collectBranch(workflow, successor.id);
      branches.push(branch);
    });

    return branches;
  }

  private collectBranch(workflow: Workflow, startNodeId: string): WorkflowNode[] {
    const branch: WorkflowNode[] = [];
    const queue = [startNodeId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      
      visited.add(nodeId);
      const node = workflow.nodes.find(n => n.id === nodeId);
      
      if (node && node.type !== 'parallel') {
        branch.push(node);
        const successors = this.getNodeSuccessors(workflow, nodeId);
        successors.forEach(s => queue.push(s.id));
      }
    }

    return branch;
  }

  private getLoopBody(workflow: Workflow, loopNodeId: string): WorkflowNode[] {
    // Collect nodes that are part of the loop body
    const body: WorkflowNode[] = [];
    const successors = this.getNodeSuccessors(workflow, loopNodeId);
    
    // Simple implementation - in production, need proper loop detection
    successors.forEach(successor => {
      if (successor.type !== 'loop') {
        body.push(successor);
      }
    });

    return body;
  }

  private hasCycles(workflow: Workflow): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycleDFS = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const successors = workflow.edges
        .filter(edge => edge.source === nodeId)
        .map(edge => edge.target);

      for (const successor of successors) {
        if (!visited.has(successor)) {
          if (hasCycleDFS(successor)) return true;
        } else if (recursionStack.has(successor)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of workflow.nodes) {
      if (!visited.has(node.id)) {
        if (hasCycleDFS(node.id)) return true;
      }
    }

    return false;
  }
}

export const workflowEngine = new WorkflowEngine();
export { WorkflowEngine };