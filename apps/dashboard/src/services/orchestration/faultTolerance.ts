import { OrchestrationConfig, OrchestrationError, Task } from '@/types/orchestration'
import { websocketService } from '../websocket'
import { monitoringService } from '../monitoringService'
import { auditService } from '../audit'

interface RetryPolicy {
  maxRetries: number
  initialDelay: number
  maxDelay: number
  backoffMultiplier: number
  jitter: boolean
}

interface CircuitBreakerState {
  status: 'closed' | 'open' | 'half-open'
  failures: number
  lastFailureTime?: number
  successCount: number
  nextAttemptTime?: number
}

interface FailoverState {
  primaryEndpoint: string
  backupEndpoints: string[]
  currentEndpoint: string
  failureCount: Map<string, number>
  lastHealthCheck: Map<string, number>
}

class FaultToleranceService {
  private defaultRetryPolicy: RetryPolicy = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true
  }

  private circuitBreakers: Map<string, CircuitBreakerState> = new Map()
  private failoverStates: Map<string, FailoverState> = new Map()
  private retryQueues: Map<string, Task[]> = new Map()

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: {
      operationId: string
      retryPolicy?: Partial<RetryPolicy>
      onRetry?: (attempt: number, error: Error) => void
    }
  ): Promise<T> {
    const policy = { ...this.defaultRetryPolicy, ...options.retryPolicy }
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
      try {
        const result = await operation()
        
        // Reset circuit breaker on success
        this.recordSuccess(options.operationId)
        
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        // Record failure
        this.recordFailure(options.operationId, lastError)
        
        if (attempt < policy.maxRetries) {
          const delay = this.calculateDelay(attempt, policy)
          
          if (options.onRetry) {
            options.onRetry(attempt + 1, lastError)
          }
          
          await this.logRetryAttempt(options.operationId, attempt + 1, delay, lastError)
          await this.delay(delay)
        }
      }
    }
    
    throw new Error(`Operation failed after ${policy.maxRetries} retries: ${lastError?.message}`)
  }

  async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    options: {
      circuitId: string
      threshold?: number
      timeout?: number
      resetTimeout?: number
    }
  ): Promise<T> {
    const state = this.getCircuitBreakerState(options.circuitId)
    const threshold = options.threshold || 5
    const timeout = options.timeout || 60000
    const resetTimeout = options.resetTimeout || 30000
    
    // Check circuit breaker state
    if (state.status === 'open') {
      if (Date.now() < (state.nextAttemptTime || 0)) {
        throw new Error(`Circuit breaker is open for ${options.circuitId}`)
      }
      // Try half-open state
      state.status = 'half-open'
      state.successCount = 0
    }
    
    try {
      const result = await operation()
      
      // Record success
      if (state.status === 'half-open') {
        state.successCount++
        if (state.successCount >= 3) {
          // Close circuit after successful operations
          state.status = 'closed'
          state.failures = 0
          state.successCount = 0
        }
      } else if (state.status === 'closed') {
        state.failures = 0
      }
      
      return result
    } catch (error) {
      // Record failure
      state.failures++
      state.lastFailureTime = Date.now()
      
      if (state.status === 'half-open' || state.failures >= threshold) {
        // Open circuit
        state.status = 'open'
        state.nextAttemptTime = Date.now() + resetTimeout
        
        await this.logCircuitBreakerOpen(options.circuitId, state)
      }
      
      throw error
    }
  }

  async executeWithFailover<T>(
    operation: (endpoint: string) => Promise<T>,
    options: {
      failoverId: string
      endpoints: string[]
      healthCheck?: (endpoint: string) => Promise<boolean>
      selectionStrategy?: 'round-robin' | 'least-failures' | 'random'
    }
  ): Promise<T> {
    if (options.endpoints.length === 0) {
      throw new Error('No endpoints available for failover')
    }
    
    const state = this.getFailoverState(options.failoverId, options.endpoints)
    const availableEndpoints = await this.getHealthyEndpoints(state, options.healthCheck)
    
    if (availableEndpoints.length === 0) {
      throw new Error('All endpoints are unhealthy')
    }
    
    let lastError: Error | null = null
    
    for (const endpoint of availableEndpoints) {
      try {
        state.currentEndpoint = endpoint
        const result = await operation(endpoint)
        
        // Reset failure count on success
        state.failureCount.set(endpoint, 0)
        
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        // Record failure
        const failures = (state.failureCount.get(endpoint) || 0) + 1
        state.failureCount.set(endpoint, failures)
        
        await this.logFailoverAttempt(options.failoverId, endpoint, lastError)
        
        // Try next endpoint
        continue
      }
    }
    
    throw new Error(`All endpoints failed: ${lastError?.message}`)
  }

  async implementBulkheadPattern<T>(
    operation: () => Promise<T>,
    options: {
      bulkheadId: string
      maxConcurrent: number
      queueSize?: number
      timeout?: number
    }
  ): Promise<T> {
    // This is a simplified bulkhead implementation
    // In production, use a proper semaphore or resource pool
    
    const timeout = options.timeout || 30000
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Bulkhead timeout')), timeout)
    })
    
    try {
      return await Promise.race([operation(), timeoutPromise])
    } catch (error) {
      if (error instanceof Error && error.message === 'Bulkhead timeout') {
        await this.logBulkheadTimeout(options.bulkheadId)
      }
      throw error
    }
  }

  async scheduleRetry(task: Task, error: OrchestrationError): Promise<void> {
    const queueId = `${task.workflowId}-${task.type}`
    
    if (!this.retryQueues.has(queueId)) {
      this.retryQueues.set(queueId, [])
    }
    
    task.retries++
    const queue = this.retryQueues.get(queueId)!
    queue.push(task)
    
    // Calculate retry delay
    const delay = this.calculateDelay(task.retries, this.defaultRetryPolicy)
    
    await auditService.log({
      action: 'task.retry.scheduled',
      resourceId: task.id,
      resourceType: 'task',
      userId: 'system',
      details: {
        attempt: task.retries,
        delay,
        error: error.message
      }
    })
    
    // Schedule retry
    setTimeout(() => {
      this.processRetryQueue(queueId)
    }, delay)
  }

  private async processRetryQueue(queueId: string): Promise<void> {
    const queue = this.retryQueues.get(queueId)
    if (!queue || queue.length === 0) return
    
    const task = queue.shift()
    if (!task) return
    
    // Broadcast retry event
    websocketService.broadcast({
      type: 'task:retry',
      data: {
        taskId: task.id,
        attempt: task.retries,
        queueLength: queue.length
      }
    })
  }

  private calculateDelay(attempt: number, policy: RetryPolicy): number {
    let delay = policy.initialDelay * Math.pow(policy.backoffMultiplier, attempt)
    delay = Math.min(delay, policy.maxDelay)
    
    if (policy.jitter) {
      // Add random jitter (±25%)
      const jitter = delay * 0.25 * (Math.random() * 2 - 1)
      delay += jitter
    }
    
    return Math.round(delay)
  }

  private getCircuitBreakerState(circuitId: string): CircuitBreakerState {
    if (!this.circuitBreakers.has(circuitId)) {
      this.circuitBreakers.set(circuitId, {
        status: 'closed',
        failures: 0,
        successCount: 0
      })
    }
    
    return this.circuitBreakers.get(circuitId)!
  }

  private getFailoverState(failoverId: string, endpoints: string[]): FailoverState {
    if (!this.failoverStates.has(failoverId)) {
      this.failoverStates.set(failoverId, {
        primaryEndpoint: endpoints[0],
        backupEndpoints: endpoints.slice(1),
        currentEndpoint: endpoints[0],
        failureCount: new Map(),
        lastHealthCheck: new Map()
      })
    }
    
    return this.failoverStates.get(failoverId)!
  }

  private async getHealthyEndpoints(
    state: FailoverState,
    healthCheck?: (endpoint: string) => Promise<boolean>
  ): Promise<string[]> {
    const allEndpoints = [state.primaryEndpoint, ...state.backupEndpoints]
    const healthyEndpoints: string[] = []
    
    for (const endpoint of allEndpoints) {
      const lastCheck = state.lastHealthCheck.get(endpoint) || 0
      const timeSinceCheck = Date.now() - lastCheck
      
      // Check health if not checked recently
      if (timeSinceCheck > 30000) {
        let isHealthy = true
        
        if (healthCheck) {
          try {
            isHealthy = await healthCheck(endpoint)
          } catch {
            isHealthy = false
          }
        } else {
          // Default: consider unhealthy if too many failures
          const failures = state.failureCount.get(endpoint) || 0
          isHealthy = failures < 5
        }
        
        state.lastHealthCheck.set(endpoint, Date.now())
        
        if (isHealthy) {
          healthyEndpoints.push(endpoint)
        }
      } else {
        // Use cached health status
        const failures = state.failureCount.get(endpoint) || 0
        if (failures < 5) {
          healthyEndpoints.push(endpoint)
        }
      }
    }
    
    return healthyEndpoints
  }

  private recordSuccess(operationId: string): void {
    const state = this.circuitBreakers.get(operationId)
    if (state && state.status === 'closed') {
      state.failures = 0
    }
  }

  private recordFailure(operationId: string, error: Error): void {
    // Record failure metrics
    monitoringService.recordMetric({
      name: 'operation.failure',
      value: 1,
      tags: {
        operation: operationId,
        error: error.message
      }
    })
  }

  private async logRetryAttempt(operationId: string, attempt: number, delay: number, error: Error): Promise<void> {
    await auditService.log({
      action: 'operation.retry',
      resourceId: operationId,
      resource: 'operation',
      userId: 'system',
      details: {
        attempt,
        delay,
        error: error.message
      }
    })
  }

  private async logCircuitBreakerOpen(circuitId: string, state: CircuitBreakerState): Promise<void> {
    await auditService.log({
      action: 'circuit.breaker.open',
      resourceId: circuitId,
      resourceType: 'circuit_breaker',
      userId: 'system',
      details: {
        failures: state.failures,
        lastFailureTime: state.lastFailureTime,
        nextAttemptTime: state.nextAttemptTime
      }
    })
    
    websocketService.broadcast({
      type: 'circuit:breaker:open',
      data: {
        circuitId,
        state
      }
    })
  }

  private async logFailoverAttempt(failoverId: string, endpoint: string, error: Error): Promise<void> {
    await auditService.log({
      action: 'failover.attempt',
      resourceId: failoverId,
      resourceType: 'failover',
      userId: 'system',
      details: {
        endpoint,
        error: error.message
      }
    })
  }

  private async logBulkheadTimeout(bulkheadId: string): Promise<void> {
    await auditService.log({
      action: 'bulkhead.timeout',
      resourceId: bulkheadId,
      resourceType: 'bulkhead',
      userId: 'system'
    })
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Get current state for monitoring
  getCircuitBreakerStates(): Map<string, CircuitBreakerState> {
    return new Map(this.circuitBreakers)
  }

  getFailoverStates(): Map<string, FailoverState> {
    return new Map(this.failoverStates)
  }

  getRetryQueueSizes(): Map<string, number> {
    const sizes = new Map<string, number>()
    this.retryQueues.forEach((queue, id) => {
      sizes.set(id, queue.length)
    })
    return sizes
  }

  // Reset circuit breaker
  resetCircuitBreaker(circuitId: string): void {
    const state = this.circuitBreakers.get(circuitId)
    if (state) {
      state.status = 'closed'
      state.failures = 0
      state.successCount = 0
      state.lastFailureTime = undefined
      state.nextAttemptTime = undefined
    }
  }

  // Clear retry queue
  clearRetryQueue(queueId: string): void {
    this.retryQueues.delete(queueId)
  }
}

export const faultToleranceService = new FaultToleranceService()