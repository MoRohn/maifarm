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
  Zap
} from 'lucide-react';
import { clsx } from 'clsx';
import { FarmerTemplate, FarmerCategory } from '../../types/farmers';
import { api } from '../../services/apiClient';
import { FarmerCard } from './FarmerCard';
import { FarmerProfile } from './FarmerProfile';

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
      if (response.data.success) {
        setFarmers(response.data.data);
        setCategories(response.data.categories);
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
    // Navigate to the farmer-specific farm creation page
    navigate('/farms/create-from-farmer', {
      state: {
        farmerTemplate: farmer,
        suggestedName: `${farmer.title} Farm`,
        suggestedDescription: `Farm created using the ${farmer.title} farmer template`,
        maxAgents: Math.min(farmer.config.maxAgents || 8, 8)
      }
    });
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
              <div className="p-2 bg-gradient-to-br from-green-400 to-green-700 rounded-apple">
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
        {/* Featured Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-6 bg-gradient-to-r from-green-500 to-emerald-600 rounded-apple-lg text-white"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <Sparkles className="w-5 h-5" />
                <span className="text-sm font-medium">Featured Farmer</span>
              </div>
              <h2 className="text-2xl font-bold mb-2">The Visionary Rooster 🐓</h2>
              <p className="text-white/90 mb-4">
                Former Stanford dropout turned serial entrepreneur. Helps you build AI-first startups that reach $10M revenue in 12 months.
              </p>
              <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm">95% Success Rate</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Award className="w-4 h-4" />
                  <span className="text-sm">YC Graduate</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4" />
                  <span className="text-sm">Expert Level</span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  const visionaryRooster = farmers.find(f => f.id === 'vision-rooster');
                  if (visionaryRooster) handleUseFarmer(visionaryRooster);
                }}
                className="px-6 py-3 bg-emerald-500 text-white font-medium rounded-apple hover:bg-emerald-600 transition-colors"
              >
                Use Farmer
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  const visionaryRooster = farmers.find(f => f.id === 'vision-rooster');
                  if (visionaryRooster) handleFarmerClick(visionaryRooster);
                }}
                className="px-6 py-3 bg-white text-green-600 font-medium rounded-apple hover:bg-gray-100 transition-colors"
              >
                View Profile
              </motion.button>
            </div>
          </div>
        </motion.div>

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
    </div>
  );
};

// List view component
const FarmerListItem: React.FC<{
  farmer: FarmerTemplate;
  onClick: () => void;
  onUse: () => void;
}> = ({ farmer, onClick, onUse }) => {
  const getCategoryIcon = (category: string) => {
    const icons = {
      startup: '🚀',
      technical: '💻',
      creative: '🎨',
      research: '🔬',
      operations: '⚙️'
    };
    return icons[category as keyof typeof icons] || '🌾';
  };

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className="bg-white dark:bg-gray-900 rounded-apple-lg p-4 border border-gray-200 dark:border-gray-800 cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900 dark:to-emerald-900 rounded-apple">
            <span className="text-2xl">{getCategoryIcon(farmer.category)}</span>
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">
              {farmer.title}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {farmer.description}
            </p>
            <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
              <span>{farmer.metadata.num_agents} agents</span>
              <span>•</span>
              <span className="capitalize">{farmer.metadata.complexity} level</span>
              <span>•</span>
              <span>{farmer.agents.length} specialized roles</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
              e.stopPropagation();
              onUse();
            }}
            className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors"
          >
            Use Farmer
          </motion.button>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </div>
      </div>
    </motion.div>
  );
};