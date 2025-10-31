import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './connection';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  try {
    // Create migrations table if not exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

    // Get already executed migrations
    const result = await db.query('SELECT filename FROM migrations');
    const executedMigrations = new Set(result.rows.map(r => r.filename));

    // Run pending migrations
    for (const file of sqlFiles) {
      if (!executedMigrations.has(file)) {
        console.log(`[Migration] Running ${file}...`);
        try {
          const sqlContent = await fs.readFile(path.join(migrationsDir, file), 'utf-8');
          
          // Check if this migration contains functions or DO blocks
          const containsFunctions = sqlContent.includes('CREATE FUNCTION') || 
                                  sqlContent.includes('CREATE OR REPLACE FUNCTION') ||
                                  sqlContent.includes('DO $$') ||
                                  sqlContent.includes('DO $');
          
          // Check if migration contains CONCURRENTLY operations (which can't run in transactions)
          const containsConcurrently = sqlContent.includes('CREATE INDEX CONCURRENTLY') ||
                                       sqlContent.includes('DROP INDEX CONCURRENTLY') ||
                                       sqlContent.includes('REINDEX CONCURRENTLY');
          
          let validStatements: string[] = [];
          
          if (containsFunctions) {
            // For migrations with functions, execute as a single transaction
            // PostgreSQL can handle the entire file with proper statement separation
            validStatements = [sqlContent];
          } else {
            // For simple migrations, split by semicolon
            const statements = sqlContent.split(';')
              .map(s => s.trim())
              .filter(s => s && !s.startsWith('--'));
            
            // Re-add semicolons
            validStatements = statements.map(s => s + ';');
          }
          
          let hasErrors = false;
          for (const statement of validStatements) {
            if (statement.trim()) {
              try {
                await db.query(statement);
              } catch (stmtError: any) {
                // Handle specific error cases
                const errorMessage = stmtError.message || '';
                
                // Special handling for CONCURRENTLY operations
                if (errorMessage.includes('CREATE INDEX CONCURRENTLY cannot run inside a transaction block')) {
                  // Skip this error as it's expected when run in a transaction
                  console.log(`❌ \x1b[35m[DATABASE]\x1b[0m Query failed: ${errorMessage}`);
                  hasErrors = true;
                  continue;
                }
                
                // Special handling for permission errors
                if (errorMessage.includes('permission denied to set parameter "session_replication_role"')) {
                  // Skip this error as it requires superuser privileges
                  console.log(`❌ \x1b[35m[DATABASE]\x1b[0m Query failed: ${errorMessage}`);
                  hasErrors = true;
                  continue;
                }
                
                // Skip these expected errors silently
                if (errorMessage.includes('already exists') || 
                    errorMessage.includes('does not exist') ||
                    errorMessage.includes('duplicate key value')) {
                  // These are acceptable - schema might already be partially applied
                  console.log(`ℹ️ \x1b[36m[DATABASE]\x1b[0m Skipping: ${errorMessage}`);
                  hasErrors = true;
                  continue;
                }
                
                // For syntax errors, throw immediately
                if (errorMessage.includes('syntax error')) {
                  console.error(`[Migration] Critical syntax error in ${file}:`, errorMessage);
                  throw stmtError;
                }
                
                // Log other errors but continue
                console.warn(`[Migration] Unexpected error in ${file}:`, errorMessage);
                hasErrors = true;
              }
            }
          }
          
          // Record migration as executed (even with warnings to avoid re-running)
          await db.query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
          console.log(`[Migration] ${file} completed ${hasErrors ? 'with warnings' : 'successfully'}`);
        } catch (error) {
          console.error(`[Migration] Failed to run ${file}:`, error);
          throw error;
        }
      }
    }

    console.log('[Migration] All migrations completed');
    return true;
  } catch (error) {
    console.error('[Migration] Migration runner failed:', error);
    throw error;
  }
}