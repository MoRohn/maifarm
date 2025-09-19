/**
 * Utility for consistent tmux session naming across the application
 */

/**
 * Get standardized tmux session name for a farm
 * @param farmId - The farm ID
 * @returns Standardized session name
 */
export function getTmuxSessionName(farmId: string): string {
  // Quick task sessions - use only first 8 chars of UUID for compatibility
  // Many tmux versions have issues with very long session names
  if (farmId.startsWith('quick-task-')) {
    const taskId = farmId.replace('quick-task-', '');
    // Use underscore and truncate to 8 chars for compatibility
    return `quick_${taskId.substring(0, 8)}`;
  }
  
  // GoWild sessions - use only first 8 chars of UUID
  if (farmId.startsWith('gowild-') || farmId.startsWith('goWild-')) {
    const idPart = farmId.substring(farmId.indexOf('-') + 1);
    // Use dash and truncate to 8 chars
    return `goWild-${idPart.substring(0, 8)}`;
  }
  
  // Standard farm sessions - use only first 8 chars of UUID
  // This maintains compatibility with existing sessions
  return `farm-${farmId.substring(0, 8)}`;
}

/**
 * Parse session name to extract farm ID
 * @param sessionName - The tmux session name
 * @returns The farm ID or null if not a valid session name
 */
export function getFarmIdFromSessionName(sessionName: string): string | null {
  // Quick task patterns (both dash and underscore for legacy support)
  if (sessionName.startsWith('quick-') || sessionName.startsWith('quick_')) {
    const separator = sessionName.includes('-') ? '-' : '_';
    const taskId = sessionName.substring(5 + separator.length);
    
    // If taskId is only 8 characters, it's a truncated UUID and we can't use it
    // Return null to indicate we can't determine the full farm ID
    if (taskId.length === 8) {
      return null; // Can't reconstruct full UUID from truncated version
    }
    
    // For full UUIDs, check if it's actually a quick-task farm ID format
    if (taskId.includes('-') && taskId.length >= 32) {
      return taskId; // Return the full UUID directly
    }
    
    return null;
  }
  
  // GoWild patterns (both dash and underscore for legacy support)
  if (sessionName.startsWith('gowild-') || sessionName.startsWith('goWild-') || sessionName.startsWith('gowild_')) {
    const separator = sessionName.includes('_') ? '_' : '-';
    const idPart = sessionName.substring(sessionName.indexOf(separator) + 1);
    
    // If it's truncated (8 chars), we can't use it
    if (idPart.length === 8) {
      return null;
    }
    
    // Return full UUID if available
    if (idPart.includes('-') && idPart.length >= 32) {
      return idPart;
    }
    
    return null;
  }
  
  // Standard farm patterns (both dash and underscore for legacy support)
  if (sessionName.startsWith('farm-') || sessionName.startsWith('farm_')) {
    const separator = sessionName.includes('_') ? '_' : '-';
    const farmId = sessionName.substring(4 + separator.length);
    
    // If it's truncated (8 chars), we can't use it
    if (farmId.length === 8) {
      return null;
    }
    
    // Return full UUID if available
    if (farmId.includes('-') && farmId.length >= 32) {
      return farmId;
    }
    
    return null;
  }
  
  return null;
}

/**
 * Check if a session name matches a farm ID
 * @param sessionName - The tmux session name
 * @param farmId - The farm ID to check against
 * @returns True if the session belongs to the farm
 */
export function isSessionForFarm(sessionName: string, farmId: string): boolean {
  const expectedSessionName = getTmuxSessionName(farmId);
  
  // Also check for legacy formats (8-char truncated)
  const legacyFormats = [
    `farm-${farmId.substring(0, 8)}`,
    `farm_${farmId.substring(0, 8)}`,
    `quick_${farmId.replace('quick-task-', '').substring(0, 8)}`
  ];
  
  return sessionName === expectedSessionName || legacyFormats.includes(sessionName);
}