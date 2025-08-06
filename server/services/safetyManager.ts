import { GoWildSession } from '../../src/types/goWild';
import { SafetyCheckResult } from '../../src/types/safety';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

interface SafetyCheck {
  isSafe: boolean;
  violation?: string;
  severity?: 'low' | 'medium' | 'high';
}

interface BoundaryValidation {
  isValid: boolean;
  violations: string[];
}

export class SafetyManager {
  private resourceLimits = {
    maxMemoryMB: 1024,
    maxCpuPercent: 80,
    maxDiskIOps: 1000,
    maxNetworkRequests: 100
  };

  private restrictedPatterns = [
    /\brm\s+-rf\s+\//i,
    /\bsudo\s+/i,
    /\bchmod\s+777/i,
    /\b(password|secret|key)\s*=/i,
    /\bdrop\s+(database|table)/i,
    /\bdelete\s+from\s+/i
  ];

  private allowedDomains = new Set([
    'api.github.com',
    'registry.npmjs.org',
    'pypi.org',
    'docs.python.org',
    'developer.mozilla.org',
    'stackoverflow.com'
  ]);

  async validateBoundaries(boundaries: any): Promise<BoundaryValidation> {
    const violations: string[] = [];

    // Check required boundaries
    if (boundaries.allowExternalAPIs && boundaries.restrictedDomains) {
      // Validate restricted domains format
      for (const domain of boundaries.restrictedDomains) {
        if (!this.isValidDomain(domain)) {
          violations.push(`Invalid domain format: ${domain}`);
        }
      }
    }

    // Check for security conflicts
    if (boundaries.allowFileSystem && !boundaries.allowedPaths) {
      violations.push('File system access requires allowedPaths to be specified');
    }

    if (boundaries.allowNetworkRequests && !boundaries.maxRequestsPerMinute) {
      boundaries.maxRequestsPerMinute = 60; // Set default
    }

    return {
      isValid: violations.length === 0,
      violations
    };
  }

  async checkCurrentState(session: GoWildSession): Promise<SafetyCheck> {
    try {
      // Check resource usage
      const resourceCheck = await this.checkResourceUsage();
      if (!resourceCheck.isSafe) {
        return resourceCheck;
      }

      // Check exploration depth
      if (session.explorationPath.nodes.length > session.config.explorationDepth * 10) {
        return {
          isSafe: false,
          violation: 'Exploration depth exceeded safe limits',
          severity: 'medium'
        };
      }

      // Check time limits
      const elapsed = Date.now() - session.startTime.getTime();
      const maxDuration = session.config.maxDuration * 60 * 1000;
      if (elapsed > maxDuration * 1.1) { // 10% buffer
        return {
          isSafe: false,
          violation: 'Session duration exceeded limits',
          severity: 'low'
        };
      }

      // Check for dangerous patterns in recent nodes
      const recentNodes = session.explorationPath.nodes.slice(-5);
      for (const node of recentNodes) {
        if (node.data) {
          const patternCheck = this.checkDangerousPatterns(JSON.stringify(node.data));
          if (!patternCheck.isSafe) {
            return patternCheck;
          }
        }
      }

      return { isSafe: true };
    } catch (error) {
      logger.error('Safety check failed:', error);
      return {
        isSafe: false,
        violation: 'Safety check error',
        severity: 'high'
      };
    }
  }

  private async checkResourceUsage(): Promise<SafetyCheck> {
    try {
      // In production, this would check actual system resources
      // For now, simulate resource checking
      const memoryUsage = process.memoryUsage();
      const memoryMB = memoryUsage.heapUsed / 1024 / 1024;

      if (memoryMB > this.resourceLimits.maxMemoryMB) {
        return {
          isSafe: false,
          violation: `Memory usage exceeded: ${memoryMB.toFixed(2)}MB`,
          severity: 'high'
        };
      }

      // Check CPU usage (simulated)
      const cpuPercent = Math.random() * 100;
      if (cpuPercent > this.resourceLimits.maxCpuPercent) {
        return {
          isSafe: false,
          violation: `CPU usage too high: ${cpuPercent.toFixed(1)}%`,
          severity: 'medium'
        };
      }

      return { isSafe: true };
    } catch (error) {
      logger.error('Resource check failed:', error);
      return {
        isSafe: false,
        violation: 'Resource check failed',
        severity: 'high'
      };
    }
  }

  private checkDangerousPatterns(content: string): SafetyCheck {
    for (const pattern of this.restrictedPatterns) {
      if (pattern.test(content)) {
        return {
          isSafe: false,
          violation: `Dangerous pattern detected: ${pattern}`,
          severity: 'high'
        };
      }
    }
    return { isSafe: true };
  }

  private isValidDomain(domain: string): boolean {
    // Basic domain validation
    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
    return domainRegex.test(domain);
  }

  async validateNetworkRequest(url: string, boundaries: any): Promise<SafetyCheck> {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      // Check if external APIs are allowed
      if (!boundaries.allowExternalAPIs) {
        return {
          isSafe: false,
          violation: 'External API access not allowed',
          severity: 'medium'
        };
      }

      // Check restricted domains
      if (boundaries.restrictedDomains?.includes(domain)) {
        return {
          isSafe: false,
          violation: `Access to ${domain} is restricted`,
          severity: 'medium'
        };
      }

      // Check allowed domains list
      if (!this.allowedDomains.has(domain) && !boundaries.allowAllDomains) {
        return {
          isSafe: false,
          violation: `Domain ${domain} not in allowed list`,
          severity: 'low'
        };
      }

      return { isSafe: true };
    } catch (error) {
      return {
        isSafe: false,
        violation: 'Invalid URL',
        severity: 'high'
      };
    }
  }

  async validateFileAccess(path: string, boundaries: any): Promise<SafetyCheck> {
    if (!boundaries.allowFileSystem) {
      return {
        isSafe: false,
        violation: 'File system access not allowed',
        severity: 'medium'
      };
    }

    // Check if path is within allowed paths
    if (boundaries.allowedPaths && boundaries.allowedPaths.length > 0) {
      const isAllowed = boundaries.allowedPaths.some((allowedPath: string) => 
        path.startsWith(allowedPath)
      );

      if (!isAllowed) {
        return {
          isSafe: false,
          violation: `Path ${path} not in allowed paths`,
          severity: 'medium'
        };
      }
    }

    // Check for dangerous paths
    const dangerousPaths = ['/etc', '/sys', '/proc', '/dev'];
    if (dangerousPaths.some(dangerous => path.startsWith(dangerous))) {
      return {
        isSafe: false,
        violation: `Access to system path ${path} is forbidden`,
        severity: 'high'
      };
    }

    return { isSafe: true };
  }

  getResourceLimits() {
    return { ...this.resourceLimits };
  }

  updateResourceLimits(limits: Partial<typeof this.resourceLimits>) {
    this.resourceLimits = { ...this.resourceLimits, ...limits };
    logger.info('Updated resource limits', this.resourceLimits);
  }

  async enforeBoundaries(session: GoWildSession): Promise<void> {
    const check = await this.checkCurrentState(session);
    if (!check.isSafe) {
      logger.warn(`Boundary violation detected for session ${session.id}:`, check.violation);
      // In a production system, this would take corrective action
      // For now, just log the violation
    }
  }

  async checkResourceLimits(session: GoWildSession): Promise<boolean> {
    const check = await this.checkResourceUsage();
    return check.isSafe;
  }

  async createCheckpoint(session: GoWildSession): Promise<string> {
    const checkpointId = uuidv4();
    
    // In a production system, this would create a full snapshot
    // For now, we'll just return the checkpoint ID
    logger.info(`Created checkpoint ${checkpointId} for session ${session.id}`);
    
    return checkpointId;
  }
}

// Export singleton instance
export const safetyManager = new SafetyManager();