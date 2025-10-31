import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sunrise, 
  Sun, 
  Sunset, 
  Moon,
  Cloud,
  CloudRain,
  Snowflake,
  Flower2,
  Leaf,
  Trees,
  Sprout,
  Sparkles
} from 'lucide-react';

interface FarmingHeroProps {
  userName?: string;
  onPrimaryAction?: () => void;
  farmCount?: number;
}

// Farming wisdom quotes
const farmingQuotes = [
  "Plant seeds of intention, harvest fields of achievement",
  "Every great harvest begins with a single seed",
  "In the garden of AI, patience yields the sweetest fruit",
  "Cultivate ideas like crops - with care and consistency",
  "The best time to plant was yesterday, the next best time is now",
  "Digital seeds grow into technological harvests",
  "Tend your farms with wisdom, reap innovation",
  "Like farming, great code requires patience and persistence",
];

export const FarmingHero: React.FC<FarmingHeroProps> = ({ 
  userName = "Farmer",
  onPrimaryAction,
  farmCount = 0
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [quote, setQuote] = useState('');

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Set random quote on mount
  useEffect(() => {
    const randomQuote = farmingQuotes[Math.floor(Math.random() * farmingQuotes.length)];
    setQuote(randomQuote);
    
    // Change quote daily
    const quotetimer = setInterval(() => {
      const newQuote = farmingQuotes[Math.floor(Math.random() * farmingQuotes.length)];
      setQuote(newQuote);
    }, 86400000); // 24 hours
    
    return () => clearInterval(quotetimer);
  }, []);

  // Determine time of day and season
  const timeContext = useMemo(() => {
    const hour = currentTime.getHours();
    const month = currentTime.getMonth();
    
    // Time of day
    let period: 'morning' | 'afternoon' | 'evening' | 'night';
    let greeting: string;
    let icon: React.ElementType;
    let skyGradient: string;
    
    if (hour >= 5 && hour < 12) {
      period = 'morning';
      greeting = 'Good morning';
      icon = Sunrise;
      skyGradient = 'from-orange-200 via-sky-300 to-sky-400';
    } else if (hour >= 12 && hour < 17) {
      period = 'afternoon';
      greeting = 'Good afternoon';
      icon = Sun;
      skyGradient = 'from-sky-300 via-sky-400 to-sky-500';
    } else if (hour >= 17 && hour < 21) {
      period = 'evening';
      greeting = 'Good evening';
      icon = Sunset;
      skyGradient = 'from-orange-300 via-pink-300 to-purple-400';
    } else {
      period = 'night';
      greeting = 'Good evening';
      icon = Moon;
      skyGradient = 'from-indigo-900 via-purple-900 to-pink-900';
    }
    
    // Season (Northern Hemisphere)
    let season: 'spring' | 'summer' | 'fall' | 'winter';
    let seasonIcon: React.ElementType;
    let seasonalMessage: string;
    
    if (month >= 2 && month <= 4) {
      season = 'spring';
      seasonIcon = Sprout;
      seasonalMessage = 'Perfect time for planting new seeds';
    } else if (month >= 5 && month <= 7) {
      season = 'summer';
      seasonIcon = Sun;
      seasonalMessage = 'Watch your digital crops flourish';
    } else if (month >= 8 && month <= 10) {
      season = 'fall';
      seasonIcon = Leaf;
      seasonalMessage = 'Harvest season is upon us';
    } else {
      season = 'winter';
      seasonIcon = Snowflake;
      seasonalMessage = 'Time to plan next season\'s growth';
    }
    
    return {
      period,
      greeting,
      icon,
      skyGradient,
      season,
      seasonIcon,
      seasonalMessage
    };
  }, [currentTime]);

  // Farming context message based on farm count
  const farmingContext = useMemo(() => {
    if (farmCount === 0) {
      return {
        title: "Ready to start your digital farm?",
        subtitle: "Plant your first seed and watch it grow into something amazing",
        ctaText: "Plant Your First Seed",
        showCTA: true
      };
    } else if (farmCount === 1) {
      return {
        title: "Your farm is growing!",
        subtitle: "One farm planted, infinite possibilities ahead",
        ctaText: "Plant Another Seed",
        showCTA: true
      };
    } else {
      return {
        title: `Managing ${farmCount} thriving farms`,
        subtitle: timeContext.seasonalMessage,
        ctaText: "Expand Your Farm",
        showCTA: false
      };
    }
  }, [farmCount, timeContext.seasonalMessage]);

  const TimeIcon = timeContext.icon;
  const SeasonIcon = timeContext.seasonIcon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl"
    >
      {/* Animated gradient background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${timeContext.skyGradient} opacity-10 dark:opacity-5`} />
      
      {/* Parallax decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Floating particles */}
        {Array.from({ length: 5 }, (_, i) => (
          <motion.div
            key={i}
            className="absolute opacity-20 dark:opacity-10"
            initial={{
              x: Math.random() * 100 + '%',
              y: Math.random() * 100 + '%',
            }}
            animate={{
              x: [
                Math.random() * 100 + '%',
                Math.random() * 100 + '%',
                Math.random() * 100 + '%',
              ],
              y: [
                Math.random() * 100 + '%',
                Math.random() * 100 + '%',
                Math.random() * 100 + '%',
              ],
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Infinity,
              ease: "linear"
            }}
          >
            {i % 2 === 0 ? (
              <Leaf className="w-6 h-6 text-leaf-500" />
            ) : (
              <Sparkles className="w-4 h-4 text-harvest-500" />
            )}
          </motion.div>
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 px-8 py-12 md:px-12 md:py-16">
        <div className="max-w-4xl">
          {/* Greeting section */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center space-x-3 mb-4"
          >
            <div className="p-2 bg-white/20 dark:bg-gray-800/30 backdrop-blur-sm rounded-xl">
              <TimeIcon className="w-6 h-6 text-soil-600 dark:text-harvest-400" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
              {timeContext.greeting}, {userName}!
            </h1>
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            >
              <SeasonIcon className="w-6 h-6 text-leaf-500 dark:text-leaf-400" />
            </motion.div>
          </motion.div>

          {/* Context message */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-6"
          >
            <h2 className="text-xl md:text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
              {farmingContext.title}
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              {farmingContext.subtitle}
            </p>
          </motion.div>

          {/* Call to action */}
          {farmingContext.showCTA && onPrimaryAction && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mb-8"
            >
              <motion.button
                onClick={onPrimaryAction}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group relative px-8 py-4 bg-gradient-to-r from-leaf-500 to-leaf-600 text-white font-semibold rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200"
              >
                <span className="relative z-10 flex items-center space-x-2">
                  <Sprout className="w-5 h-5" />
                  <span>{farmingContext.ctaText}</span>
                </span>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-leaf-600 to-leaf-700 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </motion.button>
            </motion.div>
          )}

          {/* Daily wisdom */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="relative"
          >
            <div className="p-4 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-harvest-100 dark:bg-harvest-900/30 rounded-lg">
                  <Flower2 className="w-5 h-5 text-harvest-600 dark:text-harvest-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Daily Wisdom
                  </p>
                  <p className="text-gray-700 dark:text-gray-300 italic">
                    "{quote}"
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Seasonal decoration */}
          <motion.div
            className="absolute -bottom-4 -right-4 opacity-10 dark:opacity-5"
            animate={{ 
              rotate: [0, 5, -5, 0],
              scale: [1, 1.05, 1]
            }}
            transition={{ 
              duration: 10,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <Trees className="w-64 h-64 text-leaf-600" />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};