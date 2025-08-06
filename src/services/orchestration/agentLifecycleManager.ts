import { v4 as uuidv4 } from 'uuid'
import {
  Agent,
  AgentLifecycle,
  LifecycleEvent,
  HealthStatus,
  HealthCheck,
  AgentResources,
  AgentMetrics,
  HealthCheckConfig,
  Task
} from '../../types/orchestration'
import { WebSocketMessage, AgentStatus } from '../../types/index'
import type { AgentStatus as OrchestrationAgentStatus } from '../../types/orchestration'
import { websocketService } from '../websocket'
import { monitoringService } from '../monitoringService'
import { auditService } from '../audit'

interface AgentProvisionRequest {
  farmId: string
  type: string
  capabilities: string[]
  resources: {
    cpu: number
    memory: string
    storage: string
  }
  environment: Record<string, string>
  healthCheck?: HealthCheckConfig
}

class AgentLifecycleManager {
  private agents: Map<string, Agent> = new Map()
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map()
  private stateMachineRules: Map<AgentStatus, AgentStatus[]> = new Map([
    ['provisioning', ['starting', 'failed']],
    ['starting', ['running', 'failed']],
    ['running', ['busy', 'idle', 'stopping', 'failed']],
    ['busy', ['idle', 'running', 'stopping', 'failed']],
    ['idle', ['busy', 'running', 'stopping', 'failed']],
    ['stopping', ['stopped', 'failed']],
    ['stopped', ['starting', 'failed']],
    ['failed', ['starting', 'stopped']]
  ])

  async provisionAgent(request: AgentProvisionRequest): Promise<Agent> {
    const agentId = uuidv4()
    
    const agent: Agent = {
      id: agentId,
      name: `Agent-${agentId.slice(0, 8)}`,
      farmId: request.farmId,
      type: request.type as 'builder' | 'reviewer' | 'tester' | 'documenter' | 'custom',
      status: 'provisioning',
      progress: 0,
      memory: 0,
      cpu: 0,
      lastActive: new Date(),
      capabilities: request.capabilities,
      lifecycle: {
        state: 'provisioning',
        phase: 'provisioning',
        startTime: new Date(),
        lastUpdate: new Date(),
        health: {
          status: 'unknown',
          lastCheck: new Date()
        }
      },
      resources: {
        cpu: {
          usage: 0,
          allocated: request.resources.cpu,
          limit: request.resources.cpu
        },
        memory: {
          usage: 0,
          allocated: parseInt(request.resources.memory) || 1024,
          limit: parseInt(request.resources.memory) || 1024
        },
        network: {
          inbound: '0MB',
          outbound: '0MB'
        },
        cpuUsage: 0,
        memoryUsage: 0
      },
      metrics: {
        tasksCompleted: 0,
        successRate: 1.0,
        averageTaskDuration: 0,
        uptime: 0,
        tasksFailed: 0
      },
      tasks: [],
      metadata: {}
    }

    this.agents.set(agentId, agent)
    
    // Record lifecycle event
    this.recordLifecycleEvent(agent, 'provisioning', 'provisioning', 'Agent provisioning started')
    
    // Simulate provisioning process
    await this.simulateProvisioning(agent, request.environment)
    
    // Set up health check if configured
    if (request.healthCheck) {
      this.setupHealthCheck(agentId, request.healthCheck)
    }
    
    await auditService.log({
      action: 'agent.provisioned',
      resource: 'agent',
      resourceId: agentId,
      userId: 'system',
      ipAddress: '127.0.0.1',
      userAgent: 'agent-lifecycle-manager',
      success: true,
      severity: 'medium',
      metadata: {
        farmId: request.farmId,
        type: request.type,
        capabilities: request.capabilities
      }
    })
    
    this.broadcastAgentUpdate(agent)
    return agent
  }

  private async simulateProvisioning(agent: Agent, environment: Record<string, string>): Promise<void> {
    // Simulate resource allocation
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Simulate environment setup
    agent.metadata = { environment }
    
    // Transition to starting state
    await this.transitionState(agent.id, 'starting', 'Provisioning completed')
  }

  async startAgent(agentId: string): Promise<Agent> {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    await this.transitionState(agentId, 'starting', 'Starting agent')
    
    // Simulate startup process
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Transition to running state
    await this.transitionState(agentId, 'running', 'Agent started successfully')
    
    // Start monitoring
    this.startMonitoring(agentId)
    
    return agent
  }

  async stopAgent(agentId: string): Promise<Agent> {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    await this.transitionState(agentId, 'stopping', 'Stopping agent')
    
    // Stop health checks
    this.stopHealthCheck(agentId)
    
    // Simulate graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    await this.transitionState(agentId, 'stopped', 'Agent stopped successfully')
    
    return agent
  }

  async terminateAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    // Stop agent if running
    if (agent.status !== 'stopped') {
      await this.stopAgent(agentId)
    }

    // Clean up resources
    this.stopHealthCheck(agentId)
    this.agents.delete(agentId)

    await auditService.log({
      action: 'agent.terminated',
      resource: 'agent',
      resourceId: agentId,
      userId: 'system',
      ipAddress: '127.0.0.1',
      userAgent: 'agent-lifecycle-manager',
      success: true,
      severity: 'medium'
    })

    const message: WebSocketMessage = {
      type: 'agent:terminated',
      payload: { agentId },
      timestamp: new Date()
    }
    websocketService.broadcast(message)
  }

  async scaleAgents(farmId: string, targetCount: number): Promise<Agent[]> {
    const farmAgents = this.getAgentsByFarm(farmId)
    const currentCount = farmAgents.length
    
    if (targetCount === currentCount) {
      return farmAgents
    }
    
    if (targetCount > currentCount) {
      // Scale up
      const toAdd = targetCount - currentCount
      const newAgents: Agent[] = []
      
      // Use first agent as template
      const template = farmAgents[0]
      if (!template) {
        throw new Error('No existing agents to use as template')
      }
      
      for (let i = 0; i < toAdd; i++) {
        const agent = await this.provisionAgent({
          farmId,
          type: template.type,
          capabilities: template.capabilities,
          resources: {
            cpu: template.resources?.cpu?.allocated || 1,
            memory: `${template.resources?.memory?.allocated || 1024}MB`,
            storage: '10GB' // Default storage
          },
          environment: template.metadata?.environment || {}
        })
        
        await this.startAgent(agent.id)
        newAgents.push(agent)
      }
      
      return [...farmAgents, ...newAgents]
    } else {
      // Scale down
      const toRemove = currentCount - targetCount
      const agentsToStop = farmAgents.slice(-toRemove)
      
      for (const agent of agentsToStop) {
        await this.terminateAgent(agent.id)
      }
      
      return farmAgents.slice(0, targetCount)
    }
  }

  private async transitionState(agentId: string, newState: AgentStatus, reason: string): Promise<void> {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    const currentState = agent.status
    const allowedTransitions = this.stateMachineRules.get(currentState) || []
    
    if (!allowedTransitions.includes(newState)) {
      throw new Error(`Invalid state transition from ${currentState} to ${newState}`)
    }

    // Record lifecycle event
    this.recordLifecycleEvent(agent, currentState, newState, reason)
    
    // Update agent state
    agent.status = newState
    if (agent.lifecycle) {
      agent.lifecycle.state = newState
      agent.lifecycle.lastUpdate = new Date()
    }
    
    // Update metrics
    if (newState === 'running' || newState === 'idle') {
      if (agent.lifecycle?.health) {
        agent.lifecycle.health.status = 'healthy'
      }
    } else if (newState === 'failed') {
      if (agent.lifecycle?.health) {
        agent.lifecycle.health.status = 'unhealthy'
      }
    }
    
    this.broadcastAgentUpdate(agent)
  }

  private recordLifecycleEvent(agent: Agent, fromState: AgentStatus, toState: AgentStatus, reason: string): void {
    const event: LifecycleEvent = {
      timestamp: new Date(),
      fromState: fromState as OrchestrationAgentStatus,
      toState: toState as OrchestrationAgentStatus,
      reason
    }
    
    // Initialize lifecycle if not present
    if (!agent.lifecycle) {
      agent.lifecycle = {
        state: toState,
        phase: 'transition',
        startTime: new Date(),
        lastUpdate: new Date()
      }
    }
    
    // For now, store events in metadata since the base Agent type doesn't have history
    if (!agent.metadata) {
      agent.metadata = {}
    }
    if (!agent.metadata.lifecycleHistory) {
      agent.metadata.lifecycleHistory = []
    }
    
    agent.metadata.lifecycleHistory.push(event)
    
    // Keep only last 100 events
    if (agent.metadata.lifecycleHistory.length > 100) {
      agent.metadata.lifecycleHistory = agent.metadata.lifecycleHistory.slice(-100)
    }
  }

  private setupHealthCheck(agentId: string, config: HealthCheckConfig): void {
    const interval = setInterval(async () => {
      await this.performHealthCheck(agentId, config)
    }, config.interval)
    
    this.healthCheckIntervals.set(agentId, interval)
  }

  private stopHealthCheck(agentId: string): void {
    const interval = this.healthCheckIntervals.get(agentId)
    if (interval) {
      clearInterval(interval)
      this.healthCheckIntervals.delete(agentId)
    }
  }

  private async performHealthCheck(agentId: string, config: HealthCheckConfig): Promise<void> {
    const agent = this.agents.get(agentId)
    if (!agent) return

    const checks: HealthCheck[] = []
    
    // CPU check
    const cpuUsage = agent.resources?.cpu?.usage || 0
    const cpuCheck: HealthCheck = {
      name: 'cpu',
      status: cpuUsage < 0.8 ? 'pass' : cpuUsage < 0.95 ? 'warn' : 'fail',
      message: `CPU usage: ${(cpuUsage * 100).toFixed(1)}%`,
      timestamp: new Date()
    }
    checks.push(cpuCheck)
    
    // Memory check
    const memoryUsage = agent.resources?.memory?.usage || 0
    const memoryCheck: HealthCheck = {
      name: 'memory',
      status: memoryUsage < 0.8 ? 'pass' : memoryUsage < 0.95 ? 'warn' : 'fail',
      message: `Memory usage: ${(memoryUsage * 100).toFixed(1)}%`,
      timestamp: new Date()
    }
    checks.push(memoryCheck)
    
    // Task queue check
    const taskCount = agent.tasks?.length || 0
    const queueCheck: HealthCheck = {
      name: 'task_queue',
      status: taskCount < 10 ? 'pass' : taskCount < 50 ? 'warn' : 'fail',
      message: `Tasks in queue: ${taskCount}`,
      timestamp: new Date()
    }
    checks.push(queueCheck)
    
    // Error rate check - use tasksFailed and tasksCompleted to calculate error rate
    const tasksCompleted = agent.metrics?.tasksCompleted || 0
    const tasksFailed = agent.metrics?.tasksFailed || 0
    const totalTasks = tasksCompleted + tasksFailed
    const errorRate = totalTasks > 0 ? tasksFailed / totalTasks : 0
    const errorCheck: HealthCheck = {
      name: 'error_rate',
      status: errorRate < 0.05 ? 'pass' : errorRate < 0.1 ? 'warn' : 'fail',
      message: `Error rate: ${(errorRate * 100).toFixed(1)}%`,
      timestamp: new Date()
    }
    checks.push(errorCheck)
    
    // Determine overall health status
    const failedChecks = checks.filter(c => c.status === 'fail').length
    const warnChecks = checks.filter(c => c.status === 'warn').length
    
    let healthStatus: HealthStatus['status'] = 'healthy'
    if (failedChecks > 0) {
      healthStatus = 'unhealthy'
    } else if (warnChecks > 0) {
      healthStatus = 'degraded'
    }
    
    // Initialize lifecycle if not present
    if (!agent.lifecycle) {
      agent.lifecycle = {
        state: agent.status,
        phase: 'health-check',
        startTime: new Date(),
        lastUpdate: new Date()
      }
    }
    
    agent.lifecycle.health = {
      status: healthStatus,
      lastCheck: new Date()
    }
    
    // Store health checks in metadata for now
    if (!agent.metadata) {
      agent.metadata = {}
    }
    agent.metadata.lastHealthChecks = checks
    agent.metadata.lastHealthCheckTime = new Date()
    
    // Handle unhealthy agents
    if (healthStatus === 'unhealthy' && agent.status === 'running') {
      await this.handleUnhealthyAgent(agent, config)
    }
    
    this.broadcastAgentUpdate(agent)
  }

  private async handleUnhealthyAgent(agent: Agent, config: HealthCheckConfig): Promise<void> {
    // Implement recovery strategies based on configuration
    const failedChecks = (agent.metadata?.lastHealthChecks as HealthCheck[] || []).filter((c: HealthCheck) => c.status === 'fail')
    
    for (const check of failedChecks) {
      switch (check.name) {
        case 'cpu':
        case 'memory':
          // Resource exhaustion - try to reduce load
          await this.reduceAgentLoad(agent)
          break
        case 'error_rate':
          // High error rate - might need restart
          const tasksCompleted = agent.metrics?.tasksCompleted || 0
          const tasksFailed = agent.metrics?.tasksFailed || 0
          const totalTasks = tasksCompleted + tasksFailed
          const errorRate = totalTasks > 0 ? tasksFailed / totalTasks : 0
          if (errorRate > 0.2) {
            await this.restartAgent(agent.id)
          }
          break
        case 'task_queue':
          // Queue overflow - redistribute tasks
          await this.redistributeTasks(agent)
          break
      }
    }
  }

  private async reduceAgentLoad(agent: Agent): Promise<void> {
    // Mark agent as busy to prevent new task assignments
    if (agent.status === 'idle') {
      await this.transitionState(agent.id, 'busy', 'Reducing load due to resource constraints')
    }
    
    // Notify orchestrator to redistribute load
    const message: WebSocketMessage = {
      type: 'agent:load:high',
      payload: {
        agentId: agent.id,
        farmId: agent.farmId,
        resources: agent.resources
      },
      timestamp: new Date()
    }
    websocketService.broadcast(message)
  }

  private async redistributeTasks(agent: Agent): Promise<void> {
    // Move pending tasks to other agents
    const pendingTasks = (agent.tasks || []).filter(t => t.status === 'pending')
    
    if (pendingTasks.length > 0) {
      const message: WebSocketMessage = {
        type: 'tasks:redistribute',
        payload: {
          agentId: agent.id,
          farmId: agent.farmId,
          tasks: pendingTasks
        },
        timestamp: new Date()
      }
      websocketService.broadcast(message)
      
      // Clear redistributed tasks
      if (agent.tasks) {
        agent.tasks = agent.tasks.filter(t => t.status !== 'pending')
      }
    }
  }

  private async restartAgent(agentId: string): Promise<void> {
    await this.stopAgent(agentId)
    await new Promise(resolve => setTimeout(resolve, 2000))
    await this.startAgent(agentId)
  }

  private startMonitoring(agentId: string): void {
    // Simulate resource usage updates
    const updateInterval = setInterval(() => {
      const agent = this.agents.get(agentId)
      if (!agent || agent.status !== 'running') {
        clearInterval(updateInterval)
        return
      }
      
      // Simulate resource usage
      if (agent.resources?.cpu) {
        agent.resources.cpu.usage = Math.random() * 0.8
      }
      if (agent.resources?.memory) {
        agent.resources.memory.usage = Math.random() * 0.7
      }
      if (agent.metrics) {
        agent.metrics.uptime += 5
      }
      
      this.broadcastAgentMetrics(agent)
    }, 5000)
  }

  private broadcastAgentUpdate(agent: Agent): void {
    const message: WebSocketMessage = {
      type: 'agent:lifecycle:change',
      payload: agent,
      timestamp: new Date()
    }
    websocketService.broadcast(message)
  }

  private broadcastAgentMetrics(agent: Agent): void {
    const message: WebSocketMessage = {
      type: 'agent:metrics:update',
      payload: {
        agentId: agent.id,
        resources: agent.resources,
        metrics: agent.metrics
      },
      timestamp: new Date()
    }
    websocketService.broadcast(message)
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId)
  }

  getAgentsByFarm(farmId: string): Agent[] {
    return Array.from(this.agents.values()).filter(agent => agent.farmId === farmId)
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values())
  }

  async updateAgentMetrics(agentId: string, metrics: Partial<AgentMetrics>): Promise<void> {
    const agent = this.agents.get(agentId)
    if (!agent || !agent.metrics) return
    
    agent.metrics = { ...agent.metrics, ...metrics }
    agent.lastActive = new Date()
    
    this.broadcastAgentUpdate(agent)
  }

  async assignTask(agentId: string, task: Task): Promise<void> {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }
    
    if (agent.status !== 'idle' && agent.status !== 'running') {
      throw new Error(`Agent ${agentId} is not available for tasks`)
    }
    
    if (!agent.tasks) {
      agent.tasks = []
    }
    
    // Convert task to the format expected by base Agent type
    const baseTask = {
      id: task.id,
      type: task.type,
      status: task.status,
      priority: task.priority,
      createdAt: task.createdAt
    }
    
    agent.tasks.push(baseTask)
    
    if (agent.status === 'idle') {
      await this.transitionState(agentId, 'busy', 'Task assigned')
    }
    
    this.broadcastAgentUpdate(agent)
  }

  async completeTask(agentId: string, taskId: string, result?: any): Promise<void> {
    const agent = this.agents.get(agentId)
    if (!agent || !agent.tasks) return
    
    const taskIndex = agent.tasks.findIndex(t => t.id === taskId)
    if (taskIndex === -1) return
    
    const task = agent.tasks[taskIndex]
    task.status = 'completed'
    
    // Store result in metadata since base task type doesn't have result field
    if (!agent.metadata) {
      agent.metadata = {}
    }
    if (!agent.metadata.taskResults) {
      agent.metadata.taskResults = {}
    }
    agent.metadata.taskResults[taskId] = result
    
    // Update metrics
    if (agent.metrics) {
      agent.metrics.tasksCompleted++
    }
    
    // Remove completed task
    agent.tasks.splice(taskIndex, 1)
    
    // Transition to idle if no more tasks
    if (agent.tasks.length === 0 && agent.status === 'busy') {
      await this.transitionState(agentId, 'idle', 'All tasks completed')
    }
    
    this.broadcastAgentUpdate(agent)
  }
}

export const agentLifecycleManager = new AgentLifecycleManager()