import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

interface ClaudeCodeAgent {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'busy';
  currentTask?: string;
  capabilities: string[];
  lastUpdated: Date;
}

interface CoordinationTask {
  id: string;
  type: string;
  description: string;
  farmId: string;
  assignedTo?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: any;
  createdAt: Date;
  updatedAt: Date;
}

class ClaudeCodeCoordinator extends EventEmitter {
  private static instance: ClaudeCodeCoordinator;
  private readonly COORDINATION_DIR = '/tmp/claude_coordination';
  private readonly ACTIVE_AGENTS_FILE = path.join(this.COORDINATION_DIR, 'active_agents.json');
  private readonly TASKS_DIR = path.join(this.COORDINATION_DIR, 'tasks');
  private fileWatcher: any;
  private agents: Map<string, ClaudeCodeAgent> = new Map();
  private tasks: Map<string, CoordinationTask> = new Map();

  private constructor() {
    super();
    this.initializeCoordination();
  }

  static getInstance(): ClaudeCodeCoordinator {
    if (!ClaudeCodeCoordinator.instance) {
      ClaudeCodeCoordinator.instance = new ClaudeCodeCoordinator();
    }
    return ClaudeCodeCoordinator.instance;
  }

  private initializeCoordination() {
    // Ensure coordination directories exist
    if (!fs.existsSync(this.COORDINATION_DIR)) {
      fs.mkdirSync(this.COORDINATION_DIR, { recursive: true });
    }
    if (!fs.existsSync(this.TASKS_DIR)) {
      fs.mkdirSync(this.TASKS_DIR, { recursive: true });
    }

    // Watch for agent updates
    this.watchAgentUpdates();
    
    // Initial load of active agents
    this.loadActiveAgents();

    logger.info('Claude Code Coordinator initialized');
  }

  private watchAgentUpdates() {
    try {
      // Watch for changes to active agents file
      if (fs.existsSync(this.ACTIVE_AGENTS_FILE)) {
        fs.watchFile(this.ACTIVE_AGENTS_FILE, (curr, prev) => {
          if (curr.mtime !== prev.mtime) {
            this.loadActiveAgents();
          }
        });
      }

      // Watch tasks directory
      fs.watch(this.TASKS_DIR, (eventType, filename) => {
        if (filename && filename.endsWith('.json')) {
          this.loadTask(filename);
        }
      });
    } catch (error) {
      logger.error('Error setting up file watchers:', error);
    }
  }

  private loadActiveAgents() {
    try {
      if (fs.existsSync(this.ACTIVE_AGENTS_FILE)) {
        const data = fs.readFileSync(this.ACTIVE_AGENTS_FILE, 'utf8');
        const agentsData = JSON.parse(data);
        
        // Update agents map
        this.agents.clear();
        for (const agent of agentsData.agents || []) {
          this.agents.set(agent.id, {
            ...agent,
            lastUpdated: new Date(agent.lastUpdated || Date.now())
          });
        }

        this.emit('agents:updated', Array.from(this.agents.values()));
        logger.info(`Loaded ${this.agents.size} Claude Code agents`);
      }
    } catch (error) {
      logger.error('Error loading active agents:', error);
    }
  }

  private loadTask(filename: string) {
    try {
      const taskPath = path.join(this.TASKS_DIR, filename);
      if (fs.existsSync(taskPath)) {
        const data = fs.readFileSync(taskPath, 'utf8');
        const task = JSON.parse(data);
        
        this.tasks.set(task.id, {
          ...task,
          createdAt: new Date(task.createdAt),
          updatedAt: new Date(task.updatedAt)
        });

        this.emit('task:updated', task);
      }
    } catch (error) {
      logger.error(`Error loading task ${filename}:`, error);
    }
  }

  async createExplorationTask(farmId: string, taskType: string, description: string, config: any): Promise<CoordinationTask> {
    const task: CoordinationTask = {
      id: uuidv4(),
      type: taskType,
      description,
      farmId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Find available agent
    const availableAgent = this.findAvailableAgent(taskType);
    if (availableAgent) {
      task.assignedTo = availableAgent.id;
      task.status = 'in_progress';
    }

    // Save task to file system for coordination
    this.saveTask(task);

    // Store in memory
    this.tasks.set(task.id, task);

    this.emit('task:created', task);
    
    return task;
  }

  private findAvailableAgent(taskType: string): ClaudeCodeAgent | null {
    // Find agents that are active and not busy
    const availableAgents = Array.from(this.agents.values()).filter(agent => 
      agent.status === 'active' && 
      (!agent.currentTask || agent.currentTask === '') &&
      this.agentCanHandleTask(agent, taskType)
    );

    if (availableAgents.length === 0) {
      return null;
    }

    // Return random available agent for load balancing
    return availableAgents[Math.floor(Math.random() * availableAgents.length)];
  }

  private agentCanHandleTask(agent: ClaudeCodeAgent, taskType: string): boolean {
    // Check if agent has capabilities for the task type
    const taskCapabilityMap: { [key: string]: string[] } = {
      'analysis': ['code-analysis', 'pattern-detection', 'general'],
      'optimization': ['performance', 'refactoring', 'general'],
      'security': ['security-audit', 'vulnerability-scan', 'general'],
      'testing': ['test-generation', 'test-coverage', 'general'],
      'documentation': ['doc-generation', 'api-docs', 'general'],
      'integration': ['api-integration', 'system-design', 'general']
    };

    const requiredCapabilities = taskCapabilityMap[taskType] || ['general'];
    return requiredCapabilities.some(cap => 
      agent.capabilities.includes(cap) || agent.capabilities.includes('general')
    );
  }

  private saveTask(task: CoordinationTask) {
    try {
      const taskPath = path.join(this.TASKS_DIR, `${task.id}.json`);
      fs.writeFileSync(taskPath, JSON.stringify(task, null, 2));
    } catch (error) {
      logger.error('Error saving task:', error);
    }
  }

  async updateTaskStatus(taskId: string, status: CoordinationTask['status'], result?: any) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = status;
    task.updatedAt = new Date();
    if (result) {
      task.result = result;
    }

    this.saveTask(task);
    this.emit('task:statusChanged', task);
  }

  getActiveAgents(): ClaudeCodeAgent[] {
    return Array.from(this.agents.values());
  }

  getAgentsByFarm(farmId: string): ClaudeCodeAgent[] {
    // In a real implementation, this would track which agents are assigned to which farms
    // For now, return all active agents
    return Array.from(this.agents.values()).filter(agent => agent.status === 'active');
  }

  async waitForTaskCompletion(taskId: string, timeout: number = 30000): Promise<CoordinationTask> {
    return new Promise((resolve, reject) => {
      const task = this.tasks.get(taskId);
      if (!task) {
        reject(new Error('Task not found'));
        return;
      }

      if (task.status === 'completed' || task.status === 'failed') {
        resolve(task);
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error('Task timeout'));
      }, timeout);

      const checkStatus = () => {
        const currentTask = this.tasks.get(taskId);
        if (currentTask && (currentTask.status === 'completed' || currentTask.status === 'failed')) {
          clearTimeout(timer);
          this.removeListener('task:statusChanged', checkStatus);
          resolve(currentTask);
        }
      };

      this.on('task:statusChanged', checkStatus);
    });
  }

  // Mock method for testing - simulates Claude Code agent responses
  simulateAgentResponse(taskId: string, delay: number = 2000) {
    setTimeout(() => {
      const task = this.tasks.get(taskId);
      if (task && task.status === 'in_progress') {
        const success = Math.random() > 0.1; // 90% success rate
        this.updateTaskStatus(taskId, success ? 'completed' : 'failed', {
          success,
          message: success ? 'Task completed successfully' : 'Task failed',
          discoveries: success ? Math.floor(Math.random() * 3) : 0
        });
      }
    }, delay);
  }
}

export const claudeCodeCoordinator = ClaudeCodeCoordinator.getInstance();