/**
 * SeedApplier Component
 *
 * Allows users to select multiple Seeds to apply to a Farm during creation.
 * Seeds are first-class context modules that get injected at the top
 * of the prompt/context window for all AI engines.
 *
 * Feature A: Seeds can "Seed a Farm"
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sprout,
  Search,
  X,
  Check,
  AlertCircle,
  Info,
  Tag,
  Zap,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { clsx } from 'clsx';
import { Seed, SeedFilter, FarmModeType, AIEngineType } from '@/types/seed';
import { useSeeds, useSeedCategories } from '@/hooks/useSeeds';
import { seedService } from '@/services/seedService';

interface SeedApplierProps {
  selectedSeedIds: string[];
  onSeedsChange: (seedIds: string[]) => void;
  mode?: FarmModeType;
  engine?: AIEngineType;
  maxSeeds?: number;
  className?: string;
}

interface CompatibilityResult {
  compatible: boolean;
  incompatibleSeeds: Array<{ seedId: string; reason: string }>;
  warnings: string[];
}

export const SeedApplier: React.FC<SeedApplierProps> = ({
  selectedSeedIds,
  onSeedsChange,
  mode = 'harvest',
  engine = 'claude',
  maxSeeds = 5,
  className
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [compatibility, setCompatibility] = useState<CompatibilityResult | null>(null);
  const [validating, setValidating] = useState(false);

  // Use existing hooks
  const seedFilter: SeedFilter = {
    category: selectedCategory || undefined,
    search: searchTerm || undefined
  };
  const { seeds, loading, error } = useSeeds(seedFilter);
  const { categories } = useSeedCategories();

  // Validate compatibility when selection changes
  const validateSelection = useCallback(async (seedIds: string[]) => {
    if (seedIds.length === 0) {
      setCompatibility(null);
      return;
    }

    try {
      setValidating(true);
      const result = await seedService.validateCompatibility(seedIds, mode, engine);
      setCompatibility(result);
    } catch (err) {
      console.error('Failed to validate compatibility:', err);
    } finally {
      setValidating(false);
    }
  }, [mode, engine]);

  const toggleSeed = useCallback((seedId: string) => {
    let newSelection: string[];
    if (selectedSeedIds.includes(seedId)) {
      newSelection = selectedSeedIds.filter(id => id !== seedId);
    } else if (selectedSeedIds.length < maxSeeds) {
      newSelection = [...selectedSeedIds, seedId];
    } else {
      return; // Max reached
    }
    onSeedsChange(newSelection);
    validateSelection(newSelection);
  }, [selectedSeedIds, onSeedsChange, maxSeeds, validateSelection]);

  const getSelectedSeeds = useCallback(() => {
    return seeds.filter(s => selectedSeedIds.includes(s.id));
  }, [seeds, selectedSeedIds]);

  const isIncompatible = (seedId: string) => {
    return compatibility?.incompatibleSeeds.some(inc => inc.seedId === seedId) || false;
  };

  const getIncompatibleReason = (seedId: string) => {
    return compatibility?.incompatibleSeeds.find(inc => inc.seedId === seedId)?.reason;
  };

  return (
    <div className={clsx('space-y-3', className)}>
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/10"
      >
        <div className="flex items-center gap-2">
          <Sprout className="h-5 w-5 text-emerald-400" />
          <span className="font-medium text-white">Apply Seeds to Farm</span>
          {selectedSeedIds.length > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {selectedSeedIds.length} selected
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pt-2">
              {/* Info Banner */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-300 leading-relaxed">
                  Seeds are context modules that guide your AI agents. They're injected at the top
                  of the prompt window and influence all agent interactions during the farm session.
                </p>
              </div>

              {/* Search and Category Filter */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search seeds..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/5 border border-white/10
                             text-white placeholder-gray-500 text-sm
                             focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                  />
                </div>
                <select
                  value={selectedCategory || ''}
                  onChange={(e) => setSelectedCategory(e.target.value || null)}
                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm
                           focus:border-emerald-500/50 focus:outline-none cursor-pointer"
                >
                  <option value="">All Categories</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Selected Seeds Pills */}
              {selectedSeedIds.length > 0 && (
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex flex-wrap gap-2">
                    {getSelectedSeeds().map(seed => (
                      <span
                        key={seed.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full
                                 bg-emerald-500/20 text-emerald-300 text-xs border border-emerald-500/30"
                      >
                        <Sprout className="h-3 w-3" />
                        {seed.name}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSeed(seed.id);
                          }}
                          className="ml-1 hover:text-white transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Compatibility Warnings */}
              {compatibility && compatibility.warnings.length > 0 && (
                <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-yellow-300 space-y-1">
                      {compatibility.warnings.map((warning, i) => (
                        <p key={i}>{warning}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Loading State */}
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" />
                  <span className="ml-2 text-sm text-gray-400">Loading seeds...</span>
                </div>
              ) : error ? (
                <div className="flex items-center gap-2 py-4 text-red-400 justify-center">
                  <AlertCircle className="h-5 w-5" />
                  <span className="text-sm">{error}</span>
                </div>
              ) : seeds.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <Sprout className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No seeds found</p>
                </div>
              ) : (
                /* Seeds List */
                <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
                  {seeds.map(seed => {
                    const isSelected = selectedSeedIds.includes(seed.id);
                    const incompatible = isIncompatible(seed.id);
                    const reason = getIncompatibleReason(seed.id);

                    return (
                      <motion.button
                        key={seed.id}
                        onClick={() => toggleSeed(seed.id)}
                        disabled={incompatible && !isSelected}
                        className={clsx(
                          'w-full p-3 rounded-lg border text-left transition-all',
                          isSelected
                            ? 'bg-emerald-500/15 border-emerald-500/40'
                            : incompatible
                            ? 'bg-red-500/10 border-red-500/30 opacity-50 cursor-not-allowed'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                        )}
                        whileHover={!incompatible ? { scale: 1.005 } : {}}
                        whileTap={!incompatible ? { scale: 0.995 } : {}}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={clsx(
                                'font-medium text-sm truncate',
                                isSelected ? 'text-emerald-300' : 'text-white'
                              )}>
                                {seed.name}
                              </span>
                              {seed.isOfficial && (
                                <Zap className="h-3 w-3 text-yellow-400 flex-shrink-0" title="Official Seed" />
                              )}
                            </div>
                            <p className="text-xs text-gray-400 line-clamp-2 mt-1">
                              {seed.description}
                            </p>
                            {seed.tags && seed.tags.length > 0 && (
                              <div className="flex items-center gap-1 mt-2">
                                <Tag className="h-3 w-3 text-gray-500" />
                                <div className="flex gap-1 flex-wrap">
                                  {seed.tags.slice(0, 3).map(tag => (
                                    <span
                                      key={tag}
                                      className="px-1.5 py-0.5 text-[10px] rounded bg-white/5 text-gray-400"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {incompatible && reason && (
                              <p className="text-xs text-red-400 mt-2">
                                {reason}
                              </p>
                            )}
                          </div>
                          <div className={clsx(
                            'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                            isSelected
                              ? 'bg-emerald-500 border-emerald-500'
                              : 'border-gray-500'
                          )}>
                            {isSelected && <Check className="h-3 w-3 text-white" />}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-white/5">
                <span>{selectedSeedIds.length} / {maxSeeds} seeds selected</span>
                {validating && (
                  <span className="flex items-center gap-1">
                    <div className="animate-spin rounded-full h-3 w-3 border-b border-emerald-500" />
                    Validating...
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SeedApplier;
