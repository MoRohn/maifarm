/**
 * Python Orchestrator Proxy Service
 * Proxies agent operations to the high-quality Python FastAPI orchestrator
 */

import axios, { AxiosInstance } from 'axios';
import { logger, LogCategory } from '../utils/logger';
import { EventEmitter } from 'events';

interface AgentRunRequest {
  sessionId: string;
  prompt: string;
  agentId?: string;
  systemPrompt?: string;
  profileId?: string;
  tools?: any[];
  files?: string[];
  metadata?: Record<string, any>;
  tmuxPaneId?: string;
}

interface AgentRunResponse {
  run_id: string;
  session_id: string;
  status: string;
}

interface ActiveAgent {
  run_id: string;
  agent_id: string;
  session_id: string;
  phase: string;
  pane_id: string | null;
  tokens_in: number;
  tokens_out: number;
  started_at: string;
  last_delta_ts: string;
  idle_seconds: number;
}

class PythonOrchestratorProxy extends EventEmitter {
  private static instance: PythonOrchestratorProxy;
  private client: AxiosInstance;
  private baseUrl: string;
  private isAvailable: boolean = false;
  private enabled: boolean = false;

  private constructor() {
    super();
    // Check if Python orchestrator proxy is enabled (optional service)
    this.enabled = process.env.ENABLE_PYTHON_ORCHESTRATOR_PROXY === 'true';
    this.baseUrl = process.env.PYTHON_ORCHESTRATOR_URL || 'http://127.0.0.1:8000';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Check availability on startup only if enabled
    if (this.enabled) {
      this.checkAvailability();
    }
  }

  static getInstance(): PythonOrchestratorProxy {
    if (!PythonOrchestratorProxy.instance) {
      PythonOrchestratorProxy.instance = new PythonOrchestratorProxy();
    }
    return PythonOrchestratorProxy.instance;
  }

  private async checkAvailability(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const response = await this.client.get('/healthz', { timeout: 2000 });
      this.isAvailable = response.status === 200;
      if (this.isAvailable) {
        logger.info(LogCategory.FARM, 'Python orchestrator is available', { url: this.baseUrl });
        this.emit('available');
      }
    } catch (error) {
      this.isAvailable = false;
      // Log as debug instead of warn since this is an optional service
      logger.debug(LogCategory.FARM, 'Python orchestrator not available (optional service)', {
        url: this.baseUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
        note: 'Set ENABLE_PYTHON_ORCHESTRATOR_PROXY=true to enable'
      });
    }
  }

  async runAgent(request: AgentRunRequest): Promise<AgentRunResponse | null> {
    if (!this.enabled) {
      logger.debug(LogCategory.FARM, 'Python orchestrator proxy is disabled');
      return null;
    }

    if (!this.isAvailable) {
      await this.checkAvailability();
      if (!this.isAvailable) {
        logger.error(LogCategory.FARM, 'Cannot run agent: Python orchestrator not available');
        return null;
      }
    }

    try {
      const payload = {
        session_id: request.sessionId,
        prompt: request.prompt,
        agent_id: request.agentId,
        system: request.systemPrompt,
        profile_id: request.profileId,
        tools: request.tools || [],
        files: request.files || [],
        metadata: request.metadata || {},
        tmux_pane_id: request.tmuxPaneId,
      };

      logger.info(LogCategory.FARM, 'Proxying agent run to Python orchestrator', {
        sessionId: request.sessionId,
        agentId: request.agentId,
      });

      const response = await this.client.post<AgentRunResponse>('/agents/run', payload);

      logger.info(LogCategory.FARM, 'Agent run started via Python orchestrator', {
        runId: response.data.run_id,
        status: response.data.status,
      });

      return response.data;
    } catch (error) {
      logger.error(LogCategory.FARM, 'Failed to run agent via Python orchestrator', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  async cancelRun(runId: string): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      await this.client.post(`/agents/cancel/${runId}`);
      logger.info(LogCategory.FARM, 'Agent run cancelled', { runId });
      return true;
    } catch (error) {
      logger.error(LogCategory.FARM, 'Failed to cancel agent run', {
        runId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  async getActiveAgents(): Promise<ActiveAgent[]> {
    if (!this.isAvailable) {
      await this.checkAvailability();
      if (!this.isAvailable) {
        return [];
      }
    }

    try {
      const response = await this.client.get<{ active_agents: ActiveAgent[]; count: number }>('/monitor/active');
      return response.data.active_agents || [];
    } catch (error) {
      logger.error(LogCategory.FARM, 'Failed to get active agents', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  async getRunStatus(runId: string): Promise<any | null> {
    if (!this.isAvailable) {
      return null;
    }

    try {
      const response = await this.client.get(`/agents/runs/${runId}`);
      return response.data;
    } catch (error) {
      logger.error(LogCategory.FARM, 'Failed to get run status', {
        runId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  isOrchestratorAvailable(): boolean {
    return this.isAvailable;
  }
}

export const pythonOrchestratorProxy = PythonOrchestratorProxy.getInstance();
