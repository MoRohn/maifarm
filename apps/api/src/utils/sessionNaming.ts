/**
 * Utility for consistent tmux session naming across the application
 */

/**
 * Get standardized tmux session name for a farm
 * @param farmId - The farm ID
 * @returns Standardized session name
 */
export function getTmuxSessionName(farmId: string): string {
  // STANDARDIZED: All farms now use "farm-" prefix regardless of type
  // This simplifies terminal streaming and session management
  // Use only first 8 chars of UUID for tmux compatibility
  return `farm-${farmId.substring(0, 8)}`;
}

/**
 * Parse session name to extract farm ID
 * @param sessionName - The tmux session name
 * @returns The farm ID or null if not a valid session name
 */
export function getFarmIdFromSessionName(sessionName: string): string | null {
  // STANDARDIZED: All sessions now use "farm-" prefix
  // Support legacy "quick-" and "goWild-" for backward compatibility

  const legacyPrefixes = ['quick-', 'quick_', 'gowild-', 'goWild-', 'gowild_'];
  let extractedId: string | null = null;

  // Check for legacy prefixes first
  for (const prefix of legacyPrefixes) {
    if (sessionName.startsWith(prefix)) {
      const separator = sessionName.includes('_') ? '_' : '-';
      extractedId = sessionName.substring(sessionName.indexOf(separator) + 1);
      break;
    }
  }

  // Standard farm pattern
  if (!extractedId && (sessionName.startsWith('farm-') || sessionName.startsWith('farm_'))) {
    const separator = sessionName.includes('_') ? '_' : '-';
    extractedId = sessionName.substring(4 + separator.length);
  }

  if (!extractedId) {
    return null;
  }

  // If it's truncated (8 chars), we can't reconstruct the full UUID
  if (extractedId.length === 8) {
    return null;
  }

  // Return full UUID if available
  if (extractedId.includes('-') && extractedId.length >= 32) {
    return extractedId;
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

  // Check exact match first
  if (sessionName === expectedSessionName) {
    return true;
  }

  // Check for legacy formats (8-char truncated with old prefixes)
  const farmIdShort = farmId.substring(0, 8);
  const legacyFormats = [
    `farm-${farmIdShort}`,
    `farm_${farmIdShort}`,
    `quick-${farmIdShort}`,
    `quick_${farmIdShort}`,
    `gowild-${farmIdShort}`,
    `goWild-${farmIdShort}`
  ];

  return legacyFormats.includes(sessionName);
}