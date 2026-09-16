import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Search,
  Grid3x3,
  List,
  Filter,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  TrendingUp,
  Award,
  Zap,
  Settings,
  Star,
  X,
  RefreshCw
} from 'lucide-react';
import { clsx } from 'clsx';
import { FarmerTemplate, FarmerCategory } from '@/types/farmers';
import { api } from '@/services/apiClient';
import { FarmerCard } from './FarmerCard';
import { FarmerProfile } from './FarmerProfile';
import { FarmerChatWizard } from './FarmerChatWizard';
import { FarmerGroupsNav } from './FarmerGroupsNav';
import { AIEngineSetupHub } from '../Settings/AIEngineSetup';
import { useFarmerGroupStore } from '@/store/farmerGroupStore';
import { useResponsive } from '@/hooks/useResponsive';

export const FarmersPage: React.FC = () => {
  const navigate = useNavigate();
  const { isMobile, isTablet, isDesktop } = useResponsive();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [farmers, setFarmers] = useState<FarmerTemplate[]>([]);
  const [categories, setCategories] = useState<FarmerCategory[]>([]);
  const [selectedFarmer, setSelectedFarmer] = useState<FarmerTemplate | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [showFarmerWizard, setShowFarmerWizard] = useState(false);
  const [farmerForWizard, setFarmerForWizard] = useState<FarmerTemplate | null>(null);
  const [showAIEngineSetup, setShowAIEngineSetup] = useState(false);
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Get group store state
  const { groups, favorites, recentFarmers, allStats, fetchFarmersInGroup, fetchAllStats } = useFarmerGroupStore();

  useEffect(() => {
    loadFarmers();
    fetchAllStats(); // Load farmer stats for rating display
  }, []);

  const loadFarmers = async (isRetry = false) => {
    if (isRetry) {
      setIsRetrying(true);
    } else {
      setLoading(true);
    }
    setLoadError(null);

    try {
      console.log('[FarmersPage] Loading farmers from API...');

      // Add timeout for mobile connections
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const response = await api.farmers.list();
      clearTimeout(timeoutId);

      console.log('[FarmersPage] API Response:', {
        status: response.status,
        hasData: !!response.data,
        success: response.data?.success,
        farmersCount: response.data?.data?.length,
        categoriesCount: response.data?.categories?.length
      });

      // Response is an axios response, access data property
      if (response.data && response.data.success) {
        const farmersData = response.data.data || [];
        const categoriesData = response.data.categories || [];
        console.log('[FarmersPage] Setting farmers:', farmersData.length, 'categories:', categoriesData.length);
        setFarmers(farmersData);
        setCategories(categoriesData);
        setLoadError(null);
      } else {
        console.warn('[FarmersPage] Response did not contain successful data');
        setLoadError('No farmers data available. Please try again.');
      }
    } catch (error: any) {
      console.error('[FarmersPage] Failed to load farmers:', error);
      console.error('[FarmersPage] Error details:', {
        message: error?.message,
        response: error?.response,
        status: error?.response?.status
      });

      // Set user-friendly error message
      if (error?.name === 'AbortError') {
        setLoadError('Request timed out. Please check your connection and try again.');
      } else if (!navigator.onLine) {
        setLoadError('No internet connection. Please check your network settings.');
      } else {
        setLoadError('Failed to load farmers. Please try again.');
      }
    } finally {
      setLoading(false);
      setIsRetrying(false);
    }
  };

  // Filter farmers based on selected group and search
  const filteredFarmers = useMemo(() => {
    let result = farmers;

    // Filter by group
    if (selectedGroupId === 'favorites') {
      result = farmers.filter(f => favorites.includes(f.id));
    } else if (selectedGroupId === 'recent') {
      // Sort by recent order
      result = recentFarmers
        .map(id => farmers.find(f => f.id === id))
        .filter((f): f is FarmerTemplate => f !== undefined);
    } else if (selectedGroupId) {
      // Find the group and filter by its farmers
      const group = groups.find(g => g.id === selectedGroupId);
      if (group?.farmers) {
        result = farmers.filter(f => group.farmers!.includes(f.id));
      }
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(farmer =>
        farmer.name.toLowerCase().includes(query) ||
        farmer.title.toLowerCase().includes(query) ||
        farmer.description.toLowerCase().includes(query)
      );
    }

    return result;
  }, [farmers, selectedGroupId, favorites, recentFarmers, groups, searchQuery]);

  // Helper to get stats for a specific farmer
  const getStatsForFarmer = (farmerId: string) => {
    return allStats.find(s => s.farmerId === farmerId) || null;
  };

  // Debug logging
  console.log('[FarmersPage] Render state:', {
    totalFarmers: farmers.length,
    filteredFarmers: filteredFarmers.length,
    loading,
    searchQuery,
    selectedGroupId
  });

  const handleFarmerClick = (farmer: FarmerTemplate) => {
    setSelectedFarmer(farmer);
    setShowProfile(true);
  };

  const handleUseFarmer = async (farmer: FarmerTemplate) => {
    // Open the farmer chat wizard modal instead of navigating
    setFarmerForWizard(farmer);
    setShowFarmerWizard(true);
    // Close profile modal if open
    if (showProfile) {
      setShowProfile(false);
    }
  };

  const updateScrollButtons = (container: HTMLDivElement) => {
    const canLeft = container.scrollLeft > 0;
    const canRight = container.scrollLeft < container.scrollWidth - container.clientWidth - 1;
    setCanScrollLeft(canLeft);
    setCanScrollRight(canRight);
  };

  const scrollTo = (direction: 'left' | 'right') => {
    if (!scrollContainer) return;
    
    const cardWidth = 320; // w-80 = 320px
    const gap = 24; // space-x-6 = 24px
    const scrollAmount = cardWidth + gap;
    
    const currentScroll = scrollContainer.scrollLeft;
    const targetScroll = direction === 'left' 
      ? currentScroll - scrollAmount
      : currentScroll + scrollAmount;
    
    scrollContainer.scrollTo({
      left: targetScroll,
      behavior: 'smooth'
    });
  };

  useEffect(() => {
    if (scrollContainer) {
      const handleScroll = () => updateScrollButtons(scrollContainer);
      const handleResize = () => updateScrollButtons(scrollContainer);
      
      scrollContainer.addEventListener('scroll', handleScroll);
      window.addEventListener('resize', handleResize);
      
      // Initial check
      updateScrollButtons(scrollContainer);
      
      return () => {
        scrollContainer.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [scrollContainer]);

  return (
    <div className="min-h-screen pb-safe">
      {/* Page Header - Responsive */}
      <div className="mb-4 sm:mb-6 lg:mb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Mobile/Tablet Header */}
          {(isMobile || isTablet) && (
            <div className="space-y-4">
              {/* Top Row */}
              <div className="flex items-center justify-between">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center space-x-3"
                >
                  <div className="p-2.5 bg-gradient-to-br from-blue-400 to-blue-700 rounded-2xl shadow-lg">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                      Farmers
                    </h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {farmers.length} templates available
                    </p>
                  </div>
                </motion.div>

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

              {/* Mobile Search Bar */}
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
                        placeholder="Search farmers..."
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
                <div className="p-2 bg-gradient-to-br from-blue-400 to-blue-700 rounded-apple">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Farmers
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Pre-configured AI agent templates with personality
                  </p>
                </div>
              </motion.div>

              {/* Search and View Toggle */}
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search farmers..."
                    className="pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-apple focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

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
        {/* Group Navigation */}
        <div className="mb-4 sm:mb-6">
          <FarmerGroupsNav
            selectedGroupId={selectedGroupId}
            onSelectGroup={setSelectedGroupId}
            showFavorites={true}
            showRecent={true}
          />
        </div>

        {/* Loading State */}
        {loading && !isRetrying && (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">Loading farmers...</p>
          </div>
        )}

        {/* Error State with Retry */}
        {loadError && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-16 px-4"
          >
            <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded-full mb-4">
              <Users className="w-12 h-12 text-red-500 dark:text-red-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 text-center">
              Unable to Load Farmers
            </h3>
            <p className="text-gray-600 dark:text-gray-400 text-center max-w-md mb-6">
              {loadError}
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => loadFarmers(true)}
              disabled={isRetrying}
              className="flex items-center space-x-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl shadow-lg disabled:opacity-50 transition-all touch-manipulation"
            >
              <RefreshCw className={clsx("w-5 h-5", isRetrying && "animate-spin")} />
              <span>{isRetrying ? 'Retrying...' : 'Try Again'}</span>
            </motion.button>
          </motion.div>
        )}

        {/* Main Content */}
        {!loading && !loadError && (
          <>
            {/* Farmers Grid/List View */}
            <AnimatePresence mode="wait">
              {view === 'grid' ? (
                <motion.div
                  key="grid"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {/* Mobile/Tablet: Vertical Grid Layout */}
                  {(isMobile || isTablet) ? (
                    <div className={clsx(
                      "grid gap-4",
                      isMobile ? "grid-cols-1" : "grid-cols-2"
                    )}>
                      {filteredFarmers.map((farmer) => (
                        <motion.div
                          key={farmer.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <FarmerCard
                            farmer={farmer}
                            stats={getStatsForFarmer(farmer.id)}
                            onClick={() => handleFarmerClick(farmer)}
                            onUse={() => handleUseFarmer(farmer)}
                          />
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    /* Desktop: Horizontal Scroll Layout */
                    <div className="relative group">
                      {/* Left Navigation Button */}
                      <motion.button
                        onClick={() => scrollTo('left')}
                        className={clsx(
                          'absolute left-0 top-1/2 -translate-y-1/2 z-20 p-3 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 transition-all duration-200',
                          canScrollLeft
                            ? 'opacity-90 hover:opacity-100 hover:scale-105'
                            : 'opacity-0 pointer-events-none'
                        )}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        style={{ marginLeft: '-16px' }}
                      >
                        <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      </motion.button>

                      {/* Right Navigation Button */}
                      <motion.button
                        onClick={() => scrollTo('right')}
                        className={clsx(
                          'absolute right-0 top-1/2 -translate-y-1/2 z-20 p-3 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 transition-all duration-200',
                          canScrollRight
                            ? 'opacity-90 hover:opacity-100 hover:scale-105'
                            : 'opacity-0 pointer-events-none'
                        )}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        style={{ marginRight: '-16px' }}
                      >
                        <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      </motion.button>

                      {/* Scrollable Container */}
                      <div
                        ref={setScrollContainer}
                        className="flex overflow-x-auto overflow-y-hidden space-x-6 pb-4 px-4 snap-x snap-mandatory scroll-smooth hide-scrollbar"
                        style={{
                          scrollbarWidth: 'none',
                          msOverflowStyle: 'none'
                        }}
                      >
                        {filteredFarmers.map((farmer) => (
                          <motion.div
                            key={farmer.id}
                            className="flex-none w-80 snap-start"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            <FarmerCard
                              farmer={farmer}
                              stats={getStatsForFarmer(farmer.id)}
                              onClick={() => handleFarmerClick(farmer)}
                              onUse={() => handleUseFarmer(farmer)}
                            />
                          </motion.div>
                        ))}
                        {/* Padding div to prevent last card from being cut off */}
                        <div className="flex-none w-4" />
                      </div>

                      {/* Fade edges for visual appeal */}
                      <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white dark:from-gray-900 to-transparent pointer-events-none z-10" />
                      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-gray-900 to-transparent pointer-events-none z-10" />
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3 sm:space-y-4"
                >
                  {filteredFarmers.map((farmer) => (
                    <FarmerListItem
                      key={farmer.id}
                      farmer={farmer}
                      stats={getStatsForFarmer(farmer.id)}
                      onClick={() => handleFarmerClick(farmer)}
                      onUse={() => handleUseFarmer(farmer)}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Empty State */}
            {filteredFarmers.length === 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-12 sm:py-16 px-4"
              >
                <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
                  <Users className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 text-center">
                  No farmers found
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-center max-w-md text-sm sm:text-base">
                  Try adjusting your search or category filter to find the perfect farmer template for your needs.
                </p>
                {searchQuery && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSearchQuery('')}
                    className="mt-4 px-4 py-2 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-xl text-sm font-medium touch-manipulation"
                  >
                    Clear Search
                  </motion.button>
                )}
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* Farmer Profile Modal */}
      <AnimatePresence>
        {showProfile && selectedFarmer && (
          <FarmerProfile
            farmer={selectedFarmer}
            onClose={() => {
              setShowProfile(false);
              setSelectedFarmer(null);
            }}
            onUse={() => handleUseFarmer(selectedFarmer)}
          />
        )}
      </AnimatePresence>

      {/* Farmer Chat Wizard Modal */}
      <AnimatePresence>
        {showFarmerWizard && farmerForWizard && (
          <FarmerChatWizard
            isOpen={showFarmerWizard}
            onClose={() => {
              setShowFarmerWizard(false);
              setFarmerForWizard(null);
            }}
            farmer={farmerForWizard}
          />
        )}
      </AnimatePresence>

    </div>
  );
};

// List view component
const FarmerListItem: React.FC<{
  farmer: FarmerTemplate;
  stats?: import('@/types/farmers').FarmerDbStats | null;
  onClick: () => void;
  onUse: () => void;
}> = ({ farmer, stats, onClick, onUse }) => {
  const getCategoryInfo = (category: string) => {
    const categoryData = {
      startup: { 
        icon: '🚀', 
        color: 'from-purple-400 to-purple-600',
        bgColor: 'from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20'
      },
      technical: { 
        icon: '💻', 
        color: 'from-blue-400 to-blue-600',
        bgColor: 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20'
      },
      creative: { 
        icon: '🎨', 
        color: 'from-pink-400 to-pink-600',
        bgColor: 'from-pink-50 to-pink-100 dark:from-pink-900/20 dark:to-pink-800/20'
      },
      research: { 
        icon: '🔬', 
        color: 'from-green-400 to-green-600',
        bgColor: 'from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20'
      },
      operations: { 
        icon: '⚙️', 
        color: 'from-gray-400 to-gray-600',
        bgColor: 'from-gray-50 to-gray-100 dark:from-gray-900/20 dark:to-gray-800/20'
      }
    };
    return categoryData[category as keyof typeof categoryData] || categoryData.operations;
  };

  const getFarmersIcon = (name: string) => {
    const icons = {
      'buzz-bee': '🐝',
      'daisy-donkey': '🫏',
      'harvest-hound': '🐕',
      'owlbert-barnowl': '🦉',
      'sage-fox': '🦊',
      'sparkle-unicorn': '🦄',
      'vision-rooster': '🐓',
      'barter-bull': '🐂',
      'blueprint-beaver': '🦫',
      'harvest-hen': '🐔',
      'ledger-llama': '🦙',
      'maverick-mustang': '🐴',
      'oracle-owl': '🦉',
      'pixel-panther': '🐆',
    };
    return icons[name as keyof typeof icons] || '🌾';
  };
  
  // Get the actual farmer icon from the first agent or use category default
  const getFarmerIcon = () => {
    if (farmer.agents && farmer.agents.length > 0 && farmer.agents[0].emoji) {
      return farmer.agents[0].emoji;
    }
    return getFarmersIcon(farmer.name);
  };

  const categoryInfo = getCategoryInfo(farmer.category);

  return (
    <motion.div
      whileHover={{ scale: 1.01, y: -2 }}
      whileTap={{ scale: 0.99 }}
      className="relative group"
      onClick={onClick}
    >
      {/* Glass morphism card with category-specific gradient background */}
      <div className={`relative bg-gradient-to-r ${categoryInfo.bgColor} backdrop-blur-xl rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden`}>
        {/* Gradient overlay on hover using category colors */}
        <div className={`absolute inset-0 bg-gradient-to-r ${categoryInfo.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
        
        <div className="relative flex items-center justify-between">
          <div className="flex items-center space-x-5">
            {/* Enhanced farmer icon with gradient background using category colors */}
            <motion.div 
              className="relative"
              whileHover={{ rotate: [0, -5, 5, 0] }}
              transition={{ duration: 0.5 }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${categoryInfo.color} rounded-2xl blur-lg opacity-60 group-hover:opacity-80 transition-opacity`} />
              <div className={`relative w-16 h-16 bg-gradient-to-br ${categoryInfo.color} rounded-2xl flex items-center justify-center shadow-xl`}>
                <span className="text-3xl filter drop-shadow-md">{getFarmersIcon(farmer.name)}</span>
              </div>
            </motion.div>
            
            {/* Farmer details */}
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {farmer.title}
                </h3>
                {farmer.featured && (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  >
                    <Sparkles className="w-4 h-4 text-yellow-500" />
                  </motion.div>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                {farmer.description}
              </p>
              
              {/* Enhanced metadata badges */}
              <div className="flex items-center flex-wrap gap-2">
                <div className="flex items-center space-x-1 px-2.5 py-1 bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur rounded-full">
                  <Users className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {farmer.metadata.num_agents} agents
                  </span>
                </div>
                <div className="flex items-center space-x-1 px-2.5 py-1 bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur rounded-full">
                  <TrendingUp className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 capitalize">
                    {farmer.metadata.complexity} Level
                  </span>
                </div>
                <div className="flex items-center space-x-1 px-2.5 py-1 bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur rounded-full">
                  <Award className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {farmer.agents.length} specialized roles
                  </span>
                </div>
                {/* Rating badge */}
                {stats && stats.ratingCount > 0 && (
                  <div className="flex items-center space-x-1 px-2.5 py-1 bg-yellow-100/80 dark:bg-yellow-900/30 backdrop-blur rounded-full">
                    <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                    <span className="text-xs font-medium text-yellow-700 dark:text-yellow-400">
                      {stats.avgRating.toFixed(1)} ({stats.ratingCount})
                    </span>
                  </div>
                )}
                {/* Usage count badge */}
                {stats && stats.totalUses > 0 && (
                  <div className="flex items-center space-x-1 px-2.5 py-1 bg-blue-100/80 dark:bg-blue-900/30 backdrop-blur rounded-full">
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                      {stats.totalUses} uses
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Enhanced Use Farmer button */}
          <div className="flex items-center space-x-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation();
                onUse();
              }}
              className="relative group/btn px-6 py-3 overflow-hidden rounded-xl font-medium transition-all duration-300"
            >
              {/* Gradient background */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-emerald-500 transition-transform duration-300 group-hover/btn:scale-110" />
              
              {/* Shimmer effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700" />
              
              {/* Button content */}
              <div className="relative flex items-center space-x-2">
                <Zap className="w-4 h-4 text-white" />
                <span className="text-white font-medium">Use Farmer</span>
              </div>
            </motion.button>
            
            <motion.div
              className="p-2 rounded-lg bg-gray-100/50 dark:bg-gray-800/50 backdrop-blur"
              whileHover={{ x: 3 }}
            >
              <ChevronRight className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};