import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, TrendingUp, Zap, Brain } from 'lucide-react';
import { cn } from '@/utils/cn';
import { GlassPanel } from '../common/GlassPanel';
import { MetricCard } from '../common/MetricCard';
import { useScrollAnimation } from '@/hooks/useAnimations';
import { fadeIn, staggerContainer, staggerItem } from '@/styles/animations';

interface HeroSectionProps {
  className?: string;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ className }) => {
  const { ref, controls } = useScrollAnimation();

  const suggestions = [
    {
      title: 'Optimize Agent Performance',
      description: 'AI analysis suggests reallocating resources to improve throughput by 23%',
      icon: TrendingUp,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      title: 'Enable Smart Scaling',
      description: 'Predictive scaling can reduce costs by 15% during low-demand periods',
      icon: Zap,
      color: 'from-purple-500 to-pink-500',
    },
    {
      title: 'Explore New Workflows',
      description: 'Discover 3 new workflow patterns based on your usage patterns',
      icon: Brain,
      color: 'from-green-500 to-emerald-500',
    },
  ];

  const metrics = [
    { title: 'Total Agents', value: '24', change: 12, trend: 'up' as const },
    { title: 'Active Tasks', value: '156', change: -5, trend: 'down' as const },
    { title: 'Success Rate', value: '98.5%', change: 2.3, trend: 'up' as const },
    { title: 'Avg Response', value: '1.2s', change: -15, trend: 'up' as const },
  ];

  return (
    <motion.section
      ref={ref}
      animate={controls}
      initial="hidden"
      variants={staggerContainer}
      className={cn('space-y-8', className)}
    >
      {/* Welcome Message */}
      <motion.div variants={fadeIn} className="text-center sm:text-left">
        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
          Welcome back to MaiFarm
        </h2>
        <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
          Your AI orchestration platform is running smoothly
        </p>
      </motion.div>

      {/* Key Metrics */}
      <motion.div 
        variants={staggerContainer}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {metrics.map((metric, _index) => (
          <motion.div key={metric.title} variants={staggerItem}>
            <MetricCard {...metric} />
          </motion.div>
        ))}
      </motion.div>

      {/* AI Suggestions */}
      <motion.div variants={fadeIn}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-yellow-500" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            AI-Driven Suggestions
          </h3>
        </div>
        
        <div className="grid md:grid-cols-3 gap-4">
          {suggestions.map((suggestion, _index) => (
            <motion.div
              key={suggestion.title}
              variants={staggerItem}
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <GlassPanel variant="card" className="h-full p-6 cursor-pointer group">
                <div className={cn(
                  'w-12 h-12 rounded-lg bg-gradient-to-br flex items-center justify-center mb-4',
                  'group-hover:scale-110 transition-transform duration-300',
                  suggestion.color
                )}>
                  <suggestion.icon className="w-6 h-6 text-white" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {suggestion.title}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {suggestion.description}
                </p>
              </GlassPanel>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.section>
  );
};