import { useEffect, useCallback } from 'react'
import { useOrchestrationStore } from '@/store/orchestrationStore'
import { useWebSocketStore } from '@/store/websocketStore'
import { farmOrchestrator } from '@/services/orchestration/farmOrchestrator'
import { agentLifecycleManager } from '@/services/orchestration/agentLifecycleManager'
import { workflowEngine } from '@/services/orchestration/workflowEngine'
import {
  Farm,
  FarmSetupRequest,
  Agent,
  Workflow,
  WorkflowExecution,
  OrchestrationEvent
} from '@/types/orchestration'
import toast from 'react-hot-toast'

export const useOrchestration = () => {
  const {
    farms,
    agents,
    workflows,
    selectedFarmId,
    setFarms,
    setAgents,
    setWorkflows,
    addFarm,
    updateFarm,
    removeFarm,
    addAgent,
    updateAgent,
    removeAgent,
    addWorkflow,
    updateWorkflow,
    removeWorkflow,
    addWorkflowExecution,
    updateWorkflowExecution,
    addOrchestrationEvent,
    getSelectedFarm,
    getFarmAgents,
    getFarmWorkflows
  } = useOrchestrationStore()

  const { lastMessage } = useWebSocketStore()

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return

    switch (lastMessage.type) {
      case 'farm:setup:progress':
        useOrchestrationStore.getState().setSetupProgress(lastMessage.data)
        break

      case 'farm:updated':
        updateFarm(lastMessage.data.id, lastMessage.data)
        break

      case 'farm:deleted':
        removeFarm(lastMessage.data.farmId)
        break

      case 'agent:lifecycle:change':
        const agent = lastMessage.data as Agent
        const existingAgent = agents.find(a => a.id === agent.id)
        if (existingAgent) {
          updateAgent(agent.id, agent)
        } else {
          addAgent(agent)
        }
        break

      case 'agent:terminated':
        removeAgent(lastMessage.data.agentId)
        break

      case 'workflow:status:update':
        const execution = lastMessage.data as WorkflowExecution
        updateWorkflowExecution(execution.id, execution)
        break

      case 'orchestration:error':
        toast.error(`Orchestration error: ${lastMessage.data.message}`)
        break

      default:
        // Add as orchestration event
        if (lastMessage.type.startsWith('farm:') || 
            lastMessage.type.startsWith('agent:') || 
            lastMessage.type.startsWith('workflow:')) {
          const event: OrchestrationEvent = {
            id: Date.now().toString(),
            type: lastMessage.type,
            source: 'websocket',
            timestamp: new Date().toISOString(),
            data: lastMessage.data
          }
          addOrchestrationEvent(event)
        }
    }
  }, [lastMessage])

  // Load initial data
  useEffect(() => {
    loadFarms()
    loadWorkflows()
  }, [])

  const loadFarms = useCallback(async () => {
    try {
      const allFarms = farmOrchestrator.getAllFarms()
      setFarms(allFarms)
      
      // Load agents for all farms
      const allAgents = agentLifecycleManager.getAllAgents()
      setAgents(allAgents)
    } catch (error) {
      console.error('Failed to load farms:', error)
      toast.error('Failed to load farms')
    }
  }, [setFarms, setAgents])

  const loadWorkflows = useCallback(async () => {
    try {
      const allWorkflows = workflowEngine.getAllWorkflows()
      setWorkflows(allWorkflows)
    } catch (error) {
      console.error('Failed to load workflows:', error)
      toast.error('Failed to load workflows')
    }
  }, [setWorkflows])

  // Farm operations
  const createFarm = useCallback(async (request: FarmSetupRequest): Promise<Farm> => {
    try {
      const farm = await farmOrchestrator.setupFarm(request)
      addFarm(farm)
      return farm
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to create farm: ${message}`)
      throw error
    }
  }, [addFarm])

  const startFarm = useCallback(async (farmId: string): Promise<void> => {
    try {
      const farm = await farmOrchestrator.startFarm(farmId)
      updateFarm(farmId, farm)
      toast.success('Farm started successfully')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to start farm: ${message}`)
      throw error
    }
  }, [updateFarm])

  const stopFarm = useCallback(async (farmId: string): Promise<void> => {
    try {
      const farm = await farmOrchestrator.stopFarm(farmId)
      updateFarm(farmId, farm)
      toast.success('Farm stopped successfully')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to stop farm: ${message}`)
      throw error
    }
  }, [updateFarm])

  const deleteFarm = useCallback(async (farmId: string): Promise<void> => {
    try {
      await farmOrchestrator.deleteFarm(farmId)
      removeFarm(farmId)
      toast.success('Farm deleted successfully')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to delete farm: ${message}`)
      throw error
    }
  }, [removeFarm])

  // Agent operations
  const scaleAgents = useCallback(async (farmId: string, targetCount: number): Promise<void> => {
    try {
      const scaledAgents = await agentLifecycleManager.scaleAgents(farmId, targetCount)
      
      // Update store with new agent list
      const otherAgents = agents.filter(a => a.farmId !== farmId)
      setAgents([...otherAgents, ...scaledAgents])
      
      toast.success(`Scaled agents to ${targetCount}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to scale agents: ${message}`)
      throw error
    }
  }, [agents, setAgents])

  const restartAgent = useCallback(async (agentId: string): Promise<void> => {
    try {
      await agentLifecycleManager.stopAgent(agentId)
      await new Promise(resolve => setTimeout(resolve, 2000))
      const agent = agents.find(a => a.id === agentId)
      if (agent && agent.farmId) {
        await agentLifecycleManager.startAgent(agentId, agent.farmId)
      }
      toast.success('Agent restarted successfully')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to restart agent: ${message}`)
      throw error
    }
  }, [])

  // Workflow operations
  const createWorkflow = useCallback(async (workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> => {
    try {
      const newWorkflow = await workflowEngine.createWorkflow(workflow)
      addWorkflow(newWorkflow)
      toast.success('Workflow created successfully')
      return newWorkflow
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to create workflow: ${message}`)
      throw error
    }
  }, [addWorkflow])

  const executeWorkflow = useCallback(async (workflowId: string, variables?: Record<string, any>): Promise<WorkflowExecution> => {
    try {
      const execution = await workflowEngine.executeWorkflow(workflowId, variables)
      addWorkflowExecution(execution)
      toast.success('Workflow execution started')
      return execution
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to execute workflow: ${message}`)
      throw error
    }
  }, [addWorkflowExecution])

  const pauseWorkflow = useCallback(async (workflowId: string): Promise<void> => {
    try {
      await workflowEngine.pauseWorkflow(workflowId)
      toast.success('Workflow paused')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to pause workflow: ${message}`)
      throw error
    }
  }, [])

  const resumeWorkflow = useCallback(async (workflowId: string): Promise<void> => {
    try {
      await workflowEngine.resumeWorkflow(workflowId)
      toast.success('Workflow resumed')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to resume workflow: ${message}`)
      throw error
    }
  }, [])

  const cancelWorkflow = useCallback(async (workflowId: string): Promise<void> => {
    try {
      await workflowEngine.cancelWorkflow(workflowId)
      toast.success('Workflow cancelled')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to cancel workflow: ${message}`)
      throw error
    }
  }, [])

  return {
    // State
    farms,
    agents,
    workflows,
    selectedFarmId,
    selectedFarm: getSelectedFarm(),
    
    // Computed
    getFarmAgents,
    getFarmWorkflows,
    
    // Farm operations
    createFarm,
    startFarm,
    stopFarm,
    deleteFarm,
    
    // Agent operations
    scaleAgents,
    restartAgent,
    
    // Workflow operations
    createWorkflow,
    executeWorkflow,
    pauseWorkflow,
    resumeWorkflow,
    cancelWorkflow,
    
    // Refresh
    refresh: loadFarms
  }
}