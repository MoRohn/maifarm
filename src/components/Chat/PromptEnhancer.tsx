import React, { useState } from 'react';
import { 
  Sparkles, 
  Plus, 
  Check, 
  X, 
  Search, 
  FileText, 
  Target,
  Lightbulb,
  Info,
  Grid,
  Crosshair,
  Layers,
  Globe,
  BookOpen,
  Code,
  Zap,
  ArrowRight,
  ChevronRight
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { useThemeStore } from '@/store/themeStore';

export interface EnhancementPill {
  id: string;
  label: string;
  description?: string;
  icon?: React.ElementType;
  category?: 'research' | 'structure' | 'clarity' | 'execution';
}

interface PromptEnhancerProps {
  originalPrompt: string;
  mode: 'farm' | 'quicktask' | 'gowild';
  onEnhanced: (enhancedPrompt: string, selectedPills: string[]) => void;
  onSkip: () => void;
  className?: string;
}

export const PromptEnhancer: React.FC<PromptEnhancerProps> = ({
  originalPrompt,
  mode,
  onEnhanced,
  onSkip,
  className
}) => {
  const [selectedPills, setSelectedPills] = useState<Set<string>>(new Set());
  const [showEnhancement, setShowEnhancement] = useState(false);
  const { theme } = useThemeStore();
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Get enhancement pills - general prompt improvements
  const getEnhancementPills = (): EnhancementPill[] => {
    // Universal prompt enhancement options
    const universalPills: EnhancementPill[] = [
      { id: 'search-web', label: 'Search the internet', icon: Globe, category: 'research' },
      { id: 'format', label: 'Standardize formatting', icon: FileText, category: 'structure' },
      { id: 'clarify', label: 'Add clarity & detail', icon: Target, category: 'clarity' },
      { id: 'examples', label: 'Include examples', icon: Lightbulb, category: 'clarity' },
      { id: 'context', label: 'Add context', icon: Info, category: 'clarity' },
      { id: 'structure', label: 'Better structure', icon: Grid, category: 'structure' },
      { id: 'specific', label: 'Make more specific', icon: Crosshair, category: 'clarity' },
      { id: 'research', label: 'Deep research', icon: BookOpen, category: 'research' },
      { id: 'best-practices', label: 'Follow best practices', icon: Check, category: 'execution' },
      { id: 'step-by-step', label: 'Step-by-step approach', icon: Layers, category: 'structure' },
    ];

    // Slightly adjust selection based on mode but keep mostly universal
    switch (mode) {
      case 'farm':
        return [
          universalPills[0], // Search the internet
          universalPills[1], // Standardize formatting
          universalPills[2], // Add clarity & detail
          universalPills[3], // Include examples
          universalPills[5], // Better structure
          universalPills[8], // Best practices
          { id: 'comprehensive', label: 'Comprehensive solution', icon: Layers, category: 'execution' },
          { id: 'modular', label: 'Modular approach', icon: Grid, category: 'structure' },
        ];
      
      case 'quicktask':
        return [
          universalPills[0], // Search the internet
          universalPills[1], // Standardize formatting
          universalPills[2], // Add clarity & detail
          universalPills[6], // Make more specific
          { id: 'concise', label: 'Concise & focused', icon: Zap, category: 'execution' },
          { id: 'efficient', label: 'Efficient approach', icon: Target, category: 'execution' },
        ];
      
      case 'gowild':
        return [
          universalPills[0], // Search the internet
          universalPills[7], // Deep research
          universalPills[3], // Include examples
          universalPills[4], // Add context
          { id: 'creative', label: 'Creative exploration', icon: Sparkles, category: 'research' },
          { id: 'innovative', label: 'Innovative solutions', icon: Lightbulb, category: 'research' },
          { id: 'alternatives', label: 'Multiple approaches', icon: Code, category: 'structure' },
        ];
      
      default:
        return universalPills.slice(0, 8);
    }
  };

  const togglePill = (pillId: string) => {
    const newSelected = new Set(selectedPills);
    if (newSelected.has(pillId)) {
      newSelected.delete(pillId);
    } else {
      newSelected.add(pillId);
    }
    setSelectedPills(newSelected);
  };

  const handleEnhance = () => {
    // Build enhanced prompt based on selected pills
    let enhanced = originalPrompt;
    const pills = getEnhancementPills();
    const selectedLabels: string[] = [];
    
    // Group enhancements by category for better prompt structure
    const enhancements: string[] = [];
    
    selectedPills.forEach(pillId => {
      const pill = pills.find(p => p.id === pillId);
      if (pill) {
        selectedLabels.push(pill.label);
        
        // Add enhancement based on pill type
        switch (pillId) {
          case 'search-web':
            enhancements.push('Search the internet for the latest information and best practices.');
            break;
          case 'format':
            enhancements.push('Use standardized formatting and consistent code style throughout.');
            break;
          case 'clarify':
            enhancements.push('Provide clear explanations and detailed implementation steps.');
            break;
          case 'examples':
            enhancements.push('Include practical examples and use cases.');
            break;
          case 'context':
            enhancements.push('Add relevant context and background information.');
            break;
          case 'structure':
            enhancements.push('Organize with a clear, logical structure.');
            break;
          case 'specific':
            enhancements.push('Be specific and precise in the implementation details.');
            break;
          case 'research':
            enhancements.push('Conduct thorough research and cite relevant sources.');
            break;
          case 'best-practices':
            enhancements.push('Follow industry best practices and conventions.');
            break;
          case 'step-by-step':
            enhancements.push('Provide a step-by-step approach with clear progression.');
            break;
          case 'comprehensive':
            enhancements.push('Deliver a comprehensive solution covering all aspects.');
            break;
          case 'modular':
            enhancements.push('Use a modular approach with reusable components.');
            break;
          case 'concise':
            enhancements.push('Keep it concise and focused on the essential elements.');
            break;
          case 'efficient':
            enhancements.push('Optimize for efficiency and performance.');
            break;
          case 'creative':
            enhancements.push('Explore creative and innovative solutions.');
            break;
          case 'innovative':
            enhancements.push('Consider cutting-edge approaches and new technologies.');
            break;
          case 'alternatives':
            enhancements.push('Present multiple alternative approaches with pros and cons.');
            break;
        }
      }
    });
    
    // Add enhancements as a structured list if any were selected
    if (enhancements.length > 0) {
      enhanced += '\n\nPlease ensure the following:\n';
      enhancements.forEach((enhancement, index) => {
        enhanced += `${index + 1}. ${enhancement}\n`;
      });
    }
    
    onEnhanced(enhanced, selectedLabels);
  };

  const pills = getEnhancementPills();
  
  // Glassmorphic category styles
  const getCategoryStyle = (category: string, isSelected: boolean = false) => {
    const baseClass = 'backdrop-blur-xl border transition-all duration-300';
    
    if (isSelected) {
      return clsx(
        baseClass,
        isDark ? [
          'bg-white/10 border-white/30',
          'text-white shadow-lg shadow-white/10'
        ] : [
          'bg-gray-900/10 border-gray-900/30',
          'text-gray-900 shadow-lg shadow-gray-900/10'
        ]
      );
    }
    
    const styles = {
      research: isDark 
        ? 'bg-sky-500/10 border-sky-500/20 text-sky-300 hover:bg-sky-500/20 hover:border-sky-500/30'
        : 'bg-sky-500/10 border-sky-500/20 text-sky-700 hover:bg-sky-500/20 hover:border-sky-500/30',
      structure: isDark
        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/30'
        : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 hover:bg-emerald-500/20 hover:border-emerald-500/30',
      clarity: isDark
        ? 'bg-purple-500/10 border-purple-500/20 text-purple-300 hover:bg-purple-500/20 hover:border-purple-500/30'
        : 'bg-purple-500/10 border-purple-500/20 text-purple-700 hover:bg-purple-500/20 hover:border-purple-500/30',
      execution: isDark
        ? 'bg-orange-500/10 border-orange-500/20 text-orange-300 hover:bg-orange-500/20 hover:border-orange-500/30'
        : 'bg-orange-500/10 border-orange-500/20 text-orange-700 hover:bg-orange-500/20 hover:border-orange-500/30',
    };
    
    return clsx(baseClass, styles[category as keyof typeof styles] || styles.clarity);
  };

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Glassmorphic Initial Question Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={clsx(
          'relative rounded-2xl p-6 backdrop-blur-xl border',
          isDark ? [
            'bg-gray-900/40 border-white/10',
            'shadow-2xl shadow-black/20'
          ] : [
            'bg-white/40 border-gray-200/50',
            'shadow-2xl shadow-gray-900/10'
          ]
        )}
      >
        {/* Gradient accent */}
        <div className="absolute inset-0 opacity-5 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-4">
            <motion.div
              className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg"
              whileHover={{ rotate: [0, -10, 10, 0] }}
              transition={{ duration: 0.5 }}
            >
              <Sparkles className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Enhance Your Prompt
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Let me help you get better results
              </p>
            </div>
          </div>
          
          <div className="flex space-x-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowEnhancement(true)}
              className={clsx(
                'px-5 py-2.5 rounded-xl font-medium transition-all flex items-center space-x-2',
                'bg-gradient-to-r from-purple-500 to-blue-500 text-white',
                'hover:from-purple-600 hover:to-blue-600',
                'shadow-lg hover:shadow-xl'
              )}
            >
              <span>Yes, enhance it</span>
              <ArrowRight className="w-4 h-4" />
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onSkip}
              className={clsx(
                'px-5 py-2.5 rounded-xl font-medium transition-all',
                'backdrop-blur-xl border',
                isDark ? [
                  'bg-white/5 border-white/10 text-gray-300',
                  'hover:bg-white/10 hover:border-white/20'
                ] : [
                  'bg-gray-900/5 border-gray-900/10 text-gray-700',
                  'hover:bg-gray-900/10 hover:border-gray-900/20'
                ]
              )}
            >
              No, use as-is
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Enhancement Pills Section */}
      <AnimatePresence>
        {showEnhancement && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={clsx(
              'relative rounded-2xl p-6 backdrop-blur-xl border',
              isDark ? [
                'bg-gray-900/40 border-white/10',
                'shadow-2xl shadow-black/20'
              ] : [
                'bg-white/40 border-gray-200/50',
                'shadow-2xl shadow-gray-900/10'
              ]
            )}
          >
            {/* Subtle gradient overlay */}
            <div className="absolute inset-0 opacity-5 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-2xl pointer-events-none" />
            
            <div className="relative z-10 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Enhancement Options
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Select the improvements you'd like to apply
                  </p>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedPills.size} selected
                </div>
              </div>
              
              {/* Pills Grid with glassmorphic style */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {pills.map((pill) => {
                  const Icon = pill.icon;
                  return (
                    <motion.button
                      key={pill.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => togglePill(pill.id)}
                      className={clsx(
                        'relative p-3 rounded-xl text-left transition-all duration-200',
                        'backdrop-blur-xl',
                        getCategoryStyle(pill.category || 'clarity', selectedPills.has(pill.id))
                      )}
                    >
                      <div className="flex items-start space-x-2">
                        <div className="flex-shrink-0 mt-0.5">
                          {selectedPills.has(pill.id) ? (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="w-5 h-5 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center"
                            >
                              <Check className="w-3 h-3 text-white" />
                            </motion.div>
                          ) : Icon ? (
                            <div className={clsx(
                              'w-5 h-5 rounded-lg flex items-center justify-center',
                              isDark ? 'bg-white/10' : 'bg-gray-900/10'
                            )}>
                              <Icon className="w-3 h-3" />
                            </div>
                          ) : (
                            <div className={clsx(
                              'w-5 h-5 rounded-lg flex items-center justify-center',
                              isDark ? 'bg-white/10' : 'bg-gray-900/10'
                            )}>
                              <Plus className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-sm mb-0.5">
                            {pill.label}
                          </div>
                          {pill.description && (
                            <div className="text-xs opacity-75 line-clamp-2">
                              {pill.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
              
              {/* Action Buttons with glassmorphic style */}
              <div className="flex items-center justify-between pt-4 border-t dark:border-white/10">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onSkip}
                  className={clsx(
                    'px-4 py-2 rounded-xl font-medium transition-all',
                    'backdrop-blur-xl',
                    isDark 
                      ? 'text-gray-400 hover:text-gray-300' 
                      : 'text-gray-600 hover:text-gray-700'
                  )}
                >
                  Skip enhancement
                </motion.button>
                
                <motion.button
                  whileHover={{ scale: selectedPills.size > 0 ? 1.02 : 1 }}
                  whileTap={{ scale: selectedPills.size > 0 ? 0.98 : 1 }}
                  onClick={handleEnhance}
                  disabled={selectedPills.size === 0}
                  className={clsx(
                    'px-6 py-2.5 rounded-xl font-medium transition-all flex items-center space-x-2',
                    selectedPills.size > 0 ? [
                      'bg-gradient-to-r from-purple-500 to-blue-500 text-white',
                      'hover:from-purple-600 hover:to-blue-600',
                      'shadow-lg hover:shadow-xl'
                    ] : [
                      'cursor-not-allowed opacity-50',
                      isDark 
                        ? 'bg-gray-800 text-gray-500 border border-gray-700' 
                        : 'bg-gray-200 text-gray-400 border border-gray-300'
                    ]
                  )}
                >
                  <span>
                    Apply {selectedPills.size > 0 && `${selectedPills.size}`} Enhancement{selectedPills.size !== 1 && 's'}
                  </span>
                  {selectedPills.size > 0 && <ChevronRight className="w-4 h-4" />}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};