/**
 * Tmux Connection Pool for efficient command execution
 * Reduces the overhead of creating new tmux processes for frequent operations
 */

import { spawn, exec, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { structuredLogger as logger, LogCategory, LogContext } from '../utils/structuredLogger';

const execAsync = promisify(exec);

interface PooledConnection {
  id: string;
  process?: ChildProcess;
  isActive: boolean;
  lastUsed: number;
  commandCount: number;
  maxCommands: number;
  createdAt: number;
  serverSocket?: string;
}

interface ConnectionPoolOptions {
  maxConnections?: number;
  maxCommandsPerConnection?: number;
  connectionTimeout?: number;
  healthCheckInterval?: number;
  idleTimeout?: number;
}

export class TmuxConnectionPool extends EventEmitter {
  private static instance: TmuxConnectionPool;
  private connections = new Map<string, PooledConnection>();
  private pendingRequests: Array<{
    resolve: (connection: PooledConnection) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];
  
  private readonly maxConnections: number;
  private readonly maxCommandsPerConnection: number;
  private readonly connectionTimeout: number;
  private readonly healthCheckInterval: number;
  private readonly idleTimeout: number;
  
  private healthCheckTimer?: NodeJS.Timeout;
  private isShuttingDown = false;
  
  constructor(options: ConnectionPoolOptions = {}) {
    super();
    
    this.maxConnections = options.maxConnections || 10;
    this.maxCommandsPerConnection = options.maxCommandsPerConnection || 100;
    this.connectionTimeout = options.connectionTimeout || 30000; // 30 seconds
    this.healthCheckInterval = options.healthCheckInterval || 60000; // 1 minute
    this.idleTimeout = options.idleTimeout || 300000; // 5 minutes
    
    this.startHealthCheck();
    this.setupShutdownHandlers();
  }
  
  static getInstance(options?: ConnectionPoolOptions): TmuxConnectionPool {
    if (!TmuxConnectionPool.instance) {
      TmuxConnectionPool.instance = new TmuxConnectionPool(options);
    }
    return TmuxConnectionPool.instance;
  }
  
  /**
   * Execute a tmux command using a pooled connection
   */
  async executeCommand(command: string[], context?: LogContext): Promise<{ stdout: string; stderr: string }> {
    if (this.isShuttingDown) {
      throw new Error('Connection pool is shutting down');
    }
    
    const correlationId = logger.createCorrelation(context);
    const childLogger = logger.child({ correlationId, operation: 'tmux-execute' });
    
    return logger.runWithCorrelationAsync({ correlationId, ...context }, async () => {
      const connection = await this.getConnection();
      
      try {
        const result = await this.runCommand(connection, command);
        this.releaseConnection(connection);
        
        childLogger.debug(LogCategory.SYSTEM, 
          `Tmux command executed: ${command.join(' ')}`);
        
        return result;
      } catch (error) {
        this.markConnectionUnhealthy(connection, error as Error);
        throw error;
      }
    });
  }
  
  /**
   * Execute a tmux command with automatic TMUX_TMPDIR
   */
  async executeTmuxCommand(args: string[], context?: LogContext): Promise<{ stdout: string; stderr: string }> {
    const command = ['tmux', ...args];
    return this.executeCommand(command, { ...context, tmuxCommand: true });
  }
  
  /**
   * Get an available connection from the pool
   */
  private async getConnection(): Promise<PooledConnection> {
    // Try to find an available connection
    for (const connection of this.connections.values()) {
      if (this.isConnectionAvailable(connection)) {
        connection.lastUsed = Date.now();
        connection.commandCount++;
        return connection;
      }
    }
    
    // Create new connection if under limit
    if (this.connections.size < this.maxConnections) {
      return this.createConnection();
    }
    
    // Wait for a connection to become available
    return this.waitForConnection();
  }
  
  /**
   * Create a new pooled connection
   */
  private async createConnection(): Promise<PooledConnection> {
    const connectionId = `tmux-pool-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    const connection: PooledConnection = {
      id: connectionId,
      isActive: true,
      lastUsed: Date.now(),
      commandCount: 0,
      maxCommands: this.maxCommandsPerConnection,
      createdAt: Date.now()
    };
    
    try {
      // Test the connection by listing sessions
      await this.runCommand(connection, ['tmux', 'list-sessions'], { timeout: 5000 });
      
      this.connections.set(connectionId, connection);
      
      logger.debug(LogCategory.SYSTEM, 
        `Created new tmux connection: ${connectionId}`, 
        { connectionId });
      
      this.emit('connection:created', connection);
      return connection;
    } catch (error) {
      logger.error(LogCategory.SYSTEM, 
        `Failed to create tmux connection: ${error}`, 
        { connectionId });
      throw new Error(`Failed to create tmux connection: ${error}`);
    }
  }
  
  /**
   * Wait for a connection to become available
   */
  private waitForConnection(): Promise<PooledConnection> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.pendingRequests.findIndex(req => req.resolve === resolve);
        if (index !== -1) {
          this.pendingRequests.splice(index, 1);
        }
        reject(new Error('Timeout waiting for tmux connection'));
      }, this.connectionTimeout);
      
      this.pendingRequests.push({ resolve, reject, timeout });
    });
  }
  
  /**
   * Run a command using a specific connection
   */
  private async runCommand(
    connection: PooledConnection, 
    command: string[], 
    options: { timeout?: number } = {}
  ): Promise<{ stdout: string; stderr: string }> {
    const timeout = options.timeout || 30000;
    
    try {
      // Add TMUX_TMPDIR environment variable for consistency
      const env = { ...process.env, TMUX_TMPDIR: '/tmp' };
      
      const result = await Promise.race([
        execAsync(command.join(' '), { env }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Command timeout')), timeout)
        )
      ]);
      
      return {
        stdout: result.stdout,
        stderr: result.stderr
      };
    } catch (error: any) {
      throw new Error(`Tmux command failed: ${error.message}`);
    }
  }
  
  /**
   * Check if a connection is available for use
   */
  private isConnectionAvailable(connection: PooledConnection): boolean {
    return connection.isActive && 
           connection.commandCount < connection.maxCommands &&
           !this.isConnectionExpired(connection);
  }
  
  /**
   * Check if a connection has expired
   */
  private isConnectionExpired(connection: PooledConnection): boolean {
    const now = Date.now();
    return (now - connection.lastUsed) > this.idleTimeout;
  }
  
  /**
   * Release a connection back to the pool
   */
  private releaseConnection(connection: PooledConnection): void {
    // Check if there are pending requests
    if (this.pendingRequests.length > 0) {
      const request = this.pendingRequests.shift();
      if (request) {
        clearTimeout(request.timeout);
        request.resolve(connection);
        return;
      }
    }
    
    // Connection is now available for reuse
    connection.lastUsed = Date.now();
  }
  
  /**
   * Mark a connection as unhealthy and remove it
   */
  private markConnectionUnhealthy(connection: PooledConnection, error: Error): void {
    logger.warn(LogCategory.SYSTEM, 
      `Marking tmux connection as unhealthy: ${error.message}`, 
      { connectionId: connection.id });
    
    connection.isActive = false;
    this.connections.delete(connection.id);
    
    this.emit('connection:unhealthy', { connection, error });
    
    // Try to create a replacement connection
    this.createConnection().catch(err => {
      logger.error(LogCategory.SYSTEM, `Failed to create replacement connection: ${err}`);
    });
  }
  
  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.healthCheckInterval);
  }
  
  /**
   * Perform health check on all connections
   */
  private async performHealthCheck(): Promise<void> {
    const now = Date.now();
    const connectionsToRemove: string[] = [];
    
    logger.debug(LogCategory.SYSTEM, 
      `Performing health check on ${this.connections.size} tmux connections`);
    
    for (const [id, connection] of this.connections.entries()) {
      try {
        // Remove expired connections
        if (this.isConnectionExpired(connection)) {
          connectionsToRemove.push(id);
          continue;
        }
        
        // Remove connections that have exceeded max commands
        if (connection.commandCount >= connection.maxCommands) {
          connectionsToRemove.push(id);
          continue;
        }
        
        // Test connection health with a simple command
        await this.runCommand(connection, ['tmux', 'list-sessions'], { timeout: 5000 });
        
      } catch (error) {
        logger.warn(LogCategory.SYSTEM, 
          `Health check failed for connection ${id}: ${error}`);
        connectionsToRemove.push(id);
      }
    }
    
    // Remove unhealthy connections
    for (const id of connectionsToRemove) {
      const connection = this.connections.get(id);
      if (connection) {
        this.connections.delete(id);
        this.emit('connection:removed', connection);
      }
    }
    
    if (connectionsToRemove.length > 0) {
      logger.info(LogCategory.SYSTEM, 
        `Health check removed ${connectionsToRemove.length} unhealthy connections`);
    }
    
    // Emit pool statistics
    this.emit('health:check', this.getPoolStats());
  }
  
  /**
   * Get connection pool statistics
   */
  getPoolStats() {
    const now = Date.now();
    const activeConnections = Array.from(this.connections.values())
      .filter(conn => conn.isActive);
    
    const totalCommands = activeConnections
      .reduce((sum, conn) => sum + conn.commandCount, 0);
    
    const avgCommandsPerConnection = activeConnections.length > 0 
      ? totalCommands / activeConnections.length 
      : 0;
    
    const oldestConnection = activeConnections
      .reduce((oldest, conn) => 
        !oldest || conn.createdAt < oldest.createdAt ? conn : oldest, 
        null as PooledConnection | null);
    
    return {
      totalConnections: this.connections.size,
      activeConnections: activeConnections.length,
      pendingRequests: this.pendingRequests.length,
      totalCommands,
      avgCommandsPerConnection: Math.round(avgCommandsPerConnection * 100) / 100,
      maxConnections: this.maxConnections,
      utilization: (activeConnections.length / this.maxConnections) * 100,
      oldestConnectionAge: oldestConnection 
        ? Math.round((now - oldestConnection.createdAt) / 1000) 
        : 0
    };
  }
  
  /**
   * Gracefully shutdown the connection pool
   */
  async shutdown(): Promise<void> {
    logger.info(LogCategory.SYSTEM, 'Shutting down tmux connection pool');
    
    this.isShuttingDown = true;
    
    // Stop health checks
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
    
    // Reject all pending requests
    for (const request of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new Error('Connection pool shutting down'));
    }
    this.pendingRequests = [];
    
    // Close all connections
    for (const [id, connection] of this.connections.entries()) {
      if (connection.process) {
        connection.process.kill();
      }
    }
    
    this.connections.clear();
    
    logger.info(LogCategory.SYSTEM, 'Tmux connection pool shutdown complete');
    this.emit('shutdown');
  }
  
  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async () => {
      await this.shutdown();
    };
    
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    process.once('SIGUSR2', shutdown); // Nodemon restart
  }
}

// Export singleton instance
export const tmuxConnectionPool = TmuxConnectionPool.getInstance({
  maxConnections: 10,
  maxCommandsPerConnection: 100,
  connectionTimeout: 30000,
  healthCheckInterval: 60000,
  idleTimeout: 300000
});

// Convenience functions for common tmux operations
export const tmuxCommands = {
  async listSessions(context?: LogContext): Promise<string[]> {
    const result = await tmuxConnectionPool.executeTmuxCommand(['list-sessions', '-F', '#{session_name}'], context);
    return result.stdout.trim().split('\n').filter(Boolean);
  },
  
  async hasSession(sessionName: string, context?: LogContext): Promise<boolean> {
    try {
      await tmuxConnectionPool.executeTmuxCommand(['has-session', '-t', sessionName], context);
      return true;
    } catch {
      return false;
    }
  },
  
  async listWindows(sessionName: string, context?: LogContext): Promise<string[]> {
    const result = await tmuxConnectionPool.executeTmuxCommand(['list-windows', '-t', sessionName, '-F', '#{window_name}'], context);
    return result.stdout.trim().split('\n').filter(Boolean);
  },
  
  async listPanes(sessionName: string, windowName: string, context?: LogContext): Promise<string[]> {
    const result = await tmuxConnectionPool.executeTmuxCommand(['list-panes', '-t', `${sessionName}:${windowName}`, '-F', '#{pane_index}'], context);
    return result.stdout.trim().split('\n').filter(Boolean);
  },
  
  async capturePane(paneTarget: string, lines: number = 100, context?: LogContext): Promise<string> {
    const result = await tmuxConnectionPool.executeTmuxCommand(['capture-pane', '-t', paneTarget, '-p', '-S', `-${lines}`], context);
    return result.stdout;
  },
  
  async killSession(sessionName: string, context?: LogContext): Promise<void> {
    await tmuxConnectionPool.executeTmuxCommand(['kill-session', '-t', sessionName], context);
  }
};