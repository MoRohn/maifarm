import React, { useState, useEffect } from 'react';
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
  Settings
} from 'lucide-react';
import { clsx } from 'clsx';
import { FarmerTemplate, FarmerCategory } from '@/types/farmers';
import { api } from '@/services/apiClient';
import { FarmerCard } from './FarmerCard';
import { FarmerProfile } from './FarmerProfile';
import { FarmerChatWizard } from './FarmerChatWizard';
import { AIEngineSetupHub } from '../Settings/AIEngineSetup';

export const FarmersPage: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [farmers, setFarmers] = useState<FarmerTemplate[]>([]);
  const [categories, setCategories] = useState<FarmerCategory[]>([]);
  const [selectedFarmer, setSelectedFarmer] = useState<FarmerTemplate | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [showFarmerWizard, setShowFarmerWizard] = useState(false);
  const [farmerForWizard, setFarmerForWizard] = useState<FarmerTemplate | null>(null);
  const [showAIEngineSetup, setShowAIEngineSetup] = useState(false);
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  useEffect(() => {
    loadFarmers();
  }, []);

  const loadFarmers = async () => {
    setLoading(true);
    try {
      const response = await api.farmers.list();
      // Response is an axios response, access data property
      if (response.data && response.data.success) {
        setFarmers(response.data.data || []);
        setCategories(response.data.categories || []);
      }
    } catch (error) {
      console.error('Failed to load farmers:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredFarmers = farmers.filter(farmer => {
    const matchesSearch = 
      farmer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      farmer.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      farmer.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = 
      selectedCategory === 'all' || farmer.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
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
    <div>
      {/* Page Header */}
      <div className="mb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
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
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Category Filter - Wrapping flex layout */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setSelectedCategory('all')}
            className={clsx(
              'px-4 py-2 rounded-apple text-sm font-medium transition-colors',
              selectedCategory === 'all'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
          >
            All Farmers
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={clsx(
                'flex items-center space-x-2 px-4 py-2 rounded-apple text-sm font-medium transition-colors',
                selectedCategory === category.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
            >
              <span>{category.icon}</span>
              <span>{category.name}</span>
              <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-xs">
                {category.farmerCount}
              </span>
            </button>
          ))}
        </div>

        {/* Main Content */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Farmers Horizontal Scroll */}
            <AnimatePresence mode="wait">
              {view === 'grid' ? (
                <motion.div
                  key="grid"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="relative group"
                >
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
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  {filteredFarmers.map((farmer) => (
                    <FarmerListItem
                      key={farmer.id}
                      farmer={farmer}
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
                className="flex flex-col items-center justify-center py-16"
              >
                <Users className="w-16 h-16 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  No farmers found
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-center max-w-md">
                  Try adjusting your search or category filter to find the perfect farmer template for your needs.
                </p>
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
  onClick: () => void;
  onUse: () => void;
}> = ({ farmer, onClick, onUse }) => {
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