#!/usr/bin/env node

/**
 * MaiFarm Performance Benchmarking Script
 * Runs comprehensive performance tests and generates reports
 */

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  lighthouseRuns: 3,
  k6Duration: '10m',
  bundleSizeLimit: 2000000, // 2MB
  performanceBudgets: {
    lighthouse: {
      performance: 90,
      accessibility: 95,
      bestPractices: 95,
      seo: 90,
    },
    webVitals: {
      fcp: 1500, // First Contentful Paint
      lcp: 2500, // Largest Contentful Paint
      tbt: 300,  // Total Blocking Time
      cls: 0.1,  // Cumulative Layout Shift
      fid: 100,  // First Input Delay
    },
    k6: {
      errorRate: 0.01,      // 1% error rate
      p95Duration: 500,     // 95th percentile under 500ms
      p99Duration: 1000,    // 99th percentile under 1s
      rps: 100,             // Requests per second
    },
  },
};

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

// Helper functions
const log = (message, color = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

const execAsync = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

const ensureDirectory = async (dir) => {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    // Directory already exists
  }
};

// Performance test functions
async function runBundleSizeAnalysis() {
  log('\n📦 Running Bundle Size Analysis...', 'blue');
  
  try {
    // Build the application
    await execAsync('npm run build');
    
    // Analyze bundle size
    const distPath = path.join(__dirname, '../dist');
    const files = await fs.readdir(distPath, { recursive: true });
    
    let totalSize = 0;
    const bundles = [];
    
    for (const file of files) {
      if (file.endsWith('.js') || file.endsWith('.css')) {
        const filePath = path.join(distPath, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
        bundles.push({
          name: file,
          size: stats.size,
          sizeKB: (stats.size / 1024).toFixed(2),
        });
      }
    }
    
    // Sort bundles by size
    bundles.sort((a, b) => b.size - a.size);
    
    // Generate report
    const report = {
      totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      bundles: bundles.slice(0, 10), // Top 10 largest bundles
      passed: totalSize < CONFIG.bundleSizeLimit,
    };
    
    if (report.passed) {
      log(`✅ Bundle size: ${report.totalSizeMB}MB (under ${(CONFIG.bundleSizeLimit / 1024 / 1024).toFixed(2)}MB limit)`, 'green');
    } else {
      log(`❌ Bundle size: ${report.totalSizeMB}MB (exceeds ${(CONFIG.bundleSizeLimit / 1024 / 1024).toFixed(2)}MB limit)`, 'red');
    }
    
    return report;
  } catch (error) {
    log('❌ Bundle size analysis failed', 'red');
    console.error(error);
    return { passed: false, error: error.message };
  }
}

async function runLighthouseTests() {
  log('\n🔍 Running Lighthouse Performance Tests...', 'blue');
  
  try {
    const { stdout } = await execAsync('npm run build && npx lhci autorun');
    
    // Parse Lighthouse results
    const resultsPath = path.join(__dirname, '../.lighthouseci');
    const files = await fs.readdir(resultsPath);
    const reports = [];
    
    for (const file of files) {
      if (file.endsWith('.json') && file.includes('lhr')) {
        const reportPath = path.join(resultsPath, file);
        const report = JSON.parse(await fs.readFile(reportPath, 'utf-8'));
        reports.push({
          url: report.finalUrl,
          scores: {
            performance: Math.round(report.categories.performance.score * 100),
            accessibility: Math.round(report.categories.accessibility.score * 100),
            bestPractices: Math.round(report.categories['best-practices'].score * 100),
            seo: Math.round(report.categories.seo.score * 100),
          },
          metrics: {
            fcp: report.audits['first-contentful-paint'].numericValue,
            lcp: report.audits['largest-contentful-paint'].numericValue,
            tbt: report.audits['total-blocking-time'].numericValue,
            cls: report.audits['cumulative-layout-shift'].numericValue,
            tti: report.audits['interactive'].numericValue,
          },
        });
      }
    }
    
    // Check against budgets
    const passed = reports.every(report => {
      return Object.entries(CONFIG.performanceBudgets.lighthouse).every(([metric, threshold]) => {
        return report.scores[metric] >= threshold;
      });
    });
    
    if (passed) {
      log('✅ All Lighthouse tests passed', 'green');
    } else {
      log('❌ Some Lighthouse tests failed', 'red');
    }
    
    return { passed, reports };
  } catch (error) {
    log('❌ Lighthouse tests failed', 'red');
    console.error(error);
    return { passed: false, error: error.message };
  }
}

async function runLoadTests() {
  log('\n🔨 Running K6 Load Tests...', 'blue');
  
  try {
    // Check if k6 is installed
    try {
      await execAsync('k6 version');
    } catch {
      log('Installing k6...', 'yellow');
      await execAsync('brew install k6 || curl https://github.com/grafana/k6/releases/download/v0.48.0/k6-v0.48.0-linux-amd64.tar.gz -L | tar xvz && sudo mv k6-v0.48.0-linux-amd64/k6 /usr/local/bin/');
    }
    
    // Start the server
    log('Starting server for load tests...', 'yellow');
    const serverProcess = exec('npm run preview');
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Run k6 tests
    const { stdout } = await execAsync(`k6 run --out json=k6-results.json tests/performance/k6-load.js`);
    
    // Parse results
    const results = JSON.parse(await fs.readFile('k6-results.json', 'utf-8'));
    
    // Clean up
    serverProcess.kill();
    await fs.unlink('k6-results.json');
    
    // Extract key metrics
    const metrics = {
      errorRate: results.metrics.errors?.rate || 0,
      p95Duration: results.metrics.http_req_duration?.p95 || 0,
      p99Duration: results.metrics.http_req_duration?.p99 || 0,
      rps: results.metrics.http_reqs?.rate || 0,
    };
    
    // Check against budgets
    const passed = Object.entries(CONFIG.performanceBudgets.k6).every(([metric, threshold]) => {
      if (metric === 'errorRate') {
        return metrics[metric] <= threshold;
      }
      return metrics[metric] >= threshold || (metric.includes('Duration') && metrics[metric] <= threshold);
    });
    
    if (passed) {
      log('✅ All load tests passed', 'green');
    } else {
      log('❌ Some load tests failed', 'red');
    }
    
    return { passed, metrics };
  } catch (error) {
    log('❌ Load tests failed', 'red');
    console.error(error);
    return { passed: false, error: error.message };
  }
}

async function generateReport(results) {
  log('\n📊 Generating Performance Report...', 'blue');
  
  const timestamp = new Date().toISOString();
  const reportDir = path.join(__dirname, '../performance-reports');
  await ensureDirectory(reportDir);
  
  const report = {
    timestamp,
    summary: {
      passed: Object.values(results).every(r => r.passed),
      bundleSize: results.bundleSize.passed,
      lighthouse: results.lighthouse.passed,
      loadTests: results.loadTests.passed,
    },
    details: results,
    recommendations: [],
  };
  
  // Add recommendations based on failures
  if (!results.bundleSize.passed) {
    report.recommendations.push('Consider code splitting and lazy loading to reduce bundle size');
  }
  
  if (results.lighthouse.reports) {
    results.lighthouse.reports.forEach(r => {
      if (r.scores.performance < 90) {
        report.recommendations.push(`Improve performance score for ${r.url}`);
      }
      if (r.metrics.lcp > 2500) {
        report.recommendations.push(`Optimize Largest Contentful Paint for ${r.url}`);
      }
    });
  }
  
  if (results.loadTests.metrics && results.loadTests.metrics.errorRate > 0.01) {
    report.recommendations.push('Investigate and fix errors occurring under load');
  }
  
  // Save report
  const reportPath = path.join(reportDir, `performance-report-${Date.now()}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  
  // Generate HTML report
  const htmlReport = `
<!DOCTYPE html>
<html>
<head>
  <title>MaiFarm Performance Report - ${timestamp}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }
    h1, h2, h3 { color: #333; }
    .passed { color: #28a745; }
    .failed { color: #dc3545; }
    .metric { margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 4px; }
    .recommendation { padding: 10px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; margin: 5px 0; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #dee2e6; padding: 12px; text-align: left; }
    th { background: #f8f9fa; }
  </style>
</head>
<body>
  <h1>MaiFarm Performance Report</h1>
  <p>Generated: ${timestamp}</p>
  
  <h2>Summary</h2>
  <div class="metric">
    <strong>Overall Status:</strong> <span class="${report.summary.passed ? 'passed' : 'failed'}">${report.summary.passed ? 'PASSED' : 'FAILED'}</span>
  </div>
  
  <h2>Bundle Size Analysis</h2>
  <div class="metric">
    <strong>Status:</strong> <span class="${results.bundleSize.passed ? 'passed' : 'failed'}">${results.bundleSize.passed ? 'PASSED' : 'FAILED'}</span><br>
    <strong>Total Size:</strong> ${results.bundleSize.totalSizeMB}MB
  </div>
  
  <h2>Lighthouse Scores</h2>
  ${results.lighthouse.reports ? results.lighthouse.reports.map(r => `
    <div class="metric">
      <strong>URL:</strong> ${r.url}<br>
      <strong>Performance:</strong> ${r.scores.performance}/100<br>
      <strong>Accessibility:</strong> ${r.scores.accessibility}/100<br>
      <strong>Best Practices:</strong> ${r.scores.bestPractices}/100<br>
      <strong>SEO:</strong> ${r.scores.seo}/100
    </div>
  `).join('') : 'No Lighthouse data available'}
  
  <h2>Load Test Results</h2>
  <div class="metric">
    <strong>Status:</strong> <span class="${results.loadTests.passed ? 'passed' : 'failed'}">${results.loadTests.passed ? 'PASSED' : 'FAILED'}</span><br>
    ${results.loadTests.metrics ? `
      <strong>Error Rate:</strong> ${(results.loadTests.metrics.errorRate * 100).toFixed(2)}%<br>
      <strong>P95 Duration:</strong> ${results.loadTests.metrics.p95Duration}ms<br>
      <strong>P99 Duration:</strong> ${results.loadTests.metrics.p99Duration}ms<br>
      <strong>Requests/sec:</strong> ${results.loadTests.metrics.rps}
    ` : 'No load test data available'}
  </div>
  
  <h2>Recommendations</h2>
  ${report.recommendations.length > 0 ? report.recommendations.map(r => `
    <div class="recommendation">${r}</div>
  `).join('') : '<p>No specific recommendations. Performance is within acceptable limits.</p>'}
</body>
</html>
  `;
  
  const htmlPath = path.join(reportDir, `performance-report-${Date.now()}.html`);
  await fs.writeFile(htmlPath, htmlReport);
  
  log(`\n✅ Report generated:`, 'green');
  log(`   JSON: ${reportPath}`, 'green');
  log(`   HTML: ${htmlPath}`, 'green');
  
  return report;
}

// Main execution
async function main() {
  log('🚀 MaiFarm Performance Benchmarking', 'blue');
  log('=====================================\n', 'blue');
  
  const results = {
    bundleSize: await runBundleSizeAnalysis(),
    lighthouse: await runLighthouseTests(),
    loadTests: await runLoadTests(),
  };
  
  const report = await generateReport(results);
  
  log('\n=====================================', 'blue');
  if (report.summary.passed) {
    log('✅ All performance tests passed!', 'green');
    process.exit(0);
  } else {
    log('❌ Some performance tests failed!', 'red');
    process.exit(1);
  }
}

// Run tests
main().catch(error => {
  log('❌ Performance benchmarking failed', 'red');
  console.error(error);
  process.exit(1);
});