// Database client module - re-exports database connection for services
// This file resolves the missing module error in seedService.ts

export { db, redis, redisPub, redisSub, checkDatabaseHealth, initializeDatabase, closeDatabaseConnections } from './connection';

// Re-export the main database connection as 'client' for backward compatibility
export { db as client } from './connection';

// Export types for TypeScript
export type { Pool } from 'pg';