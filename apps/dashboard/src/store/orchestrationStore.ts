import { create } from 'zustand';
import { Farm, Agent } from '@/types';
import { FarmTemplate, Workflow, FarmSetupProgress, OrchestrationEvent } from '@/types/orchestration';
import { WorkflowExecution } from '@/types/workflow';

interface OrchestrationState {
  farms: Farm[];
  agents: Agent[];
  templates: FarmTemplate[];
  workflows: Workflow[];
  activeExecutions: WorkflowExecution[];
  selectedFarmId: string | null;
  selectedWorkflowId: string | null;
  setupProgress: FarmSetupProgress | null;
  orchestrationEvents: OrchestrationEvent[];
  
  // Actions
  setFarms: (farms: Farm[]) => void;
  addFarm: (farm: Farm) => void;
  updateFarm: (farmId: string, updates: Partial<Farm>) => void;
  removeFarm: (farmId: string) => void;
  
  setAgents: (agents: Agent[]) => void;
  addAgent: (agent: Agent) => void;
  removeAgent: (agentId: string) => void;
  
  setTemplates: (templates: FarmTemplate[]) => void;
  
  setWorkflows: (workflows: Workflow[]) => void;
  addWorkflow: (workflow: Workflow) => void;
  updateWorkflow: (workflowId: string, updates: Partial<Workflow>) => void;
  removeWorkflow: (workflowId: string) => void;
  
  setActiveExecutions: (executions: WorkflowExecution[]) => void;
  addExecution: (execution: WorkflowExecution) => void;
  updateExecution: (executionId: string, updates: Partial<WorkflowExecution>) => void;
  addWorkflowExecution: (execution: WorkflowExecution) => void;
  updateWorkflowExecution: (executionId: string, updates: Partial<WorkflowExecution>) => void;
  
  setSelectedFarmId: (farmId: string | null) => void;
  setSelectedWorkflowId: (workflowId: string | null) => void;
  
  updateAgent: (farmId: string, agentId: string, updates: Partial<Agent>) => void;
  
  setSetupProgress: (progress: FarmSetupProgress | null) => void;
  addOrchestrationEvent: (event: OrchestrationEvent) => void;
  
  getFarmWorkflows: (farmId: string) => Workflow[];
  
  // Selectors
  getSelectedFarm: () => Farm | undefined;
  getSelectedWorkflow: () => Workflow | undefined;
  getFarmAgents: (farmId: string) => Agent[];
  getActiveExecutionsForFarm: (farmId: string) => WorkflowExecution[];
}

export const useOrchestrationStore = create<OrchestrationState>((set, get) => ({
  farms: [],
  agents: [],
  templates: [],
  workflows: [],
  activeExecutions: [],
  selectedFarmId: null,
  selectedWorkflowId: null,
  setupProgress: null,
  orchestrationEvents: [],
  
  setFarms: (farms) => set({ farms }),
  
  addFarm: (farm) => set((state) => ({
    farms: [...state.farms, farm]
  })),
  
  updateFarm: (farmId, updates) => set((state) => ({
    farms: state.farms.map(farm => 
      farm.id === farmId ? { ...farm, ...updates } : farm
    )
  })),
  
  removeFarm: (farmId) => set((state) => ({
    farms: state.farms.filter(farm => farm.id !== farmId),
    selectedFarmId: state.selectedFarmId === farmId ? null : state.selectedFarmId
  })),
  
  setAgents: (agents) => set({ agents }),
  
  addAgent: (agent) => set((state) => ({
    agents: [...state.agents, agent]
  })),
  
  removeAgent: (agentId) => set((state) => ({
    agents: state.agents.filter(agent => agent.id !== agentId)
  })),
  
  setTemplates: (templates) => set({ templates }),
  
  setWorkflows: (workflows) => set({ workflows }),
  
  addWorkflow: (workflow) => set((state) => ({
    workflows: [...state.workflows, workflow]
  })),
  
  updateWorkflow: (workflowId, updates) => set((state) => ({
    workflows: state.workflows.map(workflow => 
      workflow.id === workflowId ? { ...workflow, ...updates } : workflow
    )
  })),
  
  removeWorkflow: (workflowId) => set((state) => ({
    workflows: state.workflows.filter(workflow => workflow.id !== workflowId),
    selectedWorkflowId: state.selectedWorkflowId === workflowId ? null : state.selectedWorkflowId
  })),
  
  setActiveExecutions: (executions) => set({ activeExecutions: executions }),
  
  addExecution: (execution) => set((state) => ({
    activeExecutions: [...state.activeExecutions, execution]
  })),
  
  updateExecution: (executionId, updates) => set((state) => ({
    activeExecutions: state.activeExecutions.map(execution => 
      execution.id === executionId ? { ...execution, ...updates } : execution
    )
  })),
  
  addWorkflowExecution: (execution) => set((state) => ({
    activeExecutions: [...state.activeExecutions, execution]
  })),
  
  updateWorkflowExecution: (executionId, updates) => set((state) => ({
    activeExecutions: state.activeExecutions.map(execution => 
      execution.id === executionId ? { ...execution, ...updates } : execution
    )
  })),
  
  setSelectedFarmId: (farmId) => set({ selectedFarmId: farmId }),
  
  setSelectedWorkflowId: (workflowId) => set({ selectedWorkflowId: workflowId }),
  
  setSetupProgress: (progress) => set({ setupProgress: progress }),
  
  addOrchestrationEvent: (event) => set((state) => ({
    orchestrationEvents: [...state.orchestrationEvents, event]
  })),
  
  updateAgent: (farmId, agentId, updates) => set((state) => ({
    farms: state.farms.map(farm => {
      if (farm.id === farmId) {
        return {
          ...farm,
          agents: farm.agents.map(agent => 
            agent.id === agentId ? { ...agent, ...updates } : agent
          )
        };
      }
      return farm;
    })
  })),
  
  getSelectedFarm: () => {
    const state = get();
    return state.farms.find(farm => farm.id === state.selectedFarmId);
  },
  
  getSelectedWorkflow: () => {
    const state = get();
    return state.workflows.find(workflow => workflow.id === state.selectedWorkflowId);
  },
  
  getFarmAgents: (farmId) => {
    const state = get();
    const farm = state.farms.find(f => f.id === farmId);
    return farm ? farm.agents : [];
  },
  
  getFarmWorkflows: (farmId) => {
    const state = get();
    return state.workflows.filter(workflow => workflow.farmId === farmId);
  },
  
  getActiveExecutionsForFarm: (farmId) => {
    const state = get();
    const farm = state.farms.find(f => f.id === farmId);
    if (!farm) return [];
    
    const workflowIds = farm.workflows ? farm.workflows.map(w => w.id) : [];
    return state.activeExecutions.filter(execution => 
      workflowIds.includes(execution.workflowId)
    );
  }
}));