import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/apiClient';

interface RatingPromptState {
  isOpen: boolean;
  farmerId: string | null;
  farmerName: string | null;
  farmerIcon: string | null;
  farmId: string | null;
}

interface UseRatingPromptReturn {
  ratingPrompt: RatingPromptState;
  showRatingPrompt: (farmId: string, farmerId: string, farmerName: string, farmerIcon?: string) => void;
  closeRatingPrompt: () => void;
  checkForPendingRating: (farmId: string) => Promise<boolean>;
}

const RATING_STORAGE_KEY = 'maifarm_rated_farms';

/**
 * Hook to manage farmer rating prompts after farm completion
 *
 * Usage:
 * ```tsx
 * const { ratingPrompt, showRatingPrompt, closeRatingPrompt } = useRatingPrompt();
 *
 * // When farm completes
 * useEffect(() => {
 *   if (farm.status === 'completed' && farm.farmerTemplateId) {
 *     showRatingPrompt(farm.id, farm.farmerTemplateId, farm.farmerTemplateName);
 *   }
 * }, [farm.status]);
 *
 * // Render the modal
 * <FarmerRatingModal
 *   isOpen={ratingPrompt.isOpen}
 *   onClose={closeRatingPrompt}
 *   farmerId={ratingPrompt.farmerId!}
 *   farmerName={ratingPrompt.farmerName!}
 *   farmId={ratingPrompt.farmId!}
 * />
 * ```
 */
export function useRatingPrompt(): UseRatingPromptReturn {
  const [ratingPrompt, setRatingPrompt] = useState<RatingPromptState>({
    isOpen: false,
    farmerId: null,
    farmerName: null,
    farmerIcon: null,
    farmId: null,
  });

  // Get list of already-rated farm IDs from localStorage
  const getRatedFarms = useCallback((): Set<string> => {
    try {
      const stored = localStorage.getItem(RATING_STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  }, []);

  // Mark a farm as rated
  const markFarmAsRated = useCallback((farmId: string) => {
    try {
      const rated = getRatedFarms();
      rated.add(farmId);
      // Keep only last 100 entries to prevent unbounded growth
      const entries = Array.from(rated).slice(-100);
      localStorage.setItem(RATING_STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      console.error('[useRatingPrompt] Failed to save rated farm:', error);
    }
  }, [getRatedFarms]);

  // Check if a farm has already been rated
  const hasBeenRated = useCallback((farmId: string): boolean => {
    return getRatedFarms().has(farmId);
  }, [getRatedFarms]);

  // Show the rating prompt for a specific farm
  const showRatingPrompt = useCallback((
    farmId: string,
    farmerId: string,
    farmerName: string,
    farmerIcon?: string
  ) => {
    // Don't show if already rated
    if (hasBeenRated(farmId)) {
      console.log('[useRatingPrompt] Farm already rated, skipping prompt');
      return;
    }

    setRatingPrompt({
      isOpen: true,
      farmerId,
      farmerName,
      farmerIcon: farmerIcon || null,
      farmId,
    });
  }, [hasBeenRated]);

  // Close the rating prompt
  const closeRatingPrompt = useCallback(() => {
    // Mark as rated (even if skipped) to prevent showing again
    if (ratingPrompt.farmId) {
      markFarmAsRated(ratingPrompt.farmId);
    }

    setRatingPrompt({
      isOpen: false,
      farmerId: null,
      farmerName: null,
      farmerIcon: null,
      farmId: null,
    });
  }, [ratingPrompt.farmId, markFarmAsRated]);

  // Check if a farm should show a rating prompt
  const checkForPendingRating = useCallback(async (farmId: string): Promise<boolean> => {
    // Already rated locally
    if (hasBeenRated(farmId)) {
      return false;
    }

    // Optionally check with backend if user already rated this farm
    // This is useful if user rated on another device
    try {
      // For now, just use local storage check
      // In the future, could add: await api.farmerGroups.getUserRating(farmerId)
      return true;
    } catch {
      return true; // Show prompt if backend check fails
    }
  }, [hasBeenRated]);

  return {
    ratingPrompt,
    showRatingPrompt,
    closeRatingPrompt,
    checkForPendingRating,
  };
}

export default useRatingPrompt;
