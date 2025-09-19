import { createHash } from 'crypto';

/**
 * System UUID utilities for generating consistent, shorter UUIDs
 * These are still valid UUIDs but use a deterministic approach
 */

/**
 * Generate a valid UUID v5 from a namespace and name
 * This creates consistent UUIDs for system entities
 */
function generateSystemUuid(name: string): string {
  // Use a namespace UUID for MaiFarm system entities
  const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // Standard namespace UUID
  
  // Create a shorter hash-based UUID that's still valid
  const hash = createHash('sha1')
    .update(namespace.replace(/-/g, ''), 'hex')
    .update(name, 'utf8')
    .digest();
  
  // Format as a valid UUID v5
  const uuid = [
    hash.toString('hex', 0, 4),
    hash.toString('hex', 4, 6),
    ((hash[6] & 0x0f) | 0x50).toString(16) + hash.toString('hex', 7, 8),
    ((hash[8] & 0x3f) | 0x80).toString(16) + hash.toString('hex', 9, 10),
    hash.toString('hex', 10, 16)
  ].join('-');
  
  return uuid;
}

// System UUIDs that match the users table entries
// These must exist in the users table for foreign key constraints
export const SYSTEM_UUIDS = {
  SYSTEM: '7aa39a77-a7d9-53e3-883a-e56de58fa8b3',           // System operations
  XENOSYNC: '8e93c7cd-1ecb-50f9-b86e-98e5e4b7b821',        // XenoSync operations
  ORCHESTRATOR: 'e967e54f-7093-50fa-9502-3c54f0c10c96',    // Orchestrator operations
  HARVEST: 'c1f90e36-5b08-599d-ba3e-6bc33ddca0fe',         // Harvest operations
  BARN: 'd1406063-b7c5-5f77-8c0f-5c61f86ae2ce',            // Barn operations
  SEED: 'd8e43308-c873-50f2-89d0-f96bd6e16754',            // Seed operations
  AUTO: '7e03c93c-2ab3-5e5f-bd0f-c98e7e6e7e63',            // Automated operations
  GUEST: 'a913e59f-3971-5f06-be81-afa2ef2fa862',           // Guest/anonymous operations
  DEFAULT: 'd38c8b74-e73d-5de4-b80f-c9f8cbe96e83',         // Default fallback
} as const;

// The main system UUID to use for most system operations
export const SYSTEM_UUID = SYSTEM_UUIDS.SYSTEM;

// Legacy long UUID for backward compatibility
export const LEGACY_SYSTEM_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Check if a string is a valid UUID format
 */
export function isValidUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Normalize a createdBy value to a valid UUID
 * Converts known string values to appropriate system UUIDs
 */
export function normalizeCreatedBy(createdBy: string | null | undefined): string | null {
  if (!createdBy) return null;
  
  // Check if it's already a valid UUID
  if (isValidUuid(createdBy)) {
    // Convert legacy long UUID to shorter system UUID
    if (createdBy === LEGACY_SYSTEM_UUID) {
      return SYSTEM_UUID;
    }
    return createdBy;
  }
  
  // Map string values to appropriate system UUIDs
  const mappings: Record<string, string> = {
    'system': SYSTEM_UUIDS.SYSTEM,
    'sys': SYSTEM_UUIDS.SYSTEM,
    'xenosync': SYSTEM_UUIDS.XENOSYNC,
    'xeno': SYSTEM_UUIDS.XENOSYNC,
    'orchestrator': SYSTEM_UUIDS.ORCHESTRATOR,
    'orch': SYSTEM_UUIDS.ORCHESTRATOR,
    'harvest': SYSTEM_UUIDS.HARVEST,
    'barn': SYSTEM_UUIDS.BARN,
    'seed': SYSTEM_UUIDS.SEED,
    'auto': SYSTEM_UUIDS.AUTO,
    'automated': SYSTEM_UUIDS.AUTO,
    'guest': SYSTEM_UUIDS.GUEST,
    'anonymous': SYSTEM_UUIDS.GUEST,
  };
  
  const lowerCreatedBy = createdBy.toLowerCase();
  if (mappings[lowerCreatedBy]) {
    return mappings[lowerCreatedBy];
  }
  
  // For any other non-UUID string, use default system UUID
  console.warn(`[SystemUUIDs] Converting unknown createdBy value "${createdBy}" to default system UUID`);
  return SYSTEM_UUIDS.DEFAULT;
}

// Export individual UUIDs for convenience
export const {
  SYSTEM: SYS_UUID,
  XENOSYNC: XENO_UUID,
  ORCHESTRATOR: ORCH_UUID,
  HARVEST: HARV_UUID,
  BARN: BARN_UUID,
  SEED: SEED_UUID,
  AUTO: AUTO_UUID,
  GUEST: GUEST_UUID,
  DEFAULT: DEFAULT_UUID
} = SYSTEM_UUIDS;