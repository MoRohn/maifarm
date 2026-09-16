import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Warehouse,
  Folder,
  FolderOpen,
  Search,
  Filter,
  Grid3x3,
  List,
  Download,
  Upload,
  Trash2,
  Star,
  Clock,
  Package,
  Code,
  Wrench,
  FileText,
  MoreVertical,
  Plus,
  ChevronRight,
  Tag,
  CheckSquare,
  Square,
  Sparkles,
  X,
  SlidersHorizontal,
  Loader2
} from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import { Harvest, BarnFolder, BarnStats } from '@/types/barn';
import apiClient, { api } from '@/services/apiClient';
import { barnService } from '@/services/barnService';
import { HarvestCard } from './HarvestCard';
import { FolderView } from './FolderView';
import { HarvestDetails } from './HarvestDetails';
import { SeedQuickAction } from '../Seeds/SeedQuickAction';
import { Harvest as HarvestType } from '@/types/harvest';
import { BarnRevealAnimation } from './BarnRevealAnimation';
import { SkeletonCard } from '@/components/common/SkeletonLoaders';
import { NewHarvestSpotlight } from './NewHarvestSpotlight';
import { useResponsive } from '@/hooks/useResponsive';

export const BarnPage: React.FC = () => {
  const { isMobile, isTablet, isDesktop } = useResponsive();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selectedFolder, setSelectedFolder] = useState<BarnFolder | null>(null);
  const [selectedHarvest, setSelectedHarvest] = useState<Harvest | null>(null);
  const [showSeedCreation, setShowSeedCreation] = useState(false);
  const [seedCreationHarvest, setSeedCreationHarvest] = useState<Harvest | null>(null);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [folders, setFolders] = useState<BarnFolder[]>([]);
  const [stats, setStats] = useState<BarnStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [breadcrumbs, setBreadcrumbs] = useState<BarnFolder[]>([]);
  const [newHarvestIds, setNewHarvestIds] = useState<string[]>([]);
  const [showRevealAnimation, setShowRevealAnimation] = useState(false);
  const [selectedHarvestIds, setSelectedHarvestIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);  // UX FIX: Track individual item deletion
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  useEffect(() => {
    loadBarnData();
  }, []);

  const loadBarnData = async () => {
    setLoading(true);
    try {
      // Get previously seen harvest IDs from localStorage (with error handling for corrupted data)
      let seenHarvests: string[] = [];
      try {
        const stored = localStorage.getItem('seenHarvests');
        if (stored) {
          seenHarvests = JSON.parse(stored);
          if (!Array.isArray(seenHarvests)) seenHarvests = [];
        }
      } catch {
        // If JSON is corrupted, reset to empty array
        localStorage.removeItem('seenHarvests');
      }
      
      const [items, statsRes, foldersRes] = await Promise.all([
        barnService.getAll(),
        api.barn.stats(),
        api.barn.folders.list()
      ]);

      // FIX: Filter out any invalid harvest objects that lack required id property
      const allHarvests: Harvest[] = Array.isArray(items)
        ? items.filter((item): item is Harvest => item != null && typeof item.id === 'string')
        : [];
      setHarvests(allHarvests);

      // Identify new harvests - harvest.id is guaranteed to exist after filter above
      const newIds = allHarvests
        .filter((harvest) => harvest.id && !seenHarvests.includes(harvest.id))
        .map((harvest) => harvest.id);
      
      if (newIds.length > 0) {
        setNewHarvestIds(newIds);
        setShowRevealAnimation(true);

        // Persist seen harvests shortly after reveal animation completes
        // LIMIT: Keep only last 200 harvests to prevent localStorage bloat on iOS
        setTimeout(() => {
          const updatedSeen = [...seenHarvests, ...newIds].slice(-200);
          try {
            localStorage.setItem('seenHarvests', JSON.stringify(updatedSeen));
          } catch (e) {
            // iOS private browsing or quota exceeded - silently fail
            console.warn('Failed to persist seen harvests:', e);
          }
        }, 3000);
      }

      const statsPayload = statsRes?.data?.data ?? statsRes?.data;
      if (statsPayload && typeof statsPayload === 'object') {
        setStats(statsPayload as BarnStats);
      } else {
        setStats(null);
      }

      const folderPayload = foldersRes?.data?.data ?? foldersRes?.data;
      if (Array.isArray(folderPayload)) {
        setFolders(folderPayload);
      } else if (!folderPayload) {
        setFolders([]);
      }
    } catch (error) {
      console.error('Failed to load barn data:', error);
      toast.error('Unable to load barn data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredHarvests = harvests.filter(harvest => {
    // Only exclude empty harvests, not ones with valid content
    const hasValidContent = harvest.yield && harvest.yield.length > 0;
    const hasMetrics = harvest.metadata?.taskCount > 0 || harvest.metadata?.successRate > 0;

    // Exclude only if it's a graceful-shutdown item WITH no content
    if (harvest.tags?.some(tag => tag.includes('graceful-shutdown'))) {
      // But still include if it has actual yield items
      if (!hasValidContent && !hasMetrics) {
        return false;
      }
    }

    // Don't exclude timeout/completion harvests if they have content
    // These are valid harvests that were stopped for a reason but still have outputs
    const name = harvest.name || '';
    const description = harvest.description || '';
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || harvest.type === filterType;
    const matchesFolder = !selectedFolder || (selectedFolder.harvestIds ?? []).includes(harvest.id);

    return matchesSearch && matchesType && matchesFolder;
  });

  const handleCreateFolder = async (name: string) => {
    try {
      const response = await api.barn.folders.create({
        name,
        parentId: selectedFolder?.id
      });

      const folderData = response?.data?.data ?? response?.data;
      if (folderData && typeof folderData === 'object') {
        setFolders(prev => [...prev, folderData]);
        const folderName = (folderData as BarnFolder).name || 'New Folder';
        toast.success(`Folder "${folderName}" created`);
      }
    } catch (error) {
      console.error('Failed to create folder:', error);
      toast.error('Failed to create folder. Please try again.');
    }
  };

  const handleDeleteHarvest = async (id: string) => {
    const harvest = harvests.find(h => h.id === id);
    const harvestName = harvest?.name || 'harvest';

    const confirmed = window.confirm(
      `Are you sure you want to delete "${harvestName}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    // UX FIX: Show loading state during deletion
    setDeletingItemId(id);
    const loadingToast = toast.loading(`Deleting "${harvestName}"...`);

    try {
      const response = await apiClient.delete(`/api/barn/items/${id}`);

      // Verify successful deletion - explicitly check for true
      if (response.data?.success === true || response.status === 200) {
        setHarvests(harvests.filter(h => h.id !== id));
        setSelectedHarvestIds(prev => prev.filter(hId => hId !== id));
        toast.success(`Deleted "${harvestName}" successfully`, { id: loadingToast });
      } else {
        throw new Error(response.data?.error || 'Deletion failed');
      }
    } catch (error: any) {
      console.error('Failed to delete barn item:', error);

      // Parse error response for detailed messages
      let errorMessage = `Failed to delete "${harvestName}"`;

      if (error.response?.status === 404) {
        errorMessage = `"${harvestName}" not found. It may have already been deleted.`;
      } else if (error.response?.status === 410) {
        errorMessage = `"${harvestName}" has already been deleted.`;
        // Remove from UI even though backend says already deleted
        setHarvests(harvests.filter(h => h.id !== id));
        setSelectedHarvestIds(prev => prev.filter(hId => hId !== id));
      } else if (error.response?.data?.error) {
        errorMessage = `Failed to delete "${harvestName}": ${error.response.data.error}`;
      } else if (error.message) {
        errorMessage = `Failed to delete "${harvestName}": ${error.message}`;
      } else {
        errorMessage = `Failed to delete "${harvestName}". Please try again.`;
      }

      toast.error(errorMessage, { id: loadingToast });
    } finally {
      // UX FIX: Clear loading state
      setDeletingItemId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedHarvestIds.length === 0) return;

    const count = selectedHarvestIds.length;
    const confirmed = window.confirm(
      `Are you sure you want to delete ${count} harvest${count > 1 ? 's' : ''}?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    const loadingToast = toast.loading(`Deleting ${count} harvest${count > 1 ? 's' : ''}...`);

    // RACE CONDITION FIX: Capture the IDs we're deleting before async operation
    const idsToDelete = [...selectedHarvestIds];

    try {
      const response = await api.barn.bulkDelete(idsToDelete);
      const result = response?.data?.data ?? response?.data;

      // Get the list of actually deleted IDs from the response if available
      const deletedIds: string[] = result?.deletedIds ?? idsToDelete;

      // Only remove items that were actually deleted from state
      setHarvests(prev => prev.filter(h => !deletedIds.includes(h.id)));
      setSelectedHarvestIds(prev => prev.filter(id => !deletedIds.includes(id)));

      // Show success/warning messages based on result
      const deletedCount = result?.deleted ?? 0;
      const errorCount = result?.errors ?? 0;

      if (errorCount === 0) {
        toast.success(`Successfully deleted ${deletedCount} harvest${deletedCount > 1 ? 's' : ''}`, {
          id: loadingToast
        });
      } else if (deletedCount > 0) {
        // Partial success - use toast with warning icon (toast.warning doesn't exist)
        toast(`Deleted ${deletedCount} of ${count} harvest${count > 1 ? 's' : ''}. ${errorCount} failed.`, {
          id: loadingToast,
          duration: 5000,
          icon: '⚠️'
        });
        console.error('Failed deletions:', result);
      } else {
        // Complete failure
        toast.error(
          `Failed to delete all ${count} harvest${count > 1 ? 's' : ''}. Please check the items and try again.`,
          { id: loadingToast }
        );
        console.error('Bulk deletion failed:', result);
      }

      // Refresh barn stats after deletion to keep counts accurate
      try {
        const statsResponse = await api.barn.stats();
        const statsData = statsResponse?.data?.data ?? statsResponse?.data;
        if (statsData) {
          setStats(statsData);
        }
      } catch (statsError) {
        console.error('Failed to refresh barn stats:', statsError);
      }
    } catch (error: any) {
      console.error('Failed to bulk delete harvests:', error);

      // Parse error response for detailed messages
      let errorMessage = 'Failed to delete harvests';

      if (error.response?.status === 400) {
        errorMessage = 'Invalid request. Please select valid harvests to delete.';
      } else if (error.response?.data?.error) {
        errorMessage = `Failed to delete harvests: ${error.response.data.error}`;
      } else if (error.message) {
        errorMessage = `Failed to delete harvests: ${error.message}`;
      } else {
        errorMessage = 'Failed to delete harvests. Please try again.';
      }

      toast.error(errorMessage, {
        id: loadingToast
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedHarvestIds(prev =>
      prev.includes(id)
        ? prev.filter(hId => hId !== id)
        : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedHarvestIds.length === filteredHarvests.length) {
      setSelectedHarvestIds([]);
    } else {
      setSelectedHarvestIds(filteredHarvests.map(h => h.id));
    }
  };

  const isAllSelected = filteredHarvests.length > 0 && selectedHarvestIds.length === filteredHarvests.length;

  const handleCreateSeed = (harvest: Harvest) => {
    setSeedCreationHarvest(harvest);
    setShowSeedCreation(true);
  };

  // Convert BarnItem (aliased as Harvest) to proper HarvestType for SeedQuickAction
  const convertBarnItemToHarvest = (barnItem: Harvest): HarvestType => {
    return {
      id: barnItem.id,
      farmId: barnItem.farmId,
      farmName: barnItem.farmName,
      name: barnItem.name,
      description: barnItem.description,
      type: barnItem.type,
      status: 'ready' as const,
      createdAt: barnItem.createdAt,
      completedAt: barnItem.updatedAt,
      useCount: barnItem.useCount,
      summary: {
        description: barnItem.description,
        totalFiles: barnItem.metadata?.taskCount || 1,
        filesGenerated: barnItem.metadata?.taskCount || 1,
        filesFailed: 0,
        totalTasks: barnItem.metadata?.taskCount || 1,  // Legacy compatibility
        completedTasks: barnItem.metadata?.taskCount || 1,  // Legacy compatibility
        failedTasks: 0,  // Legacy compatibility
        duration: barnItem.metadata?.duration || 0,
        efficiency: barnItem.metadata?.successRate || 100,
        agents: [],
        fileCategories: {
          text: 0,
          code: 0,
          image: 0,
          data: 0,
          config: 0,
          other: barnItem.metadata?.taskCount || 1
        }
      },
      farmConfig: {
        yaml: barnItem.config?.yaml,
        ...barnItem.config
      },
      results: [],
      insights: [],
      yield: (barnItem.yield || []).map(yieldItem => {
        // TYPE SAFETY: Validate and normalize yield item type
        const validTypes = ['file', 'report', 'code', 'documentation', 'data', 'model'] as const;
        type ValidType = typeof validTypes[number];

        const normalizeType = (type: string | undefined): ValidType => {
          if (!type) return 'file';
          if (type === 'output') return 'data';
          if (type === 'log') return 'report';
          if (validTypes.includes(type as ValidType)) return type as ValidType;
          return 'file'; // Default fallback for unknown types
        };

        const agentId = yieldItem.createdBy || barnItem.createdBy || 'unknown';

        return {
          id: yieldItem.id || `yield-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: yieldItem.name || 'Unnamed',
          description: yieldItem.description || yieldItem.name || 'No description available',
          mimeType: yieldItem.mimeType || 'application/octet-stream',
          type: normalizeType(yieldItem.type),
          size: yieldItem.size || 0,
          location: yieldItem.location || '',
          checksum: yieldItem.checksum || '',
          createdBy: {
            agentId,
            agentName: agentId && agentId !== 'unknown'
              ? `Agent ${agentId.slice(0, 8)}`
              : 'Unknown Agent'
          },
          createdAt: yieldItem.createdAt || barnItem.createdAt,
          metadata: yieldItem.metadata || {}
        };
      }),
      quality: {
        completeness: 100,
        accuracy: barnItem.metadata?.successRate || 100,
        relevance: 100,
        overallScore: barnItem.metadata?.successRate || 100
      },
      tags: barnItem.tags,
      farmerTemplateId: barnItem.farmerTemplateId,
      farmerTemplateName: barnItem.farmerTemplateName,
      exportFormats: ['json', 'csv', 'markdown', 'pdf']
    };
  };

  const handleSeedSuccess = (seed: any) => {
    console.log('Seed created from barn harvest:', seed);
    // Show success notification
    setShowSeedCreation(false);
    setSeedCreationHarvest(null);
    // You could show a toast notification here
  };

  const typeIcons = {
    app: Package,
    tool: Wrench,
    script: Code,
    workflow: FileText,
    other: FileText
  };

  return (
    <div className="min-h-screen pb-safe">
      {/* Barn Reveal Animation */}
      {showRevealAnimation && (
        <BarnRevealAnimation
          newHarvestCount={newHarvestIds.length}
          onComplete={() => setShowRevealAnimation(false)}
        />
      )}

      {/* Page Header - Responsive Design */}
      <div className="mb-4 sm:mb-6 lg:mb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Mobile Header */}
          {(isMobile || isTablet) && (
            <div className="space-y-4">
              {/* Top Row - Title and Action Icons */}
              <div className="flex items-center justify-between">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center space-x-3"
                >
                  <div className="p-2.5 bg-gradient-to-br from-red-400 to-red-700 rounded-2xl shadow-lg">
                    <Warehouse className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                      The Barn
                    </h1>
                    {stats && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {stats.totalHarvests || stats.totalItems || 0} harvests
                      </p>
                    )}
                  </div>
                </motion.div>

                {/* Mobile Action Icons */}
                <div className="flex items-center space-x-2">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowMobileSearch(!showMobileSearch)}
                    className={clsx(
                      "p-2.5 rounded-xl transition-all touch-manipulation",
                      showMobileSearch
                        ? "bg-primary-100 dark:bg-primary-900/30 text-primary-600"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                    )}
                  >
                    <Search className="w-5 h-5" />
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowMobileFilters(!showMobileFilters)}
                    className={clsx(
                      "p-2.5 rounded-xl transition-all touch-manipulation",
                      showMobileFilters || filterType !== 'all'
                        ? "bg-primary-100 dark:bg-primary-900/30 text-primary-600"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                    )}
                  >
                    <SlidersHorizontal className="w-5 h-5" />
                  </motion.button>

                  <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                    <button
                      onClick={() => setView('grid')}
                      className={clsx(
                        'p-2 rounded-lg transition-all touch-manipulation',
                        view === 'grid'
                          ? 'bg-white dark:bg-gray-700 shadow-sm'
                          : 'text-gray-600 dark:text-gray-400'
                      )}
                    >
                      <Grid3x3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setView('list')}
                      className={clsx(
                        'p-2 rounded-lg transition-all touch-manipulation',
                        view === 'list'
                          ? 'bg-white dark:bg-gray-700 shadow-sm'
                          : 'text-gray-600 dark:text-gray-400'
                      )}
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Mobile Search Bar - Collapsible */}
              <AnimatePresence>
                {showMobileSearch && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search harvests..."
                        autoFocus
                        className="w-full pl-12 pr-12 py-3.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-base"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 touch-manipulation"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Mobile Selection Bar */}
              {filteredHarvests.length > 0 && (
                <div className="flex items-center justify-between">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSelectAll}
                    className={clsx(
                      "flex items-center space-x-2 px-4 py-2.5 rounded-xl transition-all touch-manipulation",
                      selectedHarvestIds.length > 0
                        ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                    )}
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-5 h-5" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                    <span className="text-sm font-medium">
                      {selectedHarvestIds.length > 0
                        ? `${selectedHarvestIds.length} selected`
                        : 'Select All'}
                    </span>
                  </motion.button>

                  {/* Delete Button */}
                  <AnimatePresence>
                    {selectedHarvestIds.length > 0 && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleBulkDelete}
                        disabled={isDeleting}
                        className="flex items-center space-x-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl shadow-lg disabled:opacity-50 transition-all touch-manipulation"
                      >
                        <Trash2 className={clsx("w-4 h-4", isDeleting && "animate-pulse")} />
                        <span className="text-sm font-medium">
                          {isDeleting ? 'Deleting...' : `Delete (${selectedHarvestIds.length})`}
                        </span>
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}

          {/* Desktop Header */}
          {isDesktop && (
            <div className="flex items-center justify-between">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center space-x-3"
              >
                <div className="p-2 bg-gradient-to-br from-red-400 to-red-700 rounded-apple">
                  <Warehouse className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  The Barn
                </h1>
              </motion.div>

              {/* Search and Actions */}
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search harvests..."
                    className="pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-apple focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

                {/* Select All / Clear Selection Button */}
                {filteredHarvests.length > 0 && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleSelectAll}
                    className={clsx(
                      "flex items-center space-x-2 px-3 py-2 rounded-apple transition-all",
                      selectedHarvestIds.length > 0
                        ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-700"
                        : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white bg-gray-100 dark:bg-gray-800"
                    )}
                    title={isAllSelected ? "Deselect All" : selectedHarvestIds.length > 0 ? "Clear Selection" : "Select All"}
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-5 h-5" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                    <span className="text-sm font-medium">
                      {selectedHarvestIds.length > 0
                        ? `${selectedHarvestIds.length} selected`
                        : 'Select All'}
                    </span>
                  </motion.button>
                )}

                {/* Delete Selected Button */}
                <AnimatePresence>
                  {selectedHarvestIds.length > 0 && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleBulkDelete}
                      disabled={isDeleting}
                      className="flex items-center space-x-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-apple shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <Trash2 className={clsx("w-4 h-4", isDeleting && "animate-pulse")} />
                      <span className="text-sm font-medium">
                        {isDeleting ? 'Deleting...' : `Delete (${selectedHarvestIds.length})`}
                      </span>
                    </motion.button>
                  )}
                </AnimatePresence>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {/* Open import modal */}}
                  className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  <Upload className="w-5 h-5" />
                </motion.button>

                <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-apple p-1">
                  <button
                    onClick={() => setView('grid')}
                    className={clsx(
                      'p-1.5 rounded',
                      view === 'grid'
                        ? 'bg-white dark:bg-gray-700 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400'
                    )}
                  >
                    <Grid3x3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setView('list')}
                    className={clsx(
                      'p-1.5 rounded',
                      view === 'list'
                        ? 'bg-white dark:bg-gray-700 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400'
                    )}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Breadcrumbs */}
        {breadcrumbs.length > 0 && (
          <div className="flex items-center space-x-2 mb-4 sm:mb-6 text-sm overflow-x-auto pb-2 hide-scrollbar">
            <button
              onClick={() => {
                setSelectedFolder(null);
                setBreadcrumbs([]);
              }}
              className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white whitespace-nowrap touch-manipulation"
            >
              Barn
            </button>
            {breadcrumbs.map((folder, index) => (
              <React.Fragment key={folder.id}>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <button
                  onClick={() => {
                    setSelectedFolder(folder);
                    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
                  }}
                  className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white whitespace-nowrap touch-manipulation"
                >
                  {folder.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Stats Overview - Responsive Grid */}
        {stats && !selectedFolder && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8"
          >
            <div className="bg-white dark:bg-gray-900 rounded-2xl sm:rounded-apple-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <Package className="w-4 h-4 sm:w-5 sm:h-5 text-primary-600 dark:text-primary-400" />
                <span className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.totalHarvests || stats.totalItems || 0}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Total Harvests</p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl sm:rounded-apple-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <Star className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 dark:text-yellow-400" />
                <span className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.mostUsedHarvests?.[0]?.useCount || 0}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Most Used</p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl sm:rounded-apple-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 dark:text-green-400" />
                <span className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.recentHarvests?.length || 0}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Recent</p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl sm:rounded-apple-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <Folder className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
                <span className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  {folders.filter(f => !f.parentId).length}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Folders</p>
            </div>
          </motion.div>
        )}

        {/* Filter Tabs - Mobile Dropdown or Desktop Tabs */}
        {(isMobile || isTablet) && showMobileFilters ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                onClick={() => { setFilterType('all'); setShowMobileFilters(false); }}
                className={clsx(
                  'px-4 py-3 rounded-xl text-sm font-medium transition-all touch-manipulation',
                  filterType === 'all'
                    ? 'bg-primary-600 text-white shadow-lg'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                )}
              >
                All Harvests
              </button>
              {['app', 'tool', 'script', 'workflow'].map((type) => {
                const Icon = typeIcons[type as keyof typeof typeIcons];
                return (
                  <button
                    key={type}
                    onClick={() => { setFilterType(type); setShowMobileFilters(false); }}
                    className={clsx(
                      'flex items-center justify-center space-x-2 px-4 py-3 rounded-xl text-sm font-medium transition-all touch-manipulation',
                      filterType === type
                        ? 'bg-primary-600 text-white shadow-lg'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="capitalize">{type}s</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : isDesktop && (
          <div className="flex items-center space-x-2 mb-6 overflow-x-auto hide-scrollbar">
            <button
              onClick={() => setFilterType('all')}
              className={clsx(
                'px-4 py-2 rounded-apple text-sm font-medium transition-colors whitespace-nowrap',
                filterType === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
            >
              All Harvests
            </button>
            {['app', 'tool', 'script', 'workflow'].map((type) => {
              const Icon = typeIcons[type as keyof typeof typeIcons];
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={clsx(
                    'flex items-center space-x-2 px-4 py-2 rounded-apple text-sm font-medium transition-colors whitespace-nowrap',
                    filterType === type
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="capitalize">{type}s</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Active Filter Chip on Mobile */}
        {(isMobile || isTablet) && !showMobileFilters && filterType !== 'all' && (
          <div className="flex items-center mb-4">
            <span className="inline-flex items-center px-3 py-1.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-sm font-medium">
              Filter: <span className="capitalize ml-1">{filterType}s</span>
              <button
                onClick={() => setFilterType('all')}
                className="ml-2 p-0.5 hover:bg-primary-200 dark:hover:bg-primary-800/50 rounded-full touch-manipulation"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          </div>
        )}

        {/* Main Content */}
        {loading ? (
          <div className={clsx(
            "grid gap-4 sm:gap-6",
            isMobile ? "grid-cols-1" : isTablet ? "grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          )}>
            {/* Skeleton loading cards for better perceived performance */}
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <>
            <AnimatePresence mode="wait">
              {view === 'grid' ? (
              <motion.div
                key="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={clsx(
                  "grid gap-4 sm:gap-6",
                  isMobile ? "grid-cols-1" : isTablet ? "grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                )}
              >
                {/* Folders */}
                {folders
                  .filter(f => f.parentId === selectedFolder?.id)
                  .map((folder) => (
                    <FolderView
                      key={folder.id}
                      folder={folder}
                      harvestCount={(folder.harvestIds ?? []).length}
                      onClick={() => {
                        setSelectedFolder(folder);
                        setBreadcrumbs([...breadcrumbs, folder]);
                      }}
                    />
                  ))}

                {/* Harvests */}
                {filteredHarvests.map((harvest) => {
                  const isNew = newHarvestIds.includes(harvest.id);

                  if (isNew) {
                    return (
                      <NewHarvestSpotlight
                        key={harvest.id}
                        harvest={harvest}
                        isNew={true}
                        onClick={() => setSelectedHarvest(harvest)}
                        onUse={() => {
                          window.location.href = `/home?useHarvest=${harvest.id}`;
                        }}
                        onShare={() => {
                          // Share functionality
                          navigator.clipboard.writeText(`Check out my harvest: ${harvest.name}`);
                        }}
                      />
                    );
                  }

                  return (
                    <HarvestCard
                      key={harvest.id}
                      harvest={harvest}
                      onClick={() => setSelectedHarvest(harvest)}
                      onDelete={() => handleDeleteHarvest(harvest.id)}
                      onCreateSeed={() => handleCreateSeed(harvest)}
                      selectionMode={true}
                      isSelected={selectedHarvestIds.includes(harvest.id)}
                      onSelect={() => handleToggleSelect(harvest.id)}
                      isDeleting={deletingItemId === harvest.id}
                    />
                  );
                })}

                {/* Empty State - No harvests at all */}
                {filteredHarvests.length === 0 && folders.length === 0 && !searchQuery && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="col-span-full flex flex-col items-center justify-center py-16"
                  >
                    <Warehouse className="w-16 h-16 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      No harvests yet
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 text-center max-w-md">
                      Your completed farms will appear here when you save them to the barn.
                      Start a new farm and harvest your creations!
                    </p>
                  </motion.div>
                )}

                {/* Empty State - No results from search/filter */}
                {filteredHarvests.length === 0 && (searchQuery || harvests.length > 0) && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="col-span-full flex flex-col items-center justify-center py-16"
                  >
                    <Search className="w-16 h-16 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      No matching harvests
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 text-center max-w-md">
                      {searchQuery
                        ? `No harvests match "${searchQuery}". Try a different search term.`
                        : 'No harvests match the current filters. Try adjusting your selection.'}
                    </p>
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      >
                        Clear search
                      </button>
                    )}
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {filteredHarvests.map((harvest) => (
                  <HarvestListItem
                    key={harvest.id}
                    harvest={harvest}
                    onClick={() => setSelectedHarvest(harvest)}
                    onDelete={() => handleDeleteHarvest(harvest.id)}
                    onCreateSeed={() => handleCreateSeed(harvest)}
                    isSelected={selectedHarvestIds.includes(harvest.id)}
                    onToggleSelect={() => handleToggleSelect(harvest.id)}
                    isDeleting={deletingItemId === harvest.id}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          </>
        )}
      </div>

      {/* Harvest Details Modal Overlay - Responsive */}
      <AnimatePresence>
        {selectedHarvest && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={clsx(
              "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
              isMobile
                ? "flex flex-col"
                : "flex items-center justify-center p-4"
            )}
            onClick={() => setSelectedHarvest(null)}
          >
            <motion.div
              initial={isMobile ? { y: '100%' } : { scale: 0.95, opacity: 0 }}
              animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
              exit={isMobile ? { y: '100%' } : { scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className={clsx(
                "bg-white dark:bg-gray-900 overflow-hidden",
                isMobile
                  ? "mt-auto w-full max-h-[95vh] rounded-t-3xl"
                  : "max-w-4xl w-full max-h-[90vh] rounded-2xl"
              )}
            >
              {/* Mobile drag handle */}
              {isMobile && (
                <div className="flex justify-center py-3 bg-white dark:bg-gray-900 sticky top-0 z-10">
                  <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
                </div>
              )}
              <div className="overflow-y-auto max-h-[90vh]">
                <HarvestDetails
                  harvest={selectedHarvest}
                  onClose={() => setSelectedHarvest(null)}
                  onUse={() => {
                    // Navigate to farm creator with harvest
                    window.location.href = `/home?useHarvest=${selectedHarvest.id}`;
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seed Creation from Barn Harvest */}
      <AnimatePresence>
        {showSeedCreation && seedCreationHarvest && (
          <SeedQuickAction
            harvest={convertBarnItemToHarvest(seedCreationHarvest)}
            isOpen={showSeedCreation}
            onClose={() => {
              setShowSeedCreation(false);
              setSeedCreationHarvest(null);
            }}
            onSuccess={handleSeedSuccess}
            context="barn"
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// List view component
const HarvestListItem: React.FC<{
  harvest: Harvest;
  onClick: () => void;
  onDelete: () => void;
  onCreateSeed?: () => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  isDeleting?: boolean;  // UX FIX: Loading state for delete operation
}> = ({ harvest, onClick, onDelete, onCreateSeed, isSelected = false, onToggleSelect, isDeleting = false }) => {
  const typeIconsLocal = {
    app: Package,
    tool: Wrench,
    script: Code,
    workflow: FileText,
    other: FileText
  };
  const Icon = typeIconsLocal[harvest.type as keyof typeof typeIconsLocal] || FileText;

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className={clsx(
        "bg-white dark:bg-gray-900 rounded-apple-lg p-4 cursor-pointer border transition-all",
        isSelected
          ? "border-primary-500 dark:border-primary-400 shadow-apple-lg"
          : "border-gray-200 dark:border-gray-800"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* Selection Checkbox */}
          {onToggleSelect && (
            <div onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={onToggleSelect}
                className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
            </div>
          )}
          <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-apple">
            <Icon className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">
              {harvest.name}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {harvest.description}
            </p>
            <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
              <span>{new Date(harvest.createdAt).toLocaleDateString()}</span>
              <span>•</span>
              <span>Used {harvest.useCount} times</span>
              <span>•</span>
              <span>{harvest.yield?.length || 0} yield items</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {harvest.tags && Array.isArray(harvest.tags) && harvest.tags
            .filter(tag => typeof tag === 'string')
            .slice(0, 2)
            .map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
          {onCreateSeed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreateSeed();
              }}
              className="p-2 text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
              title="Create Seed"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={isDeleting}
            className={clsx(
              "p-2 transition-colors",
              isDeleting
                ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                : "text-gray-400 hover:text-red-600 dark:hover:text-red-400"
            )}
            title={isDeleting ? "Deleting..." : "Delete"}
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
};
