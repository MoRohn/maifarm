import { v4 as uuidv4 } from 'uuid'
import { ensureDate } from '@/utils/dateHelpers'
import {
  Workflow,
  WorkflowStatus,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  WorkflowExecution,
  WorkflowTrigger,
  Task,
  TaskStatus
} from '@/types/orchestration'
import { agentLifecycleManager } from './agentLifecycleManager'
import { dependencyResolver } from './dependencyResolver'
import { websocketService } from '../websocket'
import { auditService } from '../audit'

// Extended WorkflowExecution interface for the engine
interface ExtendedWorkflowExecution extends WorkflowExecution {
  progress?: number;
  currentNodes?: string[];
  completedNodes?: string[];
  failedNodes?: string[];
  variables?: Record<string, any>;
  completedAt?: Date;
  error?: string;
  startedAt?: Date;
}

interface ExecutionContext {
  workflowId: string
  executionId: string
  variables: Record<string, any>
  completedNodes: Set<string>
  failedNodes: Set<string>
  currentNodes: Set<string>
  nodeResults: Map<string, any>
}

class WorkflowEngine {
  private workflows: Map<string, Workflow> = new Map()
  private executions: Map<string, ExtendedWorkflowExecution> = new Map()
  private executionContexts: Map<string, ExecutionContext> = new Map()
  private scheduledTriggers: Map<string, NodeJS.Timeout> = new Map()

  async createWorkflow(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
    const id = uuidv4()
    const now = new Date()

    const newWorkflow: Workflow = {
      ...workflow,
      id,
      status: 'draft',
      createdAt: now,
      updatedAt: now
    }

    // Validate workflow definition
    await this.validateWorkflow(newWorkflow.definition)

    this.workflows.set(id, newWorkflow)

    // Set up triggers if workflow is ready
    if (workflow.status === 'ready') {
      this.setupTriggers(newWorkflow)
    }

    await auditService.log({
      action: 'workflow.created',
      resourceId: id,
      resource: 'workflow',
      userId: 'user',
    })

    return newWorkflow
  }

  async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow> {
    const workflow = this.workflows.get(id)
    if (!workflow) {
      throw new Error(`Workflow ${id} not found`)
    }

    // Don't allow updates while running
    if (workflow.status === 'active') {
      throw new Error('Cannot update workflow while it is running')
    }

    const updatedWorkflow: Workflow = {
      ...workflow,
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: new Date()
    }

    if (updates.definition) {
      await this.validateWorkflow(updatedWorkflow.definition)
    }

    this.workflows.set(id, updatedWorkflow)

    // Update triggers
    this.clearTriggers(id)
    if (updatedWorkflow.status === 'ready') {
      this.setupTriggers(updatedWorkflow)
    }

    return updatedWorkflow
  }

  async deleteWorkflow(id: string): Promise<void> {
    const workflow = this.workflows.get(id)
    if (!workflow) {
      throw new Error(`Workflow ${id} not found`)
    }

    if (workflow.status === 'active') {
      throw new Error('Cannot delete workflow while it is running')
    }

    this.clearTriggers(id)
    this.workflows.delete(id)

    await auditService.log({
      action: 'workflow.deleted',
      resourceId: id,
      resource: 'workflow',
      userId: 'user'
    })
  }

  async executeWorkflow(workflowId: string, variables?: Record<string, any>): Promise<ExtendedWorkflowExecution> {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`)
    }

    if (workflow.status !== 'ready' && workflow.status !== 'completed' && workflow.status !== 'failed') {
      throw new Error(`Workflow must be in ready state to execute`)
    }

    const executionId = uuidv4()
    const execution: ExtendedWorkflowExecution = {
      id: executionId,
      workflowId,
      status: 'active',
      progress: 0,
      currentNodes: [],
      completedNodes: [],
      failedNodes: [],
      variables: { ...(workflow.definition.variables || {}), ...variables },
      startedAt: new Date()
    }

    const context: ExecutionContext = {
      workflowId,
      executionId,
      variables: execution.variables || {},
      completedNodes: new Set(),
      failedNodes: new Set(),
      currentNodes: new Set(),
      nodeResults: new Map()
    }

    this.executions.set(executionId, execution)
    this.executionContexts.set(executionId, context)

    // Update workflow status
    workflow.status = 'active'
    workflow.execution = execution

    // Start execution
    this.broadcastExecutionUpdate(execution)
    await this.startExecution(workflow, execution, context)

    return execution
  }

  private async startExecution(workflow: Workflow, execution: ExtendedWorkflowExecution, context: ExecutionContext): Promise<void> {
    try {
      // Find start nodes (nodes with no incoming edges)
      const startNodes = this.findStartNodes(workflow.definition)
      
      if (startNodes.length === 0) {
        throw new Error('No start nodes found in workflow')
      }

      // Execute start nodes
      await this.executeNodes(startNodes, workflow, execution, context)

      // Continue execution until complete
      await this.continueExecution(workflow, execution, context)

      // Mark as completed
      execution.status = 'completed'
      execution.completedAt = new Date()
      execution.progress = 100
      workflow.status = 'completed'

    } catch (error) {
      execution.status = 'failed'
      execution.error = error instanceof Error ? error.message : 'Unknown error'
      execution.completedAt = new Date()
      workflow.status = 'failed'
    }

    this.broadcastExecutionUpdate(execution)
  }

  private async continueExecution(workflow: Workflow, execution: ExtendedWorkflowExecution, context: ExecutionContext): Promise<void> {
    while (context.currentNodes.size > 0 || this.hasExecutableNodes(workflow.definition, context)) {
      // Wait for current nodes to complete
      if (context.currentNodes.size > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }

      // Find next executable nodes
      const nextNodes = this.findExecutableNodes(workflow.definition, context)
      
      if (nextNodes.length === 0) {
        break
      }

      await this.executeNodes(nextNodes, workflow, execution, context)
    }
  }

  private async executeNodes(nodes: WorkflowNode[], workflow: Workflow, execution: ExtendedWorkflowExecution, context: ExecutionContext): Promise<void> {
    // Update current nodes
    nodes.forEach(node => context.currentNodes.add(node.id))
    execution.currentNodes = Array.from(context.currentNodes)
    this.broadcastExecutionUpdate(execution)

    // Execute nodes based on type
    const promises = nodes.map(node => this.executeNode(node, workflow, execution, context))
    await Promise.allSettled(promises)
  }

  private async executeNode(node: WorkflowNode, workflow: Workflow, execution: ExtendedWorkflowExecution, context: ExecutionContext): Promise<void> {
    try {
      let result: any

      switch (node.type) {
        case 'task':
          result = await this.executeTaskNode(node, context)
          break
        case 'condition':
          result = await this.executeConditionNode(node, context)
          break
        case 'parallel':
          result = await this.executeParallelNode(node, workflow.definition, context)
          break
        case 'sequential':
          result = await this.executeSequentialNode(node, workflow.definition, context)
          break
        case 'loop':
          result = await this.executeLoopNode(node, context)
          break
        default:
          throw new Error(`Unknown node type: ${node.type}`)
      }

      // Mark node as completed
      context.completedNodes.add(node.id)
      context.currentNodes.delete(node.id)
      context.nodeResults.set(node.id, result)

      // Update execution
      execution.completedNodes = Array.from(context.completedNodes)
      execution.currentNodes = Array.from(context.currentNodes)
      execution.progress = Math.round((context.completedNodes.size / workflow.definition.nodes.length) * 100)

    } catch (error) {
      // Mark node as failed
      context.failedNodes.add(node.id)
      context.currentNodes.delete(node.id)
      
      execution.failedNodes = Array.from(context.failedNodes)
      execution.currentNodes = Array.from(context.currentNodes)
      
      throw error
    }

    this.broadcastExecutionUpdate(execution)
  }

  private async executeTaskNode(node: WorkflowNode, context: ExecutionContext): Promise<any> {
    const { agentType, taskType, config } = node.configuration

    // Find available agent
    const agents = agentLifecycleManager.getAllAgents()
    const availableAgent = agents.find(agent => 
      agent.type === agentType && 
      (agent.status === 'idle' || agent.status === 'active') &&
      agent.capabilities.includes(taskType)
    )

    if (!availableAgent) {
      throw new Error(`No available agent found for type ${agentType} with capability ${taskType}`)
    }

    // Create task
    const task: Task = {
      id: uuidv4(),
      agentId: availableAgent.id,
      workflowId: context.workflowId,
      type: taskType,
      status: 'pending',
      priority: config.priority || 'medium',
      payload: this.interpolateVariables(config.payload || {}, context.variables),
      retries: 0,
      createdAt: new Date()
    }

    // Assign task to agent
    await agentLifecycleManager.assignTask(availableAgent.id, task)

    // Wait for task completion
    const result = await this.waitForTaskCompletion(task.id, node.configuration.timeout || 60000)
    
    return result
  }

  private async executeConditionNode(node: WorkflowNode, context: ExecutionContext): Promise<boolean> {
    const { expression } = node.configuration
    
    // Simple expression evaluation (in production, use a proper expression parser)
    const evalContext = {
      ...context.variables,
      ...Object.fromEntries(context.nodeResults)
    }

    try {
      // WARNING: eval is dangerous - in production, use a safe expression evaluator
      const result = Function(...Object.keys(evalContext), `return ${expression}`)(...Object.values(evalContext))
      return Boolean(result)
    } catch (error) {
      throw new Error(`Failed to evaluate condition: ${error}`)
    }
  }

  private async executeParallelNode(node: WorkflowNode, definition: WorkflowDefinition, context: ExecutionContext): Promise<any[]> {
    const { nodeIds } = node.configuration
    const parallelNodes = nodeIds.map((id: string) => 
      definition.nodes.find(n => n.id === id)
    ).filter(Boolean)

    const promises = parallelNodes.map((n: WorkflowNode) => 
      this.executeNode(n, { definition } as Workflow, {} as ExtendedWorkflowExecution, context)
    )

    return await Promise.all(promises)
  }

  private async executeSequentialNode(node: WorkflowNode, definition: WorkflowDefinition, context: ExecutionContext): Promise<any[]> {
    const { nodeIds } = node.configuration
    const sequentialNodes = nodeIds.map((id: string) => 
      definition.nodes.find(n => n.id === id)
    ).filter(Boolean)

    const results = []
    for (const n of sequentialNodes) {
      const result = await this.executeNode(n, { definition } as Workflow, {} as ExtendedWorkflowExecution, context)
      results.push(result)
    }

    return results
  }

  private async executeLoopNode(node: WorkflowNode, context: ExecutionContext): Promise<any[]> {
    const { count, nodeId } = node.configuration
    const results = []

    for (let i = 0; i < count; i++) {
      context.variables.loopIndex = i
      const result = await this.executeNode(
        { id: nodeId } as WorkflowNode,
        {} as Workflow,
        {} as ExtendedWorkflowExecution,
        context
      )
      results.push(result)
    }

    delete context.variables.loopIndex
    return results
  }

  private async waitForTaskCompletion(taskId: string, timeout: number): Promise<any> {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeout) {
      // In a real implementation, this would check task status
      // For now, simulate task completion
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Simulate task result
      return {
        success: true,
        data: { taskId, completedAt: new Date() }
      }
    }

    throw new Error(`Task ${taskId} timed out after ${timeout}ms`)
  }

  private findStartNodes(definition: WorkflowDefinition): WorkflowNode[] {
    const nodesWithIncomingEdges = new Set(definition.edges.map(e => e.target))
    return definition.nodes.filter(node => !nodesWithIncomingEdges.has(node.id))
  }

  private findExecutableNodes(definition: WorkflowDefinition, context: ExecutionContext): WorkflowNode[] {
    return definition.nodes.filter(node => {
      // Skip if already processed
      if (context.completedNodes.has(node.id) || context.failedNodes.has(node.id) || context.currentNodes.has(node.id)) {
        return false
      }

      // Check if all dependencies are satisfied
      const incomingEdges = definition.edges.filter(e => e.target === node.id)
      return incomingEdges.every(edge => {
        const sourceCompleted = context.completedNodes.has(edge.source)
        
        // Check edge condition if present
        if (edge.condition && sourceCompleted) {
          const sourceResult = context.nodeResults.get(edge.source)
          return this.evaluateEdgeCondition(edge.condition, sourceResult, context.variables)
        }
        
        return sourceCompleted
      })
    })
  }

  private hasExecutableNodes(definition: WorkflowDefinition, context: ExecutionContext): boolean {
    return this.findExecutableNodes(definition, context).length > 0
  }

  private evaluateEdgeCondition(condition: string, sourceResult: any, variables: Record<string, any>): boolean {
    // Simple condition evaluation
    try {
      const evalContext = { result: sourceResult, ...variables }
      return Function(...Object.keys(evalContext), `return ${condition}`)(...Object.values(evalContext))
    } catch {
      return false
    }
  }

  private interpolateVariables(obj: any, variables: Record<string, any>): any {
    if (typeof obj === 'string') {
      return obj.replace(/\${(\w+)}/g, (match, key) => variables[key] || match)
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.interpolateVariables(item, variables))
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const result: any = {}
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.interpolateVariables(value, variables)
      }
      return result
    }
    
    return obj
  }

  private async validateWorkflow(definition: WorkflowDefinition): Promise<void> {
    // Check for cycles
    const hasCycles = await dependencyResolver.detectCycles(
      definition.nodes.map(n => n.id),
      definition.edges.map(e => ({ from: e.source, to: e.target }))
    )
    
    if (hasCycles) {
      throw new Error('Workflow contains circular dependencies')
    }

    // Validate node references
    const nodeIds = new Set(definition.nodes.map(n => n.id))
    for (const edge of definition.edges) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        throw new Error('Edge references non-existent node')
      }
    }

    // Validate triggers
    if (definition.triggers) {
      for (const trigger of definition.triggers) {
        this.validateTrigger(trigger)
      }
    }
  }

  private validateTrigger(trigger: WorkflowTrigger): void {
    switch (trigger.type) {
      case 'schedule':
        if (!trigger.configuration.cron) {
          throw new Error('Schedule trigger requires cron expression')
        }
        break
      case 'webhook':
        if (!trigger.configuration.endpoint) {
          throw new Error('Webhook trigger requires endpoint')
        }
        break
      case 'event':
        if (!trigger.configuration.eventType) {
          throw new Error('Event trigger requires eventType')
        }
        break
    }
  }

  private setupTriggers(workflow: Workflow): void {
    if (!workflow.definition.triggers) return

    for (const trigger of workflow.definition.triggers) {
      switch (trigger.type) {
        case 'schedule':
          this.setupScheduleTrigger(workflow.id, trigger)
          break
        case 'event':
          this.setupEventTrigger(workflow.id, trigger)
          break
        case 'webhook':
          this.setupWebhookTrigger(workflow.id, trigger)
          break
      }
    }
  }

  private setupScheduleTrigger(workflowId: string, trigger: WorkflowTrigger): void {
    // Simple interval-based scheduling (in production, use proper cron library)
    const interval = trigger.configuration.interval || 60000
    const timer = setInterval(() => {
      this.executeWorkflow(workflowId, { trigger: 'schedule' })
    }, interval)
    
    this.scheduledTriggers.set(`${workflowId}-${trigger.type}`, timer)
  }

  private setupEventTrigger(workflowId: string, trigger: WorkflowTrigger): void {
    // Register event listener
    const eventType = trigger.configuration.eventType
    websocketService.on(eventType, (data: any) => {
      this.executeWorkflow(workflowId, { trigger: 'event', eventData: data })
    })
  }

  private setupWebhookTrigger(workflowId: string, trigger: WorkflowTrigger): void {
    // In production, register webhook endpoint with API server
    console.log(`Webhook trigger registered for workflow ${workflowId}`)
  }

  private clearTriggers(workflowId: string): void {
    // Clear scheduled triggers
    for (const [key, timer] of this.scheduledTriggers.entries()) {
      if (key.startsWith(workflowId)) {
        clearInterval(timer)
        this.scheduledTriggers.delete(key)
      }
    }
  }

  private broadcastExecutionUpdate(execution: ExtendedWorkflowExecution): void {
    websocketService.broadcast({
      type: 'workflow:status:update',
      data: execution,
      timestamp: new Date()
    })
  }

  getWorkflow(id: string): Workflow | undefined {
    return this.workflows.get(id)
  }

  getAllWorkflows(): Workflow[] {
    return Array.from(this.workflows.values())
  }

  getWorkflowsByFarm(farmId: string): Workflow[] {
    return Array.from(this.workflows.values()).filter(w => w.farmId === farmId)
  }

  getExecution(id: string): ExtendedWorkflowExecution | undefined {
    return this.executions.get(id)
  }

  async pauseWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId)
    if (!workflow || workflow.status !== 'active') {
      throw new Error('Workflow is not running')
    }

    workflow.status = 'paused'
    if (workflow.execution) {
      workflow.execution.status = 'suspended'
    }

    this.broadcastExecutionUpdate(workflow.execution!)
  }

  async resumeWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId)
    if (!workflow || workflow.status !== 'paused') {
      throw new Error('Workflow is not paused')
    }

    workflow.status = 'active'
    if (workflow.execution) {
      workflow.execution.status = 'active'
      const context = this.executionContexts.get(workflow.execution.id)
      if (context) {
        await this.continueExecution(workflow, workflow.execution, context)
      }
    }
  }

  async cancelWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId)
    if (!workflow || (workflow.status !== 'active' && workflow.status !== 'paused')) {
      throw new Error('Workflow is not running or paused')
    }

    workflow.status = 'cancelled'
    if (workflow.execution) {
      workflow.execution.status = 'cancelled'
      if (workflow.execution) {
        (workflow.execution as any).completedAt = new Date();
      }
    }

    this.broadcastExecutionUpdate(workflow.execution!)
  }
}

export const workflowEngine = new WorkflowEngine()