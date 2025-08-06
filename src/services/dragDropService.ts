import { Farm, Agent } from '../types';

export class DragDropService {
  private static instance: DragDropService;

  private constructor() {}

  public static getInstance(): DragDropService {
    if (!DragDropService.instance) {
      DragDropService.instance = new DragDropService();
    }
    return DragDropService.instance;
  }

  public reorderFarms<T extends { id: string }>(farms: T[], startIndex: number, endIndex: number): T[] {
    const result = Array.from(farms);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    return result;
  }

  public reorderAgents(agents: Agent[], startIndex: number, endIndex: number): Agent[] {
    const result = Array.from(agents);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    return result;
  }

  public moveAgentBetweenFarms(
    sourceFarm: Farm,
    destinationFarm: Farm,
    agentId: string,
    destinationIndex: number
  ): { updatedSource: Farm; updatedDestination: Farm } {
    const sourceAgents = [...sourceFarm.agents];
    const destAgents = [...destinationFarm.agents];
    
    const agentIndex = sourceAgents.findIndex(a => a.id === agentId);
    if (agentIndex === -1) {
      throw new Error(`Agent ${agentId} not found in source farm`);
    }
    
    const [agent] = sourceAgents.splice(agentIndex, 1);
    destAgents.splice(destinationIndex, 0, agent);
    
    return {
      updatedSource: {
        ...sourceFarm,
        agents: sourceAgents,
      },
      updatedDestination: {
        ...destinationFarm,
        agents: destAgents,
      },
    };
  }

  public canDropAgent(
    agent: Agent,
    targetFarm: Farm,
    maxAgentsPerFarm: number = 10
  ): { canDrop: boolean; reason?: string } {
    if (targetFarm.agents.length >= maxAgentsPerFarm) {
      return { canDrop: false, reason: `Farm already has maximum ${maxAgentsPerFarm} agents` };
    }

    if (targetFarm.status === 'completed' || targetFarm.status === 'failed') {
      return { canDrop: false, reason: 'Cannot add agents to completed or failed farms' };
    }

    if (agent.status === 'error') {
      return { canDrop: false, reason: 'Cannot move agents in error state' };
    }

    return { canDrop: true };
  }

  public generateDropPreview(itemType: 'farm' | 'agent'): HTMLElement {
    const preview = document.createElement('div');
    preview.className = 'drag-preview';
    preview.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 9999;
      background: rgba(99, 102, 241, 0.1);
      border: 2px dashed rgb(99, 102, 241);
      border-radius: 12px;
      padding: 16px;
      backdrop-filter: blur(8px);
    `;
    
    const icon = document.createElement('div');
    icon.style.cssText = `
      width: 48px;
      height: 48px;
      background: rgb(99, 102, 241);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      margin: 0 auto;
    `;
    icon.textContent = itemType === 'farm' ? '🌾' : '🤖';
    
    const label = document.createElement('div');
    label.style.cssText = `
      margin-top: 8px;
      color: rgb(99, 102, 241);
      font-size: 14px;
      font-weight: 500;
      text-align: center;
    `;
    label.textContent = `Moving ${itemType}...`;
    
    preview.appendChild(icon);
    preview.appendChild(label);
    
    return preview;
  }
}

export const dragDropService = DragDropService.getInstance();