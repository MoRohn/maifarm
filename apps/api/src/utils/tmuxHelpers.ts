/**
 * TMUX Helper Utilities for XenoSync and Standard Orchestrators
 * Ensures consistent session management across all orchestration modes
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger';
import { pathConfig } from '../config/paths';

const TMUX_TMPDIR = pathConfig.getPath('TMUX_TMP_DIR');

const execAsync = promisify(exec);

/**
 * Ensures TMUX_TMPDIR is set in environment
 */
export function ensureTmuxTmpDir(): void {
  process.env.TMUX_TMPDIR = TMUX_TMPDIR;
}

/**
 * Detects the window target for a tmux session
 * XenoSync uses 'agents' window, standard orchestrator uses '0'
 */
export async function detectWindowTarget(sessionName: string): Promise<string> {
  ensureTmuxTmpDir();

  try {
    // Check if agents window exists (XenoSync)
    await execAsync(`TMUX_TMPDIR=${TMUX_TMPDIR} tmux list-windows -t ${sessionName} | grep agents`);
    logger.debug(`[TmuxHelpers] Detected 'agents' window for session ${sessionName} (XenoSync mode)`);
    return 'agents';
  } catch {
    // Default to window 0 (standard orchestrator)
    logger.debug(`[TmuxHelpers] Using window '0' for session ${sessionName} (standard mode)`);
    return '0';
  }
}

/**
 * Gets the correct pane reference for a session
 */
export async function getTmuxPaneRef(
  sessionName: string,
  agentIndex: number
): Promise<string> {
  const windowTarget = await detectWindowTarget(sessionName);
  return `${sessionName}:${windowTarget}.${agentIndex}`;
}

/**
 * Checks if a tmux session exists
 */
export async function tmuxSessionExists(sessionName: string): Promise<boolean> {
  ensureTmuxTmpDir();

  try {
    await execAsync(`TMUX_TMPDIR=${TMUX_TMPDIR} tmux has-session -t ${sessionName} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lists all panes in a session
 */
export async function listTmuxPanes(sessionName: string): Promise<number[]> {
  ensureTmuxTmpDir();

  const windowTarget = await detectWindowTarget(sessionName);

  try {
    const result = await execAsync(
      `TMUX_TMPDIR=${TMUX_TMPDIR} tmux list-panes -t ${sessionName}:${windowTarget} -F '#{pane_index}' 2>/dev/null`
    );

    return result.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(Number);
  } catch {
    return [];
  }
}

/**
 * Sends a command to a tmux pane
 */
export async function sendTmuxCommand(
  sessionName: string,
  agentIndex: number,
  command: string
): Promise<void> {
  ensureTmuxTmpDir();

  const paneRef = await getTmuxPaneRef(sessionName, agentIndex);

  await execAsync(
    `TMUX_TMPDIR=${TMUX_TMPDIR} tmux send-keys -t "${paneRef}" "${command}" Enter`
  );
}

/**
 * Kills a tmux session
 */
export async function killTmuxSession(sessionName: string): Promise<void> {
  ensureTmuxTmpDir();

  try {
    await execAsync(`TMUX_TMPDIR=${TMUX_TMPDIR} tmux kill-session -t ${sessionName} 2>/dev/null`);
    logger.info(`[TmuxHelpers] Killed session ${sessionName}`);
  } catch {
    // Session might not exist, that's okay
    logger.debug(`[TmuxHelpers] Session ${sessionName} not found or already killed`);
  }
}

/**
 * Sets up pipe-pane for terminal output capture
 */
export async function setupTmuxPipePane(
  sessionName: string,
  agentIndex: number,
  outputFile: string
): Promise<void> {
  ensureTmuxTmpDir();

  const paneRef = await getTmuxPaneRef(sessionName, agentIndex);

  await execAsync(
    `TMUX_TMPDIR=${TMUX_TMPDIR} tmux pipe-pane -t "${paneRef}" "cat >> ${outputFile}"`
  );
}

/**
 * Gets the session name for a farm
 * Ensures consistent naming across all orchestrators
 */
export function getFarmSessionName(farmId: string): string {
  // CRITICAL: Always use farm-{id} format, never xenosync-hive
  return `farm-${farmId.substring(0, 8)}`;
}
