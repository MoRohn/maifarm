#!/usr/bin/env node

/**
 * Systematic TypeScript Error Fixer for MaiFarm
 * Automatically fixes common TypeScript errors based on patterns
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

class TypeScriptFixer {
  constructor() {
    this.fixedFiles = new Set();
    this.errors = [];
    this.fixes = [];
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
  }

  async getTypeScriptErrors() {
    this.log('🔍 Collecting TypeScript errors...');
    
    try {
      execSync('npx tsc --noEmit', { 
        cwd: rootDir, 
        stdio: 'pipe',
        encoding: 'utf8' 
      });
      this.log('✅ No TypeScript compilation errors found');
      return [];
    } catch (error) {
      const output = error.stdout || error.stderr || '';
      const lines = output.split('\n').filter(line => line.includes('error TS'));
      
      const errors = lines.map(line => {
        const match = line.match(/(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)/);
        if (match) {
          const [, file, row, col, code, message] = match;
          return {
            file: file.replace(rootDir + '/', ''),
            line: parseInt(row),
            column: parseInt(col),
            code,
            message,
            fullLine: line
          };
        }
        return null;
      }).filter(Boolean);
      
      this.log(`❌ Found ${errors.length} TypeScript errors`);
      return errors;
    }
  }

  async fixMissingImports() {
    this.log('🔧 Fixing missing imports...');
    
    const missingImports = this.errors.filter(error => 
      error.code === 'TS2304' || 
      error.code === 'TS2307' ||
      error.message.includes('Cannot find name')
    );

    for (const error of missingImports) {
      await this.fixMissingImport(error);
    }
  }

  async fixMissingImport(error) {
    const filePath = path.join(rootDir, error.file);
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let modified = false;

    // Common missing imports and their fixes
    const importFixes = {
      'ChevronDown': "import { ChevronDown } from 'lucide-react';",
      'FileCode': "import { FileCode } from 'lucide-react';",
      'React': "import React from 'react';",
      'useState': "import { useState } from 'react';",
      'useEffect': "import { useEffect } from 'react';",
      'motion': "import { motion } from 'framer-motion';",
    };

    // Extract the missing identifier
    const missingName = this.extractMissingIdentifier(error.message);
    
    if (missingName && importFixes[missingName]) {
      // Check if import already exists
      if (!content.includes(importFixes[missingName])) {
        // Find the best place to add the import
        const importIndex = this.findImportInsertionPoint(lines);
        lines.splice(importIndex, 0, importFixes[missingName]);
        modified = true;
        
        this.fixes.push({
          file: error.file,
          type: 'Missing Import',
          fix: `Added: ${importFixes[missingName]}`,
          line: error.line
        });
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, lines.join('\n'));
      this.fixedFiles.add(error.file);
    }
  }

  extractMissingIdentifier(message) {
    const match = message.match(/Cannot find name '([^']+)'/) || 
                  message.match(/Cannot find module '([^']+)'/);
    return match ? match[1] : null;
  }

  findImportInsertionPoint(lines) {
    // Find the last import statement
    let lastImportIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) {
        lastImportIndex = i;
      }
    }
    return lastImportIndex + 1;
  }

  async fixPropertyAccessErrors() {
    this.log('🔧 Fixing property access errors...');
    
    const propertyErrors = this.errors.filter(error => 
      error.code === 'TS2339' && 
      error.message.includes('Property') && 
      error.message.includes('does not exist on type')
    );

    for (const error of propertyErrors) {
      await this.fixPropertyAccess(error);
    }
  }

  async fixPropertyAccess(error) {
    const filePath = path.join(rootDir, error.file);
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const targetLine = lines[error.line - 1];
    
    if (!targetLine) return;

    let modified = false;
    let newLine = targetLine;

    // Extract property name from error message
    const propertyMatch = error.message.match(/Property '([^']+)' does not exist/);
    if (!propertyMatch) return;
    
    const propertyName = propertyMatch[1];

    // Common fixes for property access errors
    if (propertyName === 'disabled' || propertyName === 'min' || propertyName === 'max' || propertyName === 'step') {
      // Add optional chaining or type guard
      if (targetLine.includes(`${propertyName}`)) {
        // Try to add optional chaining
        newLine = targetLine.replace(
          new RegExp(`\\.${propertyName}\\b`), 
          `.${propertyName}?`
        );
        
        // If that doesn't work, try nullish coalescing
        if (newLine === targetLine) {
          newLine = targetLine.replace(
            new RegExp(`([a-zA-Z_$][a-zA-Z0-9_$]*)\\.${propertyName}\\b`),
            `($1 as any)?.${propertyName}`
          );
        }
        
        if (newLine !== targetLine) {
          modified = true;
        }
      }
    }

    if (modified) {
      lines[error.line - 1] = newLine;
      fs.writeFileSync(filePath, lines.join('\n'));
      this.fixedFiles.add(error.file);
      
      this.fixes.push({
        file: error.file,
        type: 'Property Access',
        fix: `Fixed property access: ${propertyName}`,
        line: error.line,
        before: targetLine.trim(),
        after: newLine.trim()
      });
    }
  }

  async fixTypeAssignmentErrors() {
    this.log('🔧 Fixing type assignment errors...');
    
    const assignmentErrors = this.errors.filter(error => 
      error.code === 'TS2322' && 
      error.message.includes('is not assignable to type')
    );

    for (const error of assignmentErrors) {
      await this.fixTypeAssignment(error);
    }
  }

  async fixTypeAssignment(error) {
    const filePath = path.join(rootDir, error.file);
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const targetLine = lines[error.line - 1];
    
    if (!targetLine) return;

    let modified = false;
    let newLine = targetLine;

    // Common type assignment fixes
    if (error.message.includes('string\' is not assignable to type \'Date\'')) {
      // Convert string to Date
      newLine = targetLine.replace(
        /(['"][\d-T:\.Z]+['"])/g,
        'new Date($1)'
      );
      modified = newLine !== targetLine;
    } else if (error.message.includes('number\' is not assignable to type \'string\'')) {
      // Convert number to string
      newLine = targetLine.replace(
        /(\d+)/g,
        '$1.toString()'
      );
      modified = newLine !== targetLine;
    } else if (error.message.includes('undefined\' is not assignable')) {
      // Add null/undefined checks
      const match = targetLine.match(/(\w+)\s*:/);
      if (match) {
        const varName = match[1];
        newLine = targetLine.replace(
          new RegExp(`${varName}\\s*:`),
          `${varName}!:`
        );
        modified = newLine !== targetLine;
      }
    }

    if (modified) {
      lines[error.line - 1] = newLine;
      fs.writeFileSync(filePath, lines.join('\n'));
      this.fixedFiles.add(error.file);
      
      this.fixes.push({
        file: error.file,
        type: 'Type Assignment',
        fix: 'Fixed type assignment mismatch',
        line: error.line,
        before: targetLine.trim(),
        after: newLine.trim()
      });
    }
  }

  async fixArgumentTypeErrors() {
    this.log('🔧 Fixing argument type errors...');
    
    const argumentErrors = this.errors.filter(error => 
      error.code === 'TS2345'
    );

    for (const error of argumentErrors) {
      await this.fixArgumentType(error);
    }
  }

  async fixArgumentType(error) {
    const filePath = path.join(rootDir, error.file);
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const targetLine = lines[error.line - 1];
    
    if (!targetLine) return;

    let modified = false;
    let newLine = targetLine;

    // Add type assertions for common cases
    if (error.message.includes('MouseEvent') && error.message.includes('number')) {
      // Fix event handler parameter issues
      newLine = targetLine.replace(
        /onClick=\{([^}]+)\}/g,
        'onClick={(event) => $1}'
      );
      modified = newLine !== targetLine;
    }

    if (modified) {
      lines[error.line - 1] = newLine;
      fs.writeFileSync(filePath, lines.join('\n'));
      this.fixedFiles.add(error.file);
      
      this.fixes.push({
        file: error.file,
        type: 'Argument Type',
        fix: 'Fixed argument type mismatch',
        line: error.line,
        before: targetLine.trim(),
        after: newLine.trim()
      });
    }
  }

  async fixImplicitAnyErrors() {
    this.log('🔧 Fixing implicit any errors...');
    
    const anyErrors = this.errors.filter(error => 
      error.code === 'TS7006' || 
      error.code === 'TS7053'
    );

    for (const error of anyErrors) {
      await this.fixImplicitAny(error);
    }
  }

  async fixImplicitAny(error) {
    const filePath = path.join(rootDir, error.file);
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const targetLine = lines[error.line - 1];
    
    if (!targetLine) return;

    let modified = false;
    let newLine = targetLine;

    if (error.code === 'TS7006' && error.message.includes('implicitly has an \'any\' type')) {
      // Add type annotations for parameters
      const paramMatch = targetLine.match(/\(([^)]*)\)\s*=>/);
      if (paramMatch) {
        const param = paramMatch[1].trim();
        if (!param.includes(':')) {
          newLine = targetLine.replace(
            `(${param})`,
            `(${param}: any)`
          );
          modified = true;
        }
      }
    } else if (error.code === 'TS7053') {
      // Fix index signature issues
      if (targetLine.includes('[') && targetLine.includes(']')) {
        newLine = targetLine.replace(
          /\[([^\]]+)\]/g,
          '[$1 as keyof typeof object]'
        );
        modified = newLine !== targetLine;
      }
    }

    if (modified) {
      lines[error.line - 1] = newLine;
      fs.writeFileSync(filePath, lines.join('\n'));
      this.fixedFiles.add(error.file);
      
      this.fixes.push({
        file: error.file,
        type: 'Implicit Any',
        fix: 'Added type annotation',
        line: error.line,
        before: targetLine.trim(),
        after: newLine.trim()
      });
    }
  }

  async fixJestExtendErrors() {
    this.log('🔧 Fixing Jest extend errors...');
    
    const jestErrors = this.errors.filter(error =>
      error.message.includes('toBeInTheDocument') ||
      error.message.includes('toBeDisabled') ||
      error.message.includes('jest')
    );

    if (jestErrors.length > 0) {
      // Fix Jest setup
      const setupPath = path.join(rootDir, 'tests/unit/setup.ts');
      if (fs.existsSync(setupPath)) {
        const content = fs.readFileSync(setupPath, 'utf8');
        if (!content.includes('@testing-library/jest-dom')) {
          const newContent = `import '@testing-library/jest-dom';\n${content}`;
          fs.writeFileSync(setupPath, newContent);
          
          this.fixes.push({
            file: 'tests/unit/setup.ts',
            type: 'Jest Setup',
            fix: 'Added @testing-library/jest-dom import',
            line: 1
          });
        }
      }
    }
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalErrors: this.errors.length,
        fixesApplied: this.fixes.length,
        filesModified: this.fixedFiles.size
      },
      fixes: this.fixes,
      modifiedFiles: Array.from(this.fixedFiles)
    };

    const reportPath = path.join(rootDir, 'reports', `typescript-fixes-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    this.log(`📊 Fix report generated: ${reportPath}`);
    return report;
  }

  async run() {
    this.log('🚀 Starting TypeScript error fixing...');
    
    // Get current errors
    this.errors = await this.getTypeScriptErrors();
    
    if (this.errors.length === 0) {
      this.log('🎉 No TypeScript errors to fix!');
      return;
    }

    // Apply fixes in order of priority
    await this.fixMissingImports();
    await this.fixJestExtendErrors();
    await this.fixPropertyAccessErrors();
    await this.fixTypeAssignmentErrors();
    await this.fixArgumentTypeErrors();
    await this.fixImplicitAnyErrors();

    // Generate report
    const report = this.generateReport();
    
    this.log(`\n📊 TYPESCRIPT FIXING COMPLETE`);
    this.log(`==============================`);
    this.log(`Total Errors: ${report.summary.totalErrors}`);
    this.log(`Fixes Applied: ${report.summary.fixesApplied}`);
    this.log(`Files Modified: ${report.summary.filesModified}`);
    this.log(`==============================`);

    // Check remaining errors
    const remainingErrors = await this.getTypeScriptErrors();
    this.log(`Remaining Errors: ${remainingErrors.length}`);
    
    if (remainingErrors.length > 0) {
      this.log('⚠️ Some errors still remain. Manual intervention may be required.');
    } else {
      this.log('🎉 All TypeScript errors have been resolved!');
    }

    return report;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const fixer = new TypeScriptFixer();
  fixer.run().catch(console.error);
}

export default TypeScriptFixer;