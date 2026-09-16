import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { pathConfig } from '../config/paths.js';
import { logger } from '../utils/logger.js';
import { getConnection } from '../database/connection.js';

const execAsync = promisify(exec);

export interface SecurityVulnerability {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: string;
  title: string;
  description: string;
  file?: string;
  line?: number;
  column?: number;
  fixSuggestion?: string;
  cweId?: string;
  owaspCategory?: string;
  detectedAt: Date;
  status: 'open' | 'fixed' | 'false_positive' | 'accepted_risk';
}

export interface SecurityAuditReport {
  id: string;
  farmId?: string;
  scanType: 'full' | 'incremental' | 'dependency' | 'code' | 'configuration';
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'failed';
  vulnerabilities: SecurityVulnerability[];
  statistics: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  recommendations: string[];
  complianceStatus: {
    owasp: boolean;
    pci: boolean;
    hipaa: boolean;
    gdpr: boolean;
  };
}

export interface SecurityConfiguration {
  enableAutoScan: boolean;
  scanInterval: number; // in hours
  scanDepth: 'shallow' | 'medium' | 'deep';
  includePatterns: string[];
  excludePatterns: string[];
  customRules: SecurityRule[];
  notificationSettings: {
    email: boolean;
    slack: boolean;
    webhook?: string;
  };
}

export interface SecurityRule {
  id: string;
  name: string;
  pattern: RegExp;
  severity: SecurityVulnerability['severity'];
  description: string;
  fixSuggestion: string;
}

class SecurityAuditService extends EventEmitter {
  private auditReports: Map<string, SecurityAuditReport> = new Map();
  private scanQueue: string[] = [];
  private isScanning = false;
  private configuration: SecurityConfiguration;
  private builtInRules: SecurityRule[] = [
    {
      id: 'hardcoded-secret',
      name: 'Hardcoded Secret Detection',
      pattern: /(?:api[_-]?key|secret|password|token|private[_-]?key)\s*[:=]\s*["'][^"']{10,}["']/gi,
      severity: 'critical',
      description: 'Hardcoded secrets detected in source code',
      fixSuggestion: 'Use environment variables or secure key management systems'
    },
    {
      id: 'sql-injection',
      name: 'SQL Injection Risk',
      pattern: /(?:query|exec|execute)\s*\([^)]*\+[^)]*\)/gi,
      severity: 'critical',
      description: 'Potential SQL injection vulnerability from string concatenation',
      fixSuggestion: 'Use parameterized queries or prepared statements'
    },
    {
      id: 'xss-vulnerability',
      name: 'Cross-Site Scripting Risk',
      pattern: /dangerouslySetInnerHTML|innerHTML\s*=|document\.write/gi,
      severity: 'high',
      description: 'Potential XSS vulnerability from direct HTML injection',
      fixSuggestion: 'Sanitize user input and use safe rendering methods'
    },
    {
      id: 'path-traversal',
      name: 'Path Traversal Risk',
      pattern: /(?:\.\.\/|\.\.\\){2,}/g,
      severity: 'high',
      description: 'Potential path traversal vulnerability',
      fixSuggestion: 'Validate and sanitize file paths, use path.resolve()'
    },
    {
      id: 'weak-crypto',
      name: 'Weak Cryptography',
      pattern: /(?:md5|sha1)\s*\(/gi,
      severity: 'medium',
      description: 'Weak cryptographic algorithm detected',
      fixSuggestion: 'Use stronger algorithms like SHA-256 or SHA-3'
    },
    {
      id: 'insecure-random',
      name: 'Insecure Random Number Generation',
      pattern: /Math\.random\(\)/g,
      severity: 'medium',
      description: 'Math.random() is not cryptographically secure',
      fixSuggestion: 'Use crypto.randomBytes() for security-sensitive operations'
    },
    {
      id: 'console-log',
      name: 'Console Logging in Production',
      pattern: /console\.(log|error|warn|info|debug)/g,
      severity: 'low',
      description: 'Console logging statements found',
      fixSuggestion: 'Remove or replace with proper logging framework'
    },
    {
      id: 'eval-usage',
      name: 'Eval Usage',
      pattern: /eval\s*\(/g,
      severity: 'critical',
      description: 'eval() usage detected - potential code injection risk',
      fixSuggestion: 'Avoid eval() and use safer alternatives'
    },
    {
      id: 'cors-wildcard',
      name: 'CORS Wildcard',
      pattern: /Access-Control-Allow-Origin['"]?\s*:\s*['"]\*/g,
      severity: 'high',
      description: 'CORS wildcard origin detected',
      fixSuggestion: 'Specify allowed origins explicitly'
    },
    {
      id: 'missing-csrf',
      name: 'Missing CSRF Protection',
      pattern: /app\.(post|put|delete|patch)\s*\([^)]*\)[^{]*{(?![^}]*csrf)/gi,
      severity: 'high',
      description: 'State-changing operation without CSRF protection',
      fixSuggestion: 'Implement CSRF token validation'
    }
  ];

  constructor() {
    super();
    this.configuration = {
      enableAutoScan: false,
      scanInterval: 24,
      scanDepth: 'medium',
      includePatterns: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
      excludePatterns: ['node_modules/**', 'dist/**', 'build/**', '.git/**', 'coverage/**'],
      customRules: [],
      notificationSettings: {
        email: false,
        slack: false
      }
    };
  }

  async performSecurityAudit(
    targetPath: string,
    scanType: SecurityAuditReport['scanType'] = 'full'
  ): Promise<SecurityAuditReport> {
    const auditId = crypto.randomBytes(16).toString('hex');
    const report: SecurityAuditReport = {
      id: auditId,
      scanType,
      startedAt: new Date(),
      status: 'running',
      vulnerabilities: [],
      statistics: {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0
      },
      recommendations: [],
      complianceStatus: {
        owasp: false,
        pci: false,
        hipaa: false,
        gdpr: false
      }
    };

    this.auditReports.set(auditId, report);
    this.emit('audit:started', { auditId, targetPath, scanType });

    try {
      logger.info(`Starting security audit ${auditId} for ${targetPath}`);

      // Validate target path
      const resolvedPath = path.resolve(targetPath);
      if (!pathConfig.isPathSafe(resolvedPath)) {
        throw new Error('Target path is outside allowed boundaries');
      }

      // Perform different types of scans based on scanType
      const vulnerabilities: SecurityVulnerability[] = [];

      if (scanType === 'full' || scanType === 'code') {
        const codeVulns = await this.scanSourceCode(resolvedPath);
        vulnerabilities.push(...codeVulns);
      }

      if (scanType === 'full' || scanType === 'dependency') {
        const depVulns = await this.scanDependencies(resolvedPath);
        vulnerabilities.push(...depVulns);
      }

      if (scanType === 'full' || scanType === 'configuration') {
        const configVulns = await this.scanConfiguration(resolvedPath);
        vulnerabilities.push(...configVulns);
      }

      // Update report
      report.vulnerabilities = vulnerabilities;
      report.completedAt = new Date();
      report.status = 'completed';

      // Calculate statistics
      vulnerabilities.forEach(vuln => {
        report.statistics.total++;
        report.statistics[vuln.severity]++;
      });

      // Generate recommendations
      report.recommendations = this.generateRecommendations(vulnerabilities);

      // Check compliance
      report.complianceStatus = this.checkCompliance(vulnerabilities);

      // Store in database
      await this.storeAuditReport(report);

      this.emit('audit:completed', { auditId, report });
      logger.info(`Security audit ${auditId} completed with ${vulnerabilities.length} findings`);

      // Send notifications if critical vulnerabilities found
      if (report.statistics.critical > 0) {
        await this.sendSecurityAlert(report);
      }

      return report;
    } catch (error) {
      logger.error(`Security audit ${auditId} failed:`, error);
      report.status = 'failed';
      report.completedAt = new Date();
      this.emit('audit:failed', { auditId, error });
      throw error;
    }
  }

  private async scanSourceCode(targetPath: string): Promise<SecurityVulnerability[]> {
    const vulnerabilities: SecurityVulnerability[] = [];
    const files = await this.getFilesToScan(targetPath);

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n');

        // Apply built-in rules
        for (const rule of [...this.builtInRules, ...this.configuration.customRules]) {
          const matches = content.matchAll(rule.pattern);
          
          for (const match of matches) {
            const lineNumber = this.getLineNumber(content, match.index || 0);
            const column = this.getColumnNumber(content, match.index || 0);

            vulnerabilities.push({
              id: crypto.randomBytes(8).toString('hex'),
              severity: rule.severity,
              type: rule.name,
              title: rule.name,
              description: rule.description,
              file: path.relative(process.cwd(), file),
              line: lineNumber,
              column,
              fixSuggestion: rule.fixSuggestion,
              detectedAt: new Date(),
              status: 'open'
            });
          }
        }

        // Additional context-aware scanning
        await this.performContextualAnalysis(file, content, vulnerabilities);

      } catch (error) {
        logger.error(`Error scanning file ${file}:`, error);
      }
    }

    return vulnerabilities;
  }

  private async scanDependencies(targetPath: string): Promise<SecurityVulnerability[]> {
    const vulnerabilities: SecurityVulnerability[] = [];

    try {
      // Check for package.json
      const packageJsonPath = path.join(targetPath, 'package.json');
      const hasPackageJson = await fs.access(packageJsonPath).then(() => true).catch(() => false);

      if (hasPackageJson) {
        // Run npm audit
        const { stdout } = await execAsync('npm audit --json', { cwd: targetPath });
        const auditResults = JSON.parse(stdout);

        if (auditResults.vulnerabilities) {
          Object.entries(auditResults.vulnerabilities).forEach(([pkg, data]: [string, any]) => {
            data.via?.forEach((via: any) => {
              if (typeof via === 'object') {
                vulnerabilities.push({
                  id: crypto.randomBytes(8).toString('hex'),
                  severity: this.mapNpmSeverity(via.severity),
                  type: 'Dependency Vulnerability',
                  title: `${pkg} - ${via.title || 'Security Issue'}`,
                  description: via.detail || via.title || 'Dependency has known vulnerabilities',
                  fixSuggestion: via.fixAvailable ? 'Update to fixed version' : 'No fix available',
                  cweId: via.cwe?.join(', '),
                  detectedAt: new Date(),
                  status: 'open'
                });
              }
            });
          });
        }
      }

      // Check for outdated dependencies
      const outdated = await this.checkOutdatedDependencies(targetPath);
      vulnerabilities.push(...outdated);

    } catch (error) {
      logger.error('Error scanning dependencies:', error);
    }

    return vulnerabilities;
  }

  private async scanConfiguration(targetPath: string): Promise<SecurityVulnerability[]> {
    const vulnerabilities: SecurityVulnerability[] = [];

    try {
      // Check for insecure configurations
      const configFiles = [
        '.env',
        '.env.development',
        '.env.production',
        'config.json',
        'settings.json'
      ];

      for (const configFile of configFiles) {
        const filePath = path.join(targetPath, configFile);
        const exists = await fs.access(filePath).then(() => true).catch(() => false);

        if (exists) {
          const content = await fs.readFile(filePath, 'utf-8');

          // Check for weak configurations
          if (content.includes('BYPASS_AUTH=true')) {
            vulnerabilities.push({
              id: crypto.randomBytes(8).toString('hex'),
              severity: 'critical',
              type: 'Insecure Configuration',
              title: 'Authentication Bypass Enabled',
              description: 'BYPASS_AUTH is set to true in configuration',
              file: configFile,
              fixSuggestion: 'Disable authentication bypass in production',
              detectedAt: new Date(),
              status: 'open'
            });
          }

          // Check for default secrets
          if (content.match(/secret.*=.*["'].*default.*["']/gi)) {
            vulnerabilities.push({
              id: crypto.randomBytes(8).toString('hex'),
              severity: 'critical',
              type: 'Default Secret',
              title: 'Default Secret Key Detected',
              description: 'Using default secret keys in configuration',
              file: configFile,
              fixSuggestion: 'Generate and use strong, unique secret keys',
              detectedAt: new Date(),
              status: 'open'
            });
          }

          // Check for exposed sensitive data
          if (content.match(/(?:aws|azure|gcp).*(?:key|secret|token)/gi)) {
            vulnerabilities.push({
              id: crypto.randomBytes(8).toString('hex'),
              severity: 'critical',
              type: 'Exposed Credentials',
              title: 'Cloud Provider Credentials Exposed',
              description: 'Cloud provider credentials found in configuration file',
              file: configFile,
              fixSuggestion: 'Use environment variables or secret management service',
              detectedAt: new Date(),
              status: 'open'
            });
          }
        }
      }

      // Check SSL/TLS configuration
      const sslVulns = await this.checkSSLConfiguration(targetPath);
      vulnerabilities.push(...sslVulns);

    } catch (error) {
      logger.error('Error scanning configuration:', error);
    }

    return vulnerabilities;
  }

  private async performContextualAnalysis(
    file: string,
    content: string,
    vulnerabilities: SecurityVulnerability[]
  ): Promise<void> {
    // Check for missing input validation
    if (content.includes('req.body') || content.includes('req.query')) {
      if (!content.includes('validate') && !content.includes('sanitize')) {
        vulnerabilities.push({
          id: crypto.randomBytes(8).toString('hex'),
          severity: 'high',
          type: 'Missing Input Validation',
          title: 'Input Used Without Validation',
          description: 'User input is being used without proper validation',
          file: path.relative(process.cwd(), file),
          fixSuggestion: 'Implement input validation and sanitization',
          detectedAt: new Date(),
          status: 'open'
        });
      }
    }

    // Check for missing error handling
    if (content.includes('async') && !content.includes('try') && !content.includes('catch')) {
      vulnerabilities.push({
        id: crypto.randomBytes(8).toString('hex'),
        severity: 'medium',
        type: 'Missing Error Handling',
        title: 'Async Function Without Error Handling',
        description: 'Asynchronous operations without proper error handling',
        file: path.relative(process.cwd(), file),
        fixSuggestion: 'Add try-catch blocks or error handlers',
        detectedAt: new Date(),
        status: 'open'
      });
    }

    // Check for rate limiting
    if (file.includes('api') && !content.includes('rateLimit')) {
      vulnerabilities.push({
        id: crypto.randomBytes(8).toString('hex'),
        severity: 'medium',
        type: 'Missing Rate Limiting',
        title: 'API Endpoint Without Rate Limiting',
        description: 'API endpoint is not protected by rate limiting',
        file: path.relative(process.cwd(), file),
        fixSuggestion: 'Implement rate limiting to prevent abuse',
        detectedAt: new Date(),
        status: 'open'
      });
    }
  }

  private async checkOutdatedDependencies(targetPath: string): Promise<SecurityVulnerability[]> {
    const vulnerabilities: SecurityVulnerability[] = [];

    try {
      const { stdout } = await execAsync('npm outdated --json', { cwd: targetPath }).catch(err => err);
      
      if (stdout) {
        const outdated = JSON.parse(stdout);
        
        Object.entries(outdated).forEach(([pkg, data]: [string, any]) => {
          const current = data.current;
          const latest = data.latest;
          
          if (current && latest && current !== latest) {
            const majorVersionDiff = parseInt(latest.split('.')[0]) - parseInt(current.split('.')[0]);
            
            if (majorVersionDiff > 0) {
              vulnerabilities.push({
                id: crypto.randomBytes(8).toString('hex'),
                severity: 'low',
                type: 'Outdated Dependency',
                title: `${pkg} is outdated`,
                description: `Current: ${current}, Latest: ${latest}`,
                fixSuggestion: `Update to version ${latest}`,
                detectedAt: new Date(),
                status: 'open'
              });
            }
          }
        });
      }
    } catch (error) {
      // Ignore errors from npm outdated
    }

    return vulnerabilities;
  }

  private async checkSSLConfiguration(targetPath: string): Promise<SecurityVulnerability[]> {
    const vulnerabilities: SecurityVulnerability[] = [];

    // Check for SSL/TLS configuration issues in server files
    const serverFiles = await this.getFilesToScan(targetPath, ['**/server.ts', '**/index.ts']);

    for (const file of serverFiles) {
      const content = await fs.readFile(file, 'utf-8');

      if (content.includes('http.createServer') && !content.includes('https.createServer')) {
        vulnerabilities.push({
          id: crypto.randomBytes(8).toString('hex'),
          severity: 'high',
          type: 'Missing HTTPS',
          title: 'Server Not Using HTTPS',
          description: 'Server is using HTTP instead of HTTPS',
          file: path.relative(process.cwd(), file),
          fixSuggestion: 'Use HTTPS for all connections',
          detectedAt: new Date(),
          status: 'open'
        });
      }
    }

    return vulnerabilities;
  }

  private async getFilesToScan(targetPath: string, patterns?: string[]): Promise<string[]> {
    const files: string[] = [];
    const patternsToUse = patterns || this.configuration.includePatterns;

    async function walkDir(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Check if directory should be excluded
          const shouldExclude = this.configuration.excludePatterns.some(pattern =>
            fullPath.includes(pattern.replace('**/', '').replace('/**', ''))
          );

          if (!shouldExclude) {
            await walkDir.call(this, fullPath);
          }
        } else if (entry.isFile()) {
          // Check if file matches include patterns
          const shouldInclude = patternsToUse.some(pattern => {
            const ext = pattern.replace('**/*', '');
            return fullPath.endsWith(ext);
          });

          if (shouldInclude) {
            files.push(fullPath);
          }
        }
      }
    }

    await walkDir.call(this, targetPath);
    return files;
  }

  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  private getColumnNumber(content: string, index: number): number {
    const lines = content.substring(0, index).split('\n');
    return lines[lines.length - 1].length + 1;
  }

  private mapNpmSeverity(severity: string): SecurityVulnerability['severity'] {
    switch (severity.toLowerCase()) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'moderate': return 'medium';
      case 'low': return 'low';
      default: return 'info';
    }
  }

  private generateRecommendations(vulnerabilities: SecurityVulnerability[]): string[] {
    const recommendations: string[] = [];
    const stats = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0
    };

    vulnerabilities.forEach(v => stats[v.severity]++);

    if (stats.critical > 0) {
      recommendations.push('Immediately address all critical vulnerabilities');
      recommendations.push('Review and update authentication and authorization mechanisms');
      recommendations.push('Implement security monitoring and alerting');
    }

    if (stats.high > 0) {
      recommendations.push('Prioritize fixing high-severity vulnerabilities');
      recommendations.push('Implement input validation and sanitization');
      recommendations.push('Review and update CORS and CSP policies');
    }

    if (vulnerabilities.some(v => v.type.includes('Dependency'))) {
      recommendations.push('Update all vulnerable dependencies to latest secure versions');
      recommendations.push('Implement automated dependency scanning in CI/CD pipeline');
    }

    if (vulnerabilities.some(v => v.type.includes('Configuration'))) {
      recommendations.push('Review and harden all configuration files');
      recommendations.push('Use environment variables for sensitive configuration');
    }

    recommendations.push('Conduct regular security audits and penetration testing');
    recommendations.push('Implement security training for development team');
    recommendations.push('Establish a vulnerability disclosure program');

    return recommendations;
  }

  private checkCompliance(vulnerabilities: SecurityVulnerability[]): SecurityAuditReport['complianceStatus'] {
    const criticalCount = vulnerabilities.filter(v => v.severity === 'critical').length;
    const highCount = vulnerabilities.filter(v => v.severity === 'high').length;

    return {
      owasp: criticalCount === 0 && highCount < 5,
      pci: criticalCount === 0 && highCount === 0,
      hipaa: criticalCount === 0 && highCount < 3,
      gdpr: !vulnerabilities.some(v => 
        v.type.includes('Data') || v.type.includes('Privacy') || v.type.includes('Encryption')
      )
    };
  }

  private async storeAuditReport(report: SecurityAuditReport): Promise<void> {
    const connection = await getConnection();
    
    try {
      await connection.query(
        `INSERT INTO security_audits 
        (id, farm_id, scan_type, status, started_at, completed_at, vulnerabilities, statistics, recommendations, compliance_status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          report.id,
          report.farmId || null,
          report.scanType,
          report.status,
          report.startedAt,
          report.completedAt,
          JSON.stringify(report.vulnerabilities),
          JSON.stringify(report.statistics),
          JSON.stringify(report.recommendations),
          JSON.stringify(report.complianceStatus)
        ]
      );
    } catch (error) {
      logger.error('Error storing audit report:', error);
    }
  }

  private async sendSecurityAlert(report: SecurityAuditReport): Promise<void> {
    const criticalVulns = report.vulnerabilities.filter(v => v.severity === 'critical');
    
    logger.warn(`SECURITY ALERT: ${criticalVulns.length} critical vulnerabilities detected`);
    
    // Emit event for notification handlers
    this.emit('security:alert', {
      report,
      criticalVulnerabilities: criticalVulns
    });

    // Here you would implement actual notification sending
    // For example: email, Slack, webhook, etc.
  }

  async getAuditReport(auditId: string): Promise<SecurityAuditReport | null> {
    return this.auditReports.get(auditId) || null;
  }

  async getAllAuditReports(): Promise<SecurityAuditReport[]> {
    return Array.from(this.auditReports.values());
  }

  async scheduleAutomaticScans(): Promise<void> {
    if (!this.configuration.enableAutoScan) {
      logger.info('Automatic security scanning is disabled');
      return;
    }

    const intervalMs = this.configuration.scanInterval * 60 * 60 * 1000;
    
    setInterval(async () => {
      logger.info('Starting scheduled security scan');
      await this.performSecurityAudit(process.cwd(), 'full');
    }, intervalMs);

    logger.info(`Automatic security scanning scheduled every ${this.configuration.scanInterval} hours`);
  }

  updateConfiguration(config: Partial<SecurityConfiguration>): void {
    this.configuration = { ...this.configuration, ...config };
    logger.info('Security audit configuration updated');
  }

  async fixVulnerability(vulnerabilityId: string, auditId: string): Promise<boolean> {
    const report = this.auditReports.get(auditId);
    if (!report) return false;

    const vulnerability = report.vulnerabilities.find(v => v.id === vulnerabilityId);
    if (!vulnerability) return false;

    // Attempt automatic fixes for certain vulnerability types
    try {
      switch (vulnerability.type) {
        case 'Outdated Dependency':
          // Auto-update dependency
          await execAsync('npm update', { cwd: process.cwd() });
          vulnerability.status = 'fixed';
          return true;

        case 'Console Logging in Production':
          // This would require code modification
          // For now, just mark as acknowledged
          vulnerability.status = 'accepted_risk';
          return true;

        default:
          // For other types, mark as requiring manual intervention
          logger.info(`Vulnerability ${vulnerabilityId} requires manual fixing`);
          return false;
      }
    } catch (error) {
      logger.error(`Error fixing vulnerability ${vulnerabilityId}:`, error);
      return false;
    }
  }
}

export const securityAuditService = new SecurityAuditService();