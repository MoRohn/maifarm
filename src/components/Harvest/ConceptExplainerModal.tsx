import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Bot, Package, Warehouse, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';

interface ConceptExplainerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  farmName?: string;
}

export const ConceptExplainerModal: React.FC<ConceptExplainerModalProps> = ({
  isOpen,
  onClose,
  onContinue,
  farmName
}) => {
  if (!isOpen) return null;

  const concepts = [
    {
      icon: Bot,
      title: "Agent Farm",
      techDescription: "A coordinated cluster of AI agents working in parallel on your tasks",
      nonTechDescription: "Think of it as a digital team where each member (agent) has specialized skills and works together to complete your project",
      color: "from-blue-500 to-blue-600"
    },
    {
      icon: Package,
      title: "Harvest",
      techDescription: "Real-time collection and aggregation of agent outputs, code, and results",
      nonTechDescription: "Like gathering the fruits of your team's work - all the files, code, and solutions they create for you",
      color: "from-green-500 to-green-600"
    },
    {
      icon: Warehouse,
      title: "Barn",
      techDescription: "Persistent storage system for completed harvests with version control and metadata",
      nonTechDescription: "Your digital warehouse where all completed work is safely stored and organized for future use",
      color: "from-amber-500 to-amber-600"
    }
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        />
        
        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", duration: 0.5 }}
          className="relative w-full max-w-6xl mx-2 sm:mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 max-h-[95vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="relative px-4 sm:px-6 lg:px-8 py-3 sm:py-4 lg:py-6 border-b border-gray-200 dark:border-gray-800">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="absolute top-2 right-2 sm:top-4 sm:right-4 p-1 sm:p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-apple-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </motion.button>
            
            <div className="flex items-center space-x-2 sm:space-x-3 mb-1 sm:mb-2">
              <div className="p-1.5 sm:p-2 bg-gradient-to-r from-primary-500 to-primary-600 rounded-apple-lg">
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">
                  Welcome to Your AI Farm!
                </h2>
                {farmName && (
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1">
                    "{farmName}" is now being prepared for you
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 px-3 sm:px-4 lg:px-8 py-3 sm:py-4 lg:py-6 overflow-y-auto">
            <div className="mb-3 sm:mb-4 lg:mb-6">
              <p className="text-gray-600 dark:text-gray-400 text-center max-w-2xl mx-auto text-xs sm:text-sm">
                You're about to experience the power of coordinated AI agents working together. 
                Here's what's happening behind the scenes:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4 mb-3 sm:mb-4 lg:mb-6">
              {concepts.map((concept, index) => (
                <motion.div
                  key={concept.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-gray-50 dark:bg-gray-800 rounded-lg sm:rounded-xl p-2 sm:p-3 lg:p-4 border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center space-x-2 sm:space-x-3 mb-2 sm:mb-3">
                    <div className={clsx(
                      "p-1 sm:p-1.5 lg:p-2 rounded-md sm:rounded-lg bg-gradient-to-r",
                      concept.color
                    )}>
                      <concept.icon className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 text-white" />
                    </div>
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">
                      {concept.title}
                    </h3>
                  </div>
                  
                  <div className="space-y-1.5 sm:space-y-2">
                    <div>
                      <h4 className="text-xs font-medium text-gray-900 dark:text-white mb-0.5 sm:mb-1">
                        Technical:
                      </h4>
                      <p className="text-xs sm:text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                        {concept.techDescription}
                      </p>
                    </div>
                    
                    <div>
                      <h4 className="text-xs font-medium text-gray-900 dark:text-white mb-0.5 sm:mb-1">
                        Simple terms:
                      </h4>
                      <p className="text-xs sm:text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                        {concept.nonTechDescription}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Process Flow */}
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-lg sm:rounded-xl p-2 sm:p-3 lg:p-4">
              <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white mb-2 sm:mb-3 text-center">
                What happens next?
              </h3>
              <div className="flex items-center justify-center space-x-2 sm:space-x-3 text-xs">
                <div className="text-center">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold mb-1 mx-auto text-xs">1</div>
                  <p className="text-gray-700 dark:text-gray-300 text-xs">Agents start</p>
                </div>
                <ArrowRight className="w-2 h-2 sm:w-3 sm:h-3 text-gray-400" />
                <div className="text-center">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 bg-green-500 rounded-full flex items-center justify-center text-white font-semibold mb-1 mx-auto text-xs">2</div>
                  <p className="text-gray-700 dark:text-gray-300 text-xs">Get harvested</p>
                </div>
                <ArrowRight className="w-2 h-2 sm:w-3 sm:h-3 text-gray-400" />
                <div className="text-center">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 bg-amber-500 rounded-full flex items-center justify-center text-white font-semibold mb-1 mx-auto text-xs">3</div>
                  <p className="text-gray-700 dark:text-gray-300 text-xs">Saved to Barn</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-3 sm:px-4 lg:px-8 py-2 sm:py-3 lg:py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex justify-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onContinue}
                className="flex items-center space-x-1 sm:space-x-2 px-4 sm:px-6 lg:px-8 py-2 sm:py-2.5 lg:py-3 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white rounded-full font-semibold transition-all duration-300 shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm sm:text-base"
              >
                <span>Continue</span>
                <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};