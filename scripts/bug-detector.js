#!/usr/bin/env node

/**
 * MaiFarm Comprehensive Bug Detection System
 * Automatically detects, categorizes, and reports bugs across the application
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

class BugDetector {
  constructor() {
    this.bugs = [];
    this.categories = {
      CRITICAL: { count: 0, bugs: [] },
      HIGH: { count: 0, bugs: [] },
      MEDIUM: { count: 0, bugs: [] },
      LOW: { count: 0, bugs: [] }
    };
    this.reportDir = path.join(rootDir, 'reports');
    this.ensureReportDir();
  }

  ensureReportDir() {
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
  }

  addBug(bug) {
    this.bugs.push(bug);
    this.categories[bug.severity].count++;
    this.categories[bug.severity].bugs.push(bug);
  }

  async detectTypeScriptErrors() {
    this.log('🔍 Detecting TypeScript errors...');
    
    try {
      execSync('npx tsc --noEmit', { 
        cwd: rootDir, 
        stdio: 'pipe',
        encoding: 'utf8' 
      });
      this.log('✅ No TypeScript compilation errors found');
    } catch (error) {
      const output = error.stdout || error.stderr || '';
      const lines = output.split('\n').filter(line => line.includes('error TS'));
      
      lines.forEach(line => {
        const match = line.match(/(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)/);
        if (match) {
          const [, file, row, col, code, message] = match;
          this.addBug({
            id: `TS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'TypeScript Error',
            severity: this.classifyTypeScriptSeverity(code),
            file: file.replace(rootDir, ''),
            line: parseInt(row),
            column: parseInt(col),
            code,
            message,
            category: 'COMPILATION',
            component: this.getComponentFromPath(file),
            reproducible: true,
            fixable: true
          });
        }
      });
      
      this.log(`❌ Found ${lines.length} TypeScript errors`);
    }
  }

  classifyTypeScriptSeverity(code) {
    const criticalErrors = ['TS2307', 'TS2304', 'TS2339', 'TS2345'];
    const highErrors = ['TS2322', 'TS2353', 'TS18048'];
    const mediumErrors = ['TS7006', 'TS7053', 'TS2561'];
    
    if (criticalErrors.includes(code)) return 'CRITICAL';
    if (highErrors.includes(code)) return 'HIGH';
    if (mediumErrors.includes(code)) return 'MEDIUM';
    return 'LOW';
  }

  async detectESLintIssues() {
    this.log('🔍 Detecting ESLint issues...');
    
    try {
      const output = execSync('npx eslint src --ext .ts,.tsx --format json', {
        cwd: rootDir,
        encoding: 'utf8'
      });
      
      const results = JSON.parse(output);
      let issueCount = 0;
      
      results.forEach(file => {
        file.messages.forEach(message => {
          issueCount++;
          this.addBug({
            id: `ESLINT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'ESLint Issue',
            severity: this.classifyESLintSeverity(message.severity),
            file: file.filePath.replace(rootDir, ''),
            line: message.line,
            column: message.column,
            rule: message.ruleId,
            message: message.message,
            category: 'CODE_QUALITY',
            component: this.getComponentFromPath(file.filePath),
            reproducible: true,
            fixable: message.fix !== undefined
          });
        });
      });
      
      this.log(`✅ Analyzed ESLint issues: ${issueCount} found`);
    } catch (error) {
      this.log(`⚠️ ESLint analysis failed: ${error.message}`);
    }
  }

  classifyESLintSeverity(severity) {
    if (severity === 2) return 'HIGH';
    if (severity === 1) return 'MEDIUM';
    return 'LOW';
  }

  async detectSecurityVulnerabilities() {
    this.log('🔍 Detecting security vulnerabilities...');
    
    try {
      const output = execSync('npm audit --json', {
        cwd: rootDir,
        encoding: 'utf8'
      });
      
      const auditResult = JSON.parse(output);
      
      if (auditResult.vulnerabilities) {
        Object.entries(auditResult.vulnerabilities).forEach(([packageName, vuln]) => {
          this.addBug({
            id: `SECURITY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'Security Vulnerability',
            severity: this.classifySecuritySeverity(vuln.severity),
            package: packageName,
            version: vuln.version,
            message: `${vuln.severity} vulnerability in ${packageName}`,
            category: 'SECURITY',
            cwe: vuln.cwe,
            cvss: vuln.cvss,
            reproducible: true,
            fixable: vuln.fixAvailable !== false
          });
        });
      }
      
      this.log(`✅ Security audit completed: ${Object.keys(auditResult.vulnerabilities || {}).length} vulnerabilities found`);
    } catch (error) {
      this.log(`⚠️ Security audit failed: ${error.message}`);
    }
  }

  classifySecuritySeverity(severity) {
    const severityMap = {
      'critical': 'CRITICAL',
      'high': 'HIGH', 
      'moderate': 'MEDIUM',
      'low': 'LOW'
    };
    return severityMap[severity] || 'MEDIUM';
  }

  async detectPerformanceIssues() {
    this.log('🔍 Detecting performance issues...');
    
    // Check bundle size
    try {
      if (fs.existsSync(path.join(rootDir, 'dist'))) {
        const stats = this.analyzeBundleSize();
        if (stats.totalSize > 500 * 1024) { // 500KB threshold
          this.addBug({
            id: `PERF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'Performance Issue',
            severity: 'MEDIUM',
            message: `Bundle size too large: ${(stats.totalSize / 1024).toFixed(2)}KB`,
            category: 'PERFORMANCE',
            component: 'Bundle',
            reproducible: true,
            fixable: true,
            metrics: stats
          });
        }
      }
    } catch (error) {
      this.log(`⚠️ Bundle analysis failed: ${error.message}`);
    }

    // Check for potential memory leaks in code
    this.detectPotentialMemoryLeaks();
  }

  analyzeBundleSize() {
    const distDir = path.join(rootDir, 'dist', 'assets');
    if (!fs.existsSync(distDir)) return { totalSize: 0, files: [] };
    
    const files = fs.readdirSync(distDir);
    let totalSize = 0;
    const fileStats = [];
    
    files.forEach(file => {
      const filePath = path.join(distDir, file);
      const stats = fs.statSync(filePath);
      totalSize += stats.size;
      fileStats.push({
        name: file,
        size: stats.size
      });
    });
    
    return { totalSize, files: fileStats };
  }

  detectPotentialMemoryLeaks() {
    const srcDir = path.join(rootDir, 'src');
    this.scanDirectoryForMemoryLeaks(srcDir);
  }

  scanDirectoryForMemoryLeaks(dir) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        this.scanDirectoryForMemoryLeaks(filePath);
      } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        this.checkFileForMemoryLeaks(filePath);
      }
    });
  }

  checkFileForMemoryLeaks(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Check for potential memory leak patterns
    lines.forEach((line, index) => {
      // Missing cleanup in useEffect
      if (line.includes('useEffect') && !content.includes('return () =>')) {
        const nextLines = lines.slice(index, index + 10).join('\n');
        if (nextLines.includes('addEventListener') || nextLines.includes('setInterval') || nextLines.includes('setTimeout')) {
          this.addBug({
            id: `MEMORY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'Potential Memory Leak',
            severity: 'MEDIUM',
            file: filePath.replace(rootDir, ''),
            line: index + 1,
            message: 'useEffect with event listeners/timers missing cleanup function',
            category: 'MEMORY_LEAK',
            component: this.getComponentFromPath(filePath),
            reproducible: true,
            fixable: true
          });
        }
      }
      
      // Unused event listeners
      if (line.includes('addEventListener') && !content.includes('removeEventListener')) {
        this.addBug({
          id: `MEMORY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'Missing Event Listener Cleanup',
          severity: 'MEDIUM',
          file: filePath.replace(rootDir, ''),
          line: index + 1,
          message: 'addEventListener without corresponding removeEventListener',
          category: 'MEMORY_LEAK',
          component: this.getComponentFromPath(filePath),
          reproducible: true,
          fixable: true
        });
      }
    });
  }

  async detectUIBugs() {
    this.log('🔍 Detecting UI/UX issues...');
    
    // Check for accessibility issues in components
    const componentsDir = path.join(rootDir, 'src', 'components');
    this.scanComponentsForAccessibilityIssues(componentsDir);
    
    // Check for missing error boundaries
    this.checkForMissingErrorBoundaries();
  }

  scanComponentsForAccessibilityIssues(dir) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        this.scanComponentsForAccessibilityIssues(filePath);
      } else if (file.endsWith('.tsx')) {
        this.checkComponentForA11yIssues(filePath);
      }
    });
  }

  checkComponentForA11yIssues(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      // Missing alt text on images
      if (line.includes('<img') && !line.includes('alt=')) {
        this.addBug({
          id: `A11Y-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'Accessibility Issue',
          severity: 'MEDIUM',
          file: filePath.replace(rootDir, ''),
          line: index + 1,
          message: 'Image missing alt attribute',
          category: 'ACCESSIBILITY',
          component: this.getComponentFromPath(filePath),
          reproducible: true,
          fixable: true
        });
      }
      
      // Buttons without proper labels
      if (line.includes('<button') && !line.includes('aria-label') && !line.includes('>')) {
        const nextLine = lines[index + 1];
        if (nextLine && !nextLine.trim()) {
          this.addBug({
            id: `A11Y-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'Accessibility Issue',
            severity: 'MEDIUM',
            file: filePath.replace(rootDir, ''),
            line: index + 1,
            message: 'Button without accessible label or text content',
            category: 'ACCESSIBILITY',
            component: this.getComponentFromPath(filePath),
            reproducible: true,
            fixable: true
          });
        }
      }
    });
  }

  checkForMissingErrorBoundaries() {
    // Simple check - in a real implementation, this would be more sophisticated
    const appFile = path.join(rootDir, 'src', 'App.tsx');
    if (fs.existsSync(appFile)) {
      const content = fs.readFileSync(appFile, 'utf8');
      if (!content.includes('ErrorBoundary')) {
        this.addBug({
          id: `ERROR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'Missing Error Boundary',
          severity: 'HIGH',
          file: '/src/App.tsx',
          message: 'Application missing error boundary for graceful error handling',
          category: 'ERROR_HANDLING',
          component: 'App',
          reproducible: true,
          fixable: true
        });
      }
    }
  }

  getComponentFromPath(filePath) {
    const parts = filePath.split(path.sep);
    const srcIndex = parts.findIndex(part => part === 'src');
    if (srcIndex >= 0 && srcIndex < parts.length - 1) {
      return parts.slice(srcIndex + 1, -1).join('/');
    }
    return 'Unknown';
  }

  generateReport() {
    this.log('📊 Generating comprehensive bug report...');
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalBugs: this.bugs.length,
        critical: this.categories.CRITICAL.count,
        high: this.categories.HIGH.count,
        medium: this.categories.MEDIUM.count,
        low: this.categories.LOW.count
      },
      categories: this.categories,
      bugs: this.bugs,
      recommendations: this.generateRecommendations()
    };
    
    // Save JSON report
    const jsonPath = path.join(this.reportDir, `bug-report-${Date.now()}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    
    // Save HTML report
    const htmlPath = path.join(this.reportDir, `bug-report-${Date.now()}.html`);
    fs.writeFileSync(htmlPath, this.generateHTMLReport(report));
    
    // Save CSV for spreadsheet analysis
    const csvPath = path.join(this.reportDir, `bug-report-${Date.now()}.csv`);
    fs.writeFileSync(csvPath, this.generateCSVReport(report));
    
    this.log(`✅ Reports generated:`);
    this.log(`   📄 JSON: ${jsonPath}`);
    this.log(`   🌐 HTML: ${htmlPath}`);
    this.log(`   📊 CSV: ${csvPath}`);
    
    return report;
  }

  generateRecommendations() {
    const recommendations = [];
    
    if (this.categories.CRITICAL.count > 0) {
      recommendations.push({
        priority: 'URGENT',
        action: `Fix ${this.categories.CRITICAL.count} critical bugs immediately`,
        impact: 'Application may not function correctly'
      });
    }
    
    if (this.categories.HIGH.count > 10) {
      recommendations.push({
        priority: 'HIGH',
        action: `Address ${this.categories.HIGH.count} high-priority bugs`,
        impact: 'User experience significantly impacted'
      });
    }
    
    const typeScriptErrors = this.bugs.filter(bug => bug.type === 'TypeScript Error').length;
    if (typeScriptErrors > 0) {
      recommendations.push({
        priority: 'HIGH',
        action: `Resolve ${typeScriptErrors} TypeScript compilation errors`,
        impact: 'Prevents clean builds and may hide other issues'
      });
    }
    
    const securityBugs = this.bugs.filter(bug => bug.category === 'SECURITY').length;
    if (securityBugs > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        action: `Fix ${securityBugs} security vulnerabilities`,
        impact: 'Potential security breaches and data exposure'
      });
    }
    
    return recommendations;
  }

  generateHTMLReport(report) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>MaiFarm Bug Report - ${new Date().toLocaleDateString()}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .severity-critical { color: #d73027; font-weight: bold; }
        .severity-high { color: #fc8d59; font-weight: bold; }
        .severity-medium { color: #fee08b; font-weight: bold; }
        .severity-low { color: #91bfdb; }
        .bug-item { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 4px; }
        .bug-header { font-weight: bold; font-size: 16px; margin-bottom: 5px; }
        .bug-meta { color: #666; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>MaiFarm Bug Detection Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
    
    <div class="summary">
        <h2>Summary</h2>
        <p><strong>Total Bugs Found:</strong> ${report.summary.totalBugs}</p>
        <ul>
            <li class="severity-critical">Critical: ${report.summary.critical}</li>
            <li class="severity-high">High: ${report.summary.high}</li>
            <li class="severity-medium">Medium: ${report.summary.medium}</li>
            <li class="severity-low">Low: ${report.summary.low}</li>
        </ul>
    </div>
    
    <h2>Recommendations</h2>
    <ul>
        ${report.recommendations.map(rec => 
          `<li><strong>${rec.priority}:</strong> ${rec.action} - <em>${rec.impact}</em></li>`
        ).join('')}
    </ul>
    
    <h2>Bug Details</h2>
    ${report.bugs.map(bug => `
        <div class="bug-item">
            <div class="bug-header severity-${bug.severity.toLowerCase()}">${bug.type}: ${bug.message}</div>
            <div class="bug-meta">
                ID: ${bug.id} | Severity: ${bug.severity} | Category: ${bug.category} | Component: ${bug.component}
                ${bug.file ? ` | File: ${bug.file}:${bug.line || '?'}` : ''}
            </div>
        </div>
    `).join('')}
</body>
</html>`;
  }

  generateCSVReport(report) {
    const headers = ['ID', 'Type', 'Severity', 'Category', 'Component', 'File', 'Line', 'Message', 'Fixable'];
    const rows = report.bugs.map(bug => [
      bug.id,
      bug.type,
      bug.severity,
      bug.category,
      bug.component,
      bug.file || '',
      bug.line || '',
      `"${bug.message.replace(/"/g, '""')}"`,
      bug.fixable ? 'Yes' : 'No'
    ]);
    
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  async run() {
    this.log('🚀 Starting comprehensive bug detection...');
    
    await this.detectTypeScriptErrors();
    await this.detectESLintIssues();
    await this.detectSecurityVulnerabilities();
    await this.detectPerformanceIssues();
    await this.detectUIBugs();
    
    const report = this.generateReport();
    
    this.log(`\n📊 BUG DETECTION COMPLETE`);
    this.log(`==========================================`);
    this.log(`Total Bugs Found: ${report.summary.totalBugs}`);
    this.log(`Critical: ${report.summary.critical}`);
    this.log(`High: ${report.summary.high}`);
    this.log(`Medium: ${report.summary.medium}`);
    this.log(`Low: ${report.summary.low}`);
    this.log(`==========================================`);
    
    if (report.summary.totalBugs === 0) {
      this.log('🎉 No bugs detected! Application appears to be bug-free.');
    } else {
      this.log(`⚠️ ${report.summary.totalBugs} bugs detected. See reports for details.`);
    }
    
    return report;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const detector = new BugDetector();
  detector.run().catch(console.error);
}

export default BugDetector;