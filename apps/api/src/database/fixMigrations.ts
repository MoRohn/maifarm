import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Migration Fixer - Standardizes and fixes common migration issues
 * 
 * Issues addressed:
 * 1. UUID function inconsistency (uuid_generate_v4 vs gen_random_uuid)
 * 2. Array syntax (ARRAY[]::TEXT[] vs '{}')
 * 3. Foreign key ordering
 * 4. Extension dependencies
 */

interface MigrationFix {
  pattern: RegExp;
  replacement: string;
  description: string;
}

class MigrationFixer {
  private fixes: MigrationFix[] = [
    // Standardize UUID functions to gen_random_uuid (built-in, no extension needed)
    {
      pattern: /uuid_generate_v4\(\)/gi,
      replacement: 'gen_random_uuid()',
      description: 'Standardize UUID generation to gen_random_uuid()'
    },
    // Fix array syntax - convert ARRAY[]::TEXT[] to '{}'
    {
      pattern: /ARRAY\[\]::TEXT\[\]/gi,
      replacement: "'{}'::TEXT[]",
      description: 'Fix empty array syntax'
    },
    // Fix array syntax - convert ARRAY[]::UUID[] to '{}'
    {
      pattern: /ARRAY\[\]::UUID\[\]/gi,
      replacement: "'{}'::UUID[]",
      description: 'Fix empty UUID array syntax'
    },
    // Remove uuid-ossp extension (not needed with gen_random_uuid)
    {
      pattern: /CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n?/gi,
      replacement: '',
      description: 'Remove uuid-ossp extension (not needed)'
    }
  ];

  private migrationOrder = [
    '001_core_schema.sql',
    '002_monitoring_analytics.sql',
    '003_harvest_workflow.sql',
    '004_security_api.sql',
    '005_cluster_providers.sql'
  ];

  async fixMigrations(): Promise<void> {
    console.log('🔧 Starting migration fixes...\n');

    const migrationsDir = path.join(__dirname, 'migrations');
    const backupDir = path.join(__dirname, 'migrations_backup');

    // Create backup directory
    await fs.mkdir(backupDir, { recursive: true });

    for (const filename of this.migrationOrder) {
      const filePath = path.join(migrationsDir, filename);
      const backupPath = path.join(backupDir, filename);

      try {
        // Read original content
        let content = await fs.readFile(filePath, 'utf-8');
        const originalContent = content;

        // Create backup
        await fs.writeFile(backupPath, originalContent);
        console.log(`📦 Backed up: ${filename}`);

        // Apply fixes
        let fixCount = 0;
        for (const fix of this.fixes) {
          const matches = content.match(fix.pattern);
          if (matches) {
            content = content.replace(fix.pattern, fix.replacement);
            fixCount += matches.length;
            console.log(`  ✓ ${fix.description}: ${matches.length} occurrences`);
          }
        }

        // Special handling for foreign key ordering in migration 003
        if (filename === '003_harvest_workflow.sql') {
          content = this.fixForeignKeyOrdering(content);
        }

        // Write fixed content
        if (fixCount > 0 || content !== originalContent) {
          await fs.writeFile(filePath, content);
          console.log(`✅ Fixed: ${filename} (${fixCount} fixes applied)\n`);
        } else {
          console.log(`✓ No fixes needed: ${filename}\n`);
        }

      } catch (error) {
        console.error(`❌ Error processing ${filename}:`, error);
      }
    }

    console.log('✨ Migration fixes complete!');
  }

  private fixForeignKeyOrdering(content: string): string {
    // Move foreign key additions to the end of the migration
    const fkPattern = /ALTER TABLE farms ADD CONSTRAINT farms_seed_id_fkey[\s\S]*?ON DELETE SET NULL;/g;
    const fkStatements = content.match(fkPattern) || [];
    
    if (fkStatements.length > 0) {
      // Remove FK statements from their current position
      content = content.replace(fkPattern, '');
      
      // Add them before the final COMMIT
      const commitIndex = content.lastIndexOf('COMMIT;');
      if (commitIndex > -1) {
        const beforeCommit = content.slice(0, commitIndex);
        const afterCommit = content.slice(commitIndex);
        
        content = beforeCommit + '\n-- Foreign keys added after table creation\n' + 
                 fkStatements.join('\n') + '\n\n' + afterCommit;
      }
      
      console.log('  ✓ Reordered foreign key constraints');
    }
    
    return content;
  }

  async validateMigrations(): Promise<boolean> {
    console.log('\n🔍 Validating migrations...\n');
    
    const migrationsDir = path.join(__dirname, 'migrations');
    let hasIssues = false;

    for (const filename of this.migrationOrder) {
      const filePath = path.join(migrationsDir, filename);
      
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const issues: string[] = [];

        // Check for uuid_generate_v4
        if (content.includes('uuid_generate_v4()')) {
          issues.push('Still uses uuid_generate_v4()');
        }

        // Check for ARRAY[]::TEXT[]
        if (content.includes('ARRAY[]::TEXT[]')) {
          issues.push('Still uses ARRAY[]::TEXT[] syntax');
        }

        // Check for uuid-ossp extension
        if (content.includes('uuid-ossp')) {
          issues.push('Still references uuid-ossp extension');
        }

        if (issues.length > 0) {
          console.log(`⚠️  ${filename}:`);
          issues.forEach(issue => console.log(`    - ${issue}`));
          hasIssues = true;
        } else {
          console.log(`✅ ${filename}: Valid`);
        }

      } catch (error) {
        console.error(`❌ Error validating ${filename}:`, error);
        hasIssues = true;
      }
    }

    return !hasIssues;
  }

  async restoreBackups(): Promise<void> {
    console.log('\n🔄 Restoring migrations from backup...\n');
    
    const migrationsDir = path.join(__dirname, 'migrations');
    const backupDir = path.join(__dirname, 'migrations_backup');

    for (const filename of this.migrationOrder) {
      const backupPath = path.join(backupDir, filename);
      const filePath = path.join(migrationsDir, filename);

      try {
        const backupExists = await fs.access(backupPath).then(() => true).catch(() => false);
        if (backupExists) {
          const content = await fs.readFile(backupPath, 'utf-8');
          await fs.writeFile(filePath, content);
          console.log(`✅ Restored: ${filename}`);
        }
      } catch (error) {
        console.error(`❌ Error restoring ${filename}:`, error);
      }
    }
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const fixer = new MigrationFixer();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'restore':
      fixer.restoreBackups().catch(console.error);
      break;
    case 'validate':
      fixer.validateMigrations().then(isValid => {
        process.exit(isValid ? 0 : 1);
      }).catch(console.error);
      break;
    default:
      fixer.fixMigrations()
        .then(() => fixer.validateMigrations())
        .catch(console.error);
  }
}

export default MigrationFixer;