/**
 * Agent Messaging - Themed console output for multi-agent communication
 *
 * Provides consistent, themed messaging for agent activities
 * Matches the UI dashboard's agent messaging system
 */

import chalk from 'chalk';
import {
  getTheme,
  formatAgentMessage,
  createStatusBadge,
  createProgressBar,
  type CLITheme,
} from './themes.js';

export interface AgentInfo {
  id: number;
  name: string;
  status: 'idle' | 'active' | 'thinking' | 'executing' | 'completed' | 'failed';
  currentTask?: string;
  progress?: number;
  totalSteps?: number;
}

export class AgentMessenger {
  private theme: CLITheme;
  private themeName: string;

  constructor(themeName: string) {
    this.themeName = themeName;
    this.theme = getTheme(themeName);
  }

  /**
   * Update theme (useful for real-time theme switching)
   */
  setTheme(themeName: string) {
    this.themeName = themeName;
    this.theme = getTheme(themeName);
  }

  /**
   * Print agent startup message
   */
  agentStarted(agent: AgentInfo) {
    const message = formatAgentMessage(
      agent.id,
      agent.name,
      `🚀 Started and ready to work`,
      this.themeName
    );
    console.log(message);
  }

  /**
   * Print agent thinking message
   */
  agentThinking(agent: AgentInfo, thought: string) {
    const message = formatAgentMessage(
      agent.id,
      agent.name,
      `🤔 ${thought}`,
      this.themeName
    );
    console.log(message);
  }

  /**
   * Print agent executing message
   */
  agentExecuting(agent: AgentInfo, action: string) {
    const message = formatAgentMessage(
      agent.id,
      agent.name,
      `⚙️  ${action}`,
      this.themeName
    );
    console.log(message);
  }

  /**
   * Print agent completed message
   */
  agentCompleted(agent: AgentInfo, result: string) {
    const message = formatAgentMessage(
      agent.id,
      agent.name,
      `✅ ${result}`,
      this.themeName
    );
    console.log(message);
  }

  /**
   * Print agent error message
   */
  agentError(agent: AgentInfo, error: string) {
    const message = formatAgentMessage(
      agent.id,
      agent.name,
      `❌ ${error}`,
      this.themeName
    );
    console.log(message);
  }

  /**
   * Print agent warning message
   */
  agentWarning(agent: AgentInfo, warning: string) {
    const message = formatAgentMessage(
      agent.id,
      agent.name,
      `⚠️  ${warning}`,
      this.themeName
    );
    console.log(message);
  }

  /**
   * Print agent progress update
   */
  agentProgress(agent: AgentInfo) {
    if (!agent.progress || !agent.totalSteps) {
      return;
    }

    const progress = createProgressBar(
      agent.progress,
      agent.totalSteps,
      agent.name,
      this.themeName
    );
    console.log(`  ${progress}`);
  }

  /**
   * Print agent status badge
   */
  agentStatus(agent: AgentInfo) {
    const statusMap: Record<AgentInfo['status'], { type: 'success' | 'warning' | 'error' | 'info'; label: string }> = {
      idle: { type: 'info', label: 'IDLE' },
      active: { type: 'success', label: 'ACTIVE' },
      thinking: { type: 'info', label: 'THINKING' },
      executing: { type: 'warning', label: 'EXECUTING' },
      completed: { type: 'success', label: 'COMPLETED' },
      failed: { type: 'error', label: 'FAILED' },
    };

    const statusInfo = statusMap[agent.status];
    const badge = createStatusBadge(statusInfo.type, statusInfo.label, this.themeName);
    const agentKey = `agent${(agent.id % 8) + 1}` as keyof typeof this.theme.agentColors;
    const nameColored = this.theme.agentColors[agentKey].bold(agent.name);

    console.log(`  ${nameColored} ${badge}`);
  }

  /**
   * Print agent collaboration message
   */
  agentCollaboration(agent1: AgentInfo, agent2: AgentInfo, message: string) {
    const agent1Key = `agent${(agent1.id % 8) + 1}` as keyof typeof this.theme.agentColors;
    const agent2Key = `agent${(agent2.id % 8) + 1}` as keyof typeof this.theme.agentColors;

    const name1 = this.theme.agentColors[agent1Key].bold(agent1.name);
    const name2 = this.theme.agentColors[agent2Key].bold(agent2.name);
    const arrow = this.theme.colors.accent('⟶');
    const msgText = this.theme.colors.text(message);

    const timestamp = new Date().toLocaleTimeString();
    const timeStr = this.theme.colors.muted(`[${timestamp}]`);

    console.log(`${timeStr} ${name1} ${arrow} ${name2}: ${msgText}`);
  }

  /**
   * Print farm-wide announcement
   */
  farmAnnouncement(message: string, emoji: string = '📢') {
    const border = this.theme.colors.primary('═'.repeat(70));
    const content = this.theme.colors.accent.bold(`${emoji} ${message}`);

    console.log('');
    console.log(border);
    console.log(content);
    console.log(border);
    console.log('');
  }

  /**
   * Print multi-agent summary
   */
  multiAgentSummary(agents: AgentInfo[]) {
    console.log('');
    console.log(this.theme.colors.accent.bold('🚜 Farm Agent Status:'));
    console.log(this.theme.colors.muted('─'.repeat(70)));

    agents.forEach(agent => {
      this.agentStatus(agent);
      if (agent.currentTask) {
        const taskText = this.theme.colors.text(`  → ${agent.currentTask}`);
        console.log(taskText);
      }
      if (agent.progress && agent.totalSteps) {
        this.agentProgress(agent);
      }
    });

    console.log(this.theme.colors.muted('─'.repeat(70)));
    console.log('');
  }

  /**
   * Print agent activity stream
   */
  activityStream(agent: AgentInfo, activities: string[]) {
    console.log('');
    console.log(this.theme.colors.accent.bold(`📊 ${agent.name} Activity Stream:`));
    console.log(this.theme.colors.muted('─'.repeat(70)));

    activities.forEach((activity, index) => {
      const bullet = this.theme.colors.primary('●');
      const text = this.theme.colors.text(activity);
      const time = this.theme.colors.muted(`[${index + 1}]`);
      console.log(`  ${time} ${bullet} ${text}`);
    });

    console.log(this.theme.colors.muted('─'.repeat(70)));
    console.log('');
  }

  /**
   * Print real-time terminal output (themed)
   */
  terminalOutput(agent: AgentInfo, output: string) {
    const agentKey = `agent${(agent.id % 8) + 1}` as keyof typeof this.theme.agentColors;
    const nameColored = this.theme.agentColors[agentKey](`[${agent.name}]`);
    const outputLines = output.split('\n');

    outputLines.forEach(line => {
      if (line.trim()) {
        console.log(`${nameColored} ${this.theme.colors.text(line)}`);
      }
    });
  }

  /**
   * Print agent handoff (for workflows)
   */
  agentHandoff(fromAgent: AgentInfo, toAgent: AgentInfo, task: string) {
    const fromKey = `agent${(fromAgent.id % 8) + 1}` as keyof typeof this.theme.agentColors;
    const toKey = `agent${(toAgent.id % 8) + 1}` as keyof typeof this.theme.agentColors;

    const fromName = this.theme.agentColors[fromKey].bold(fromAgent.name);
    const toName = this.theme.agentColors[toKey].bold(toAgent.name);
    const arrow = this.theme.colors.accent.bold('➜');
    const taskText = this.theme.colors.text(task);

    console.log(`  ${fromName} ${arrow} ${toName}: ${this.theme.colors.muted('Handoff -')} ${taskText}`);
  }

  /**
   * Print harvest collection notification
   */
  harvestNotification(agent: AgentInfo, artifactCount: number, size: string) {
    const message = formatAgentMessage(
      agent.id,
      agent.name,
      `🌾 Harvest ready: ${artifactCount} artifacts (${size})`,
      this.themeName
    );
    console.log(message);
  }

  /**
   * Print debugging info (optional, for development)
   */
  debug(agent: AgentInfo, debugInfo: string) {
    const message = formatAgentMessage(
      agent.id,
      agent.name,
      `🐛 DEBUG: ${debugInfo}`,
      this.themeName
    );
    if (process.env.DEBUG === 'true') {
      console.log(this.theme.colors.muted(message));
    }
  }
}

// Singleton instance (can be updated with theme changes)
let messengerInstance: AgentMessenger | null = null;

export function getAgentMessenger(themeName?: string): AgentMessenger {
  if (!messengerInstance || (themeName && messengerInstance)) {
    messengerInstance = new AgentMessenger(themeName || 'forest-walk');
  }
  return messengerInstance;
}

export default AgentMessenger;
