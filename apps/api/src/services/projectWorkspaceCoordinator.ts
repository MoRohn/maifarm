/**
 * Project Workspace Coordinator
 * Implements XenoSync-style project-based workspace isolation for agents
 * Each agent works in isolated directories with git-based tracking
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { pathConfig } from '../config/paths';

const execAsync = promisify(exec);

interface AgentProject {
  agentId: number;
  projectPath: string;
  branch: string;
  status: 'initialized' | 'in_progress' | 'completed' | 'merged';
  filesCreated: number;
  commits: number;
  lastActivity: Date;
  startTime: Date;
  completionTime?: Date;
}

interface SessionStatus {
  sessionId: string;
  totalProjects: number;
  completedProjects: number;
  mergedProjects: number;
  agents: AgentProject[];
  filesModified: string[];
  conflicts: number;
  staleClaims: number;
}

interface WorkClaim {
  agentId: number;
  taskId: string;
  claimedAt: Date;
  status: 'active' | 'completed' | 'stale';
  lastUpdate: Date;
}

export class ProjectWorkspaceCoordinator extends EventEmitter {
  private sessionId: string = '';
  private numAgents: number = 0;
  private workspaceDir: string = '';
  private agentProjects: Map<number, AgentProject> = new Map();
  private workClaims: Map<string, WorkClaim> = new Map();
  private coordinationDir: string = '';
  private mergeCompleted: boolean = false;
  private projectQualityThreshold: number = 3; // Minimum files per project
  private projectSubstantialWorkThreshold: number = 500; // Minimum characters
  private minimumWorkDurationMinutes: number = 10;

  constructor() {
    super();
    const paths = pathConfig.getPaths();
    this.coordinationDir = path.join(paths.COORDINATION_DIR, 'projects');
  }

  /**
   * Initialize a new session with project workspaces
   */
  async initializeSession(sessionId: string, numAgents: number, workspaceDir?: string): Promise<void> {
    this.sessionId = sessionId;
    this.numAgents = numAgents;
    
    // Use provided workspace or create in maibarn
    const paths = pathConfig.getPaths();
    this.workspaceDir = workspaceDir || path.join(paths.FARM_WORKSPACES_ACTIVE, sessionId);
    
    logger.info(`[ProjectCoordinator] Initializing session ${sessionId} with ${numAgents} agents`);
    
    // Create workspace directory
    await fs.mkdir(this.workspaceDir, { recursive: true });
    
    // Create coordination directory for this session
    const sessionCoordDir = path.join(this.coordinationDir, sessionId);
    await fs.mkdir(sessionCoordDir, { recursive: true });
    
    // Initialize agent projects
    for (let i = 0; i < numAgents; i++) {
      await this.initializeAgentProject(i);
    }
    
    // Create session status file
    await this.updateSessionStatus();
    
    logger.info(`[ProjectCoordinator] Session initialized with workspace at ${this.workspaceDir}`);
  }

  /**
   * Initialize a project workspace for an agent
   */
  private async initializeAgentProject(agentId: number): Promise<void> {
    // Create agent project directory (XenoSync style: agent-N/project)
    const agentDir = path.join(this.workspaceDir, `agent-${agentId}`);
    const projectDir = path.join(agentDir, 'project');
    
    await fs.mkdir(projectDir, { recursive: true });
    
    // Initialize git repository for tracking
    try {
      await execAsync('git init', { cwd: projectDir });
      await execAsync('git config user.name "MaiFarm Agent"', { cwd: projectDir });
      await execAsync(`git config user.email "agent-${agentId}@maifarm.local"`, { cwd: projectDir });
      
      // Create initial commit
      const readmePath = path.join(projectDir, 'README.md');
      await fs.writeFile(readmePath, `# Agent ${agentId} Project\n\nWorkspace for Agent ${agentId} in session ${this.sessionId}\n`);
      await execAsync('git add .', { cwd: projectDir });
      await execAsync('git commit -m "Initial project setup"', { cwd: projectDir });
      
      logger.info(`[ProjectCoordinator] Initialized git repo for agent ${agentId} at ${projectDir}`);
    } catch (error) {
      logger.warn(`[ProjectCoordinator] Failed to initialize git for agent ${agentId}:`, error);
    }
    
    // Create agent project tracking
    const project: AgentProject = {
      agentId,
      projectPath: projectDir,
      branch: 'main',
      status: 'initialized',
      filesCreated: 1, // README
      commits: 1, // Initial commit
      lastActivity: new Date(),
      startTime: new Date()
    };
    
    this.agentProjects.set(agentId, project);
    
    // Create agent coordination file
    await this.updateAgentCoordinationFile(agentId, project);
  }

  /**
   * Get project path for an agent
   */
  getAgentProjectPath(agentId: number): string {
    const project = this.agentProjects.get(agentId);
    return project?.projectPath || path.join(this.workspaceDir, `agent-${agentId}`, 'project');
  }

  /**
   * Track agent progress in their project
   */
  async trackAgentProgress(agentId: number): Promise<any> {
    const project = this.agentProjects.get(agentId);
    if (!project) return null;
    
    try {
      // Count files in project (excluding .git)
      const files = await this.countProjectFiles(project.projectPath);
      project.filesCreated = files;
      
      // Count git commits
      const { stdout } = await execAsync('git rev-list --count HEAD', { cwd: project.projectPath });
      project.commits = parseInt(stdout.trim()) || 0;
      
      // Update last activity
      project.lastActivity = new Date();
      
      // Update status based on activity
      if (project.status === 'initialized' && files > 1) {
        project.status = 'in_progress';
      }
      
      // Update coordination file
      await this.updateAgentCoordinationFile(agentId, project);
      
      return {
        agentId,
        projectPath: project.projectPath,
        filesCreated: project.filesCreated,
        commits: project.commits,
        status: project.status,
        lastActivity: project.lastActivity
      };
    } catch (error) {
      logger.error(`[ProjectCoordinator] Error tracking progress for agent ${agentId}:`, error);
      return null;
    }
  }

  /**
   * Count files in a project directory (excluding .git)
   */
  private async countProjectFiles(projectPath: string): Promise<number> {
    let count = 0;
    
    async function countRecursive(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name === '.git') continue;
        
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await countRecursive(fullPath);
        } else if (entry.isFile()) {
          count++;
        }
      }
    }
    
    await countRecursive(projectPath);
    return count;
  }

  /**
   * Mark agent project as completed
   */
  async markAgentCompleted(agentId: number): Promise<void> {
    const project = this.agentProjects.get(agentId);
    if (!project) return;
    
    project.status = 'completed';
    project.completionTime = new Date();
    
    // Create completion marker
    const completionMarker = path.join(project.projectPath, '.completed');
    await fs.writeFile(completionMarker, JSON.stringify({
      agentId,
      completedAt: project.completionTime,
      files: project.filesCreated,
      commits: project.commits
    }, null, 2));
    
    await this.updateAgentCoordinationFile(agentId, project);
    await this.updateSessionStatus();
    
    logger.info(`[ProjectCoordinator] Agent ${agentId} project marked as completed`);
    
    // Check if all agents are complete and trigger merge
    await this.checkAndTriggerMerge();
  }

  /**
   * Check if all agents are complete and trigger merge
   */
  private async checkAndTriggerMerge(): Promise<void> {
    if (this.mergeCompleted) return;
    
    const allProjects = Array.from(this.agentProjects.values());
    const completedCount = allProjects.filter(p => p.status === 'completed').length;
    
    if (completedCount === this.numAgents) {
      logger.info('[ProjectCoordinator] All agents completed, triggering project merge');
      await this.mergeProjects();
    }
  }

  /**
   * Merge all agent projects into final project
   */
  async mergeProjects(): Promise<boolean> {
    if (this.mergeCompleted) {
      logger.info('[ProjectCoordinator] Projects already merged');
      return true;
    }
    
    const finalProjectPath = path.join(this.workspaceDir, 'final-project');
    
    try {
      // Create final project directory
      await fs.mkdir(finalProjectPath, { recursive: true });
      
      // Initialize git in final project
      await execAsync('git init', { cwd: finalProjectPath });
      await execAsync('git config user.name "MaiFarm Merger"', { cwd: finalProjectPath });
      await execAsync('git config user.email "merger@maifarm.local"', { cwd: finalProjectPath });
      
      // Copy files from each agent project
      for (const [agentId, project] of this.agentProjects) {
        if (project.status !== 'completed') continue;
        
        const agentSubdir = path.join(finalProjectPath, `agent-${agentId}-work`);
        await fs.mkdir(agentSubdir, { recursive: true });
        
        // Copy project files (excluding .git)
        await this.copyProjectFiles(project.projectPath, agentSubdir);
        
        project.status = 'merged';
      }
      
      // Create merge summary
      const summaryPath = path.join(finalProjectPath, 'MERGE_SUMMARY.md');
      await fs.writeFile(summaryPath, this.generateMergeSummary());
      
      // Commit merged project
      await execAsync('git add .', { cwd: finalProjectPath });
      await execAsync('git commit -m "Merged all agent projects"', { cwd: finalProjectPath });
      
      this.mergeCompleted = true;
      await this.updateSessionStatus();
      
      logger.info(`[ProjectCoordinator] Successfully merged projects to ${finalProjectPath}`);
      
      this.emit('projects:merged', {
        sessionId: this.sessionId,
        finalProjectPath,
        agentCount: this.numAgents
      });
      
      return true;
    } catch (error) {
      logger.error('[ProjectCoordinator] Failed to merge projects:', error);
      return false;
    }
  }

  /**
   * Copy project files excluding .git
   */
  private async copyProjectFiles(source: string, destination: string): Promise<void> {
    const entries = await fs.readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === '.completed') continue;
      
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);
      
      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await this.copyProjectFiles(sourcePath, destPath);
      } else if (entry.isFile()) {
        await fs.copyFile(sourcePath, destPath);
      }
    }
  }

  /**
   * Generate merge summary markdown
   */
  private generateMergeSummary(): string {
    const projects = Array.from(this.agentProjects.values());
    const totalFiles = projects.reduce((sum, p) => sum + p.filesCreated, 0);
    const totalCommits = projects.reduce((sum, p) => sum + p.commits, 0);
    
    let summary = `# Project Merge Summary\n\n`;
    summary += `**Session ID:** ${this.sessionId}\n`;
    summary += `**Agents:** ${this.numAgents}\n`;
    summary += `**Total Files:** ${totalFiles}\n`;
    summary += `**Total Commits:** ${totalCommits}\n`;
    summary += `**Merge Time:** ${new Date().toISOString()}\n\n`;
    
    summary += `## Agent Contributions\n\n`;
    for (const project of projects) {
      summary += `### Agent ${project.agentId}\n`;
      summary += `- Files: ${project.filesCreated}\n`;
      summary += `- Commits: ${project.commits}\n`;
      summary += `- Work Duration: ${this.formatDuration(project.startTime, project.completionTime || new Date())}\n`;
      summary += `- Status: ${project.status}\n\n`;
    }
    
    return summary;
  }

  /**
   * Format duration between two dates
   */
  private formatDuration(start: Date, end: Date): string {
    const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Check if agent has worked for minimum duration
   */
  hasMetMinimumWorkDuration(agentId: number): boolean {
    const project = this.agentProjects.get(agentId);
    if (!project) return false;
    
    const workDuration = (Date.now() - project.startTime.getTime()) / 1000 / 60; // minutes
    return workDuration >= this.minimumWorkDurationMinutes;
  }

  /**
   * Check project quality (files and content)
   */
  async checkProjectQuality(agentId: number): Promise<boolean> {
    const project = this.agentProjects.get(agentId);
    if (!project) return false;
    
    // Check file count
    if (project.filesCreated < this.projectQualityThreshold) {
      return false;
    }
    
    // Check content size
    try {
      const totalSize = await this.calculateProjectSize(project.projectPath);
      return totalSize >= this.projectSubstantialWorkThreshold;
    } catch (error) {
      logger.error(`[ProjectCoordinator] Error checking project quality for agent ${agentId}:`, error);
      return false;
    }
  }

  /**
   * Calculate total size of project files
   */
  private async calculateProjectSize(projectPath: string): Promise<number> {
    let totalSize = 0;
    
    async function calculateRecursive(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name === '.git') continue;
        
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await calculateRecursive(fullPath);
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
        }
      }
    }
    
    await calculateRecursive(projectPath);
    return totalSize;
  }

  /**
   * Update agent coordination file
   */
  private async updateAgentCoordinationFile(agentId: number, project: AgentProject): Promise<void> {
    const coordFile = path.join(this.coordinationDir, this.sessionId, `agent-${agentId}.json`);
    
    await fs.writeFile(coordFile, JSON.stringify({
      agentId,
      sessionId: this.sessionId,
      project: {
        path: project.projectPath,
        branch: project.branch,
        status: project.status,
        filesCreated: project.filesCreated,
        commits: project.commits,
        lastActivity: project.lastActivity,
        startTime: project.startTime,
        completionTime: project.completionTime
      },
      updated: new Date()
    }, null, 2));
  }

  /**
   * Update session status file
   */
  private async updateSessionStatus(): Promise<void> {
    const status = this.getSessionStatus();
    const statusFile = path.join(this.coordinationDir, this.sessionId, 'session.json');
    
    await fs.writeFile(statusFile, JSON.stringify(status, null, 2));
  }

  /**
   * Get current session status
   */
  getSessionStatus(): SessionStatus {
    const projects = Array.from(this.agentProjects.values());
    
    return {
      sessionId: this.sessionId,
      totalProjects: this.numAgents,
      completedProjects: projects.filter(p => p.status === 'completed').length,
      mergedProjects: projects.filter(p => p.status === 'merged').length,
      agents: projects.map(p => ({
        agentId: p.agentId,
        projectPath: p.projectPath,
        branch: p.branch,
        status: p.status,
        filesCreated: p.filesCreated,
        commits: p.commits,
        lastActivity: p.lastActivity,
        startTime: p.startTime,
        completionTime: p.completionTime
      })),
      filesModified: [], // Would need file watching to track this
      conflicts: 0, // No conflicts in isolated projects
      staleClaims: Array.from(this.workClaims.values()).filter(c => c.status === 'stale').length
    };
  }

  /**
   * Claim work for an agent (conflict-free)
   */
  async claimWork(agentId: number, taskId: string): Promise<boolean> {
    // Check if already claimed
    if (this.workClaims.has(taskId)) {
      const existing = this.workClaims.get(taskId)!;
      if (existing.status === 'active') {
        return false; // Already claimed by another agent
      }
    }
    
    // Create work claim
    const claim: WorkClaim = {
      agentId,
      taskId,
      claimedAt: new Date(),
      status: 'active',
      lastUpdate: new Date()
    };
    
    this.workClaims.set(taskId, claim);
    
    // Write claim file for persistence
    const claimFile = path.join(this.coordinationDir, this.sessionId, 'claims', `${taskId}.json`);
    await fs.mkdir(path.dirname(claimFile), { recursive: true });
    await fs.writeFile(claimFile, JSON.stringify(claim, null, 2));
    
    return true;
  }

  /**
   * Release work claim
   */
  async releaseWork(agentId: number, taskId: string): Promise<void> {
    const claim = this.workClaims.get(taskId);
    if (claim && claim.agentId === agentId) {
      claim.status = 'completed';
      claim.lastUpdate = new Date();
      
      // Update claim file
      const claimFile = path.join(this.coordinationDir, this.sessionId, 'claims', `${taskId}.json`);
      await fs.writeFile(claimFile, JSON.stringify(claim, null, 2));
    }
  }

  /**
   * Clean up session workspaces
   */
  async cleanupSession(sessionId: string, keepProjects: boolean = true): Promise<any> {
    const stats = {
      workspacesCleaned: 0,
      coordinationFilesCleaned: 0,
      projectsKept: 0
    };
    
    // Clean coordination files
    const sessionCoordDir = path.join(this.coordinationDir, sessionId);
    if (fsSync.existsSync(sessionCoordDir)) {
      await fs.rm(sessionCoordDir, { recursive: true, force: true });
      stats.coordinationFilesCleaned++;
    }
    
    // Handle workspace
    if (!keepProjects && fsSync.existsSync(this.workspaceDir)) {
      await fs.rm(this.workspaceDir, { recursive: true, force: true });
      stats.workspacesCleaned++;
    } else if (keepProjects) {
      stats.projectsKept = this.numAgents;
    }
    
    // Clear internal state
    this.agentProjects.clear();
    this.workClaims.clear();
    this.sessionId = '';
    this.mergeCompleted = false;
    
    return stats;
  }

  /**
   * Create manual merge trigger file
   */
  async createManualMergeTrigger(): Promise<void> {
    const triggerFile = path.join(this.workspaceDir, '.xenosync_merge_now');
    await fs.writeFile(triggerFile, new Date().toISOString());
    logger.info('[ProjectCoordinator] Manual merge trigger created');
    
    // Trigger merge
    await this.mergeProjects();
  }

  /**
   * Check for manual merge trigger
   */
  async checkManualMergeTrigger(): Promise<boolean> {
    const triggerFile = path.join(this.workspaceDir, '.xenosync_merge_now');
    return fsSync.existsSync(triggerFile);
  }
}

// Export singleton instance
export const projectCoordinator = new ProjectWorkspaceCoordinator();