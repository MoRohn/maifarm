import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Home, Package, Warehouse, Sparkles, CheckCircle2, Circle, Trees, Wheat, Cloud, Sun, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { useThemeStore } from '@/store/themeStore';

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
  const [currentStep] = useState(2); // Set to 2 for Harvest step
  const [hoveredConcept, setHoveredConcept] = useState<string | null>(null);
  const { theme } = useThemeStore();
  const isDarkMode = theme === 'dark';

  if (!isOpen) return null;

  const steps = [
    { id: 1, name: 'Farm Setup', description: 'Agents initialized', status: 'completed', icon: '🌱' },
    { id: 2, name: 'Harvesting', description: 'Collecting outputs', status: 'current', icon: '🌾' },
    { id: 3, name: 'Store in Barn', description: 'Organize results', status: 'upcoming', icon: '🏚️' },
    { id: 4, name: 'Ready to Use', description: 'Access your work', status: 'upcoming', icon: '✨' }
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Enhanced Backdrop with stronger blur and darker background */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 backdrop-blur-3xl bg-black/80"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(0, 0, 0, 0.75), rgba(0, 0, 0, 0.9))',
            backdropFilter: 'blur(30px) saturate(150%)',
            WebkitBackdropFilter: 'blur(30px) saturate(150%)'
          }}
        />
        
        {/* Modal with Enhanced Dark Glass Effect */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="relative w-full max-w-5xl"
          style={{
            background: 'linear-gradient(135deg, rgba(20, 25, 35, 0.9), rgba(10, 15, 25, 0.85))',
            backdropFilter: 'blur(60px) saturate(180%) brightness(0.9)',
            WebkitBackdropFilter: 'blur(60px) saturate(180%) brightness(0.9)',
            borderRadius: '32px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: `
              0 40px 80px -20px rgba(0, 0, 0, 0.8),
              0 0 0 1px rgba(255, 255, 255, 0.05) inset,
              0 20px 40px -10px rgba(0, 0, 0, 0.6),
              0 0 120px rgba(59, 130, 246, 0.05)
            `
          }}
        >
          {/* Close Button */}
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 rounded-full"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
            }}
            aria-label="Close modal"
          >
            <X className="w-5 h-5 text-gray-300" />
          </motion.button>

          {/* Header */}
          <div className="px-8 pt-8 pb-4 text-center">
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex items-center justify-center space-x-3 mb-2"
            >
              <div className="p-2 rounded-2xl">
                 <img src="/maifarm-icon-forest-walk-dark.svg" alt="Logo" className="w-16 h-16" />
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-green-300 via-forest-300 to-leaf-300 bg-clip-text text-transparent">
                You are a MaiFarmer now!
              </h2>
            </motion.div>
            {farmName && (
              <motion.p
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-gray-400 text-sm"
              >
                "{farmName}" is being harvested now
              </motion.p>
            )}
          </div>

          {/* Cartoon Farm Aerial View */}
          <div className="px-8 pb-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="relative rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, #87CEEB 0%, #98D8C8 50%, #7CB342 100%)',
                height: '280px',
                boxShadow: 'inset 0 2px 20px rgba(0, 0, 0, 0.1)'
              }}
            >
              {/* Sky Elements */}
              <motion.div
                animate={{ x: [0, 20, 0] }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute top-4 left-8"
              >
                <Cloud className="w-12 h-12 text-white/80" />
              </motion.div>
              <motion.div
                animate={{ x: [0, -15, 0] }}
                transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                className="absolute top-8 right-16"
              >
                <Cloud className="w-10 h-10 text-white/70" />
              </motion.div>
              <Sun className="absolute top-4 right-8 w-12 h-12 text-yellow-400" />

              {/* Farm Field Pattern */}
              <div className="absolute bottom-0 left-0 right-0 h-32">
                <div className="grid grid-cols-8 gap-1 h-full px-4">
                  {[...Array(8)].map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ delay: 0.4 + i * 0.05 }}
                      className={`${i % 2 === 0 ? 'bg-green-500/30' : 'bg-green-600/30'} rounded-t-lg origin-bottom`}
                    />
                  ))}
                </div>
              </div>

              {/* Floating Info Cards */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                onMouseEnter={() => setHoveredConcept('farm')}
                onMouseLeave={() => setHoveredConcept(null)}
                className="absolute left-12 bottom-20 cursor-pointer"
                whileHover={{ scale: 1.05, y: -5 }}
              >
                <div className="relative">
                  <div className="p-4 rounded-xl shadow-lg"
                    style={{
                      background: hoveredConcept === 'farm' 
                        ? 'rgba(30, 35, 45, 0.95)' 
                        : 'rgba(20, 25, 35, 0.85)',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      minWidth: '140px',
                      boxShadow: hoveredConcept === 'farm'
                        ? '0 8px 24px rgba(0, 0, 0, 0.4), 0 0 40px rgba(249, 115, 22, 0.1)'
                        : '0 4px 16px rgba(0, 0, 0, 0.3)'
                    }}>
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="p-1.5 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg">
                        <Home className="w-4 h-4 text-white" />
                      </div>
                      <span className="font-semibold text-sm text-gray-200">Farm</span>
                    </div>
                    <p className="text-xs text-gray-400">AI agents working together</p>
                  </div>
                  <Trees className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 w-8 h-8 text-green-600" />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                onMouseEnter={() => setHoveredConcept('harvest')}
                onMouseLeave={() => setHoveredConcept(null)}
                className="absolute left-1/2 bottom-32 transform -translate-x-1/2 cursor-pointer"
                whileHover={{ scale: 1.05, y: -5 }}
              >
                <div className="relative">
                  <div className="p-4 rounded-xl shadow-lg"
                    style={{
                      background: hoveredConcept === 'harvest'
                        ? 'rgba(30, 35, 45, 0.95)'
                        : 'rgba(20, 25, 35, 0.85)',
                      backdropFilter: 'blur(20px)',
                      border: '2px solid rgba(34, 197, 94, 0.5)',
                      minWidth: '140px',
                      boxShadow: hoveredConcept === 'harvest' 
                        ? '0 0 30px rgba(34, 197, 94, 0.4), 0 8px 24px rgba(0, 0, 0, 0.4)'
                        : '0 4px 16px rgba(0, 0, 0, 0.3)'
                    }}>
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="p-1.5 bg-gradient-to-r from-green-500 to-green-600 rounded-lg">
                        <Package className="w-4 h-4 text-white" />
                      </div>
                      <span className="font-semibold text-sm text-gray-200">Harvest</span>
                      {hoveredConcept === 'harvest' && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full font-medium"
                        >
                          Active
                        </motion.span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">Collecting outputs now</p>
                  </div>
                  <Wheat className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 w-8 h-8 text-yellow-600" />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                onMouseEnter={() => setHoveredConcept('barn')}
                onMouseLeave={() => setHoveredConcept(null)}
                className="absolute right-12 bottom-16 cursor-pointer"
                whileHover={{ scale: 1.05, y: -5 }}
              >
                <div className="relative">
                  <div className="p-4 rounded-xl shadow-lg"
                    style={{
                      background: hoveredConcept === 'barn'
                        ? 'rgba(30, 35, 45, 0.95)'
                        : 'rgba(20, 25, 35, 0.85)',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      minWidth: '140px',
                      boxShadow: hoveredConcept === 'barn'
                        ? '0 8px 24px rgba(0, 0, 0, 0.4), 0 0 40px rgba(239, 68, 68, 0.1)'
                        : '0 4px 16px rgba(0, 0, 0, 0.3)'
                    }}>
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="p-1.5 bg-gradient-to-r from-red-500 to-red-600 rounded-lg">
                        <Warehouse className="w-4 h-4 text-white" />
                      </div>
                      <span className="font-semibold text-sm text-gray-200">Barn</span>
                    </div>
                    <p className="text-xs text-gray-400">Safe storage ready</p>
                  </div>
                  <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 w-12 h-10 bg-red-700 rounded-t-xl" 
                    style={{
                      clipPath: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)'
                    }}
                  />
                </div>
              </motion.div>
            </motion.div>
          </div>

          {/* Enhanced Progress Steps */}
          <div className="px-8 pb-6">
            <div className="rounded-2xl p-6"
              style={{
                background: 'rgba(15, 20, 30, 0.6)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: 'inset 0 2px 20px rgba(0, 0, 0, 0.2)'
              }}>
              <h3 className="text-lg font-semibold mb-4 text-center text-gray-200">Your Journey Progress</h3>
              
              <div className="relative">
                {/* Progress Line */}
                <div className="absolute top-8 left-0 right-0 h-0.5 bg-gray-700">
                  <motion.div
                    initial={{ width: '0%' }}
                    animate={{ width: '25%' }}
                    transition={{ delay: 0.8, duration: 0.5 }}
                    className="h-full bg-gradient-to-r from-green-500 to-green-600"
                    style={{
                      boxShadow: '0 0 10px rgba(34, 197, 94, 0.5)'
                    }}
                  />
                </div>

                {/* Steps */}
                <div className="grid grid-cols-4 relative">
                  {steps.map((step, index) => (
                    <motion.div
                      key={step.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + index * 0.1 }}
                      className="text-center"
                    >
                      <div className="relative">
                        <motion.div
                          whileHover={{ scale: 1.1 }}
                          className={clsx(
                            "w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-2xl transition-all duration-300",
                            step.status === 'completed' && "bg-gradient-to-r from-green-500 to-green-600 shadow-lg",
                            step.status === 'current' && "bg-gradient-to-r from-blue-500 to-indigo-600 shadow-xl animate-pulse",
                            step.status === 'upcoming' && "bg-gray-800"
                          )}
                          style={{
                            boxShadow: step.status === 'current' 
                              ? '0 0 30px rgba(59, 130, 246, 0.5)' 
                              : step.status === 'completed'
                              ? '0 0 20px rgba(34, 197, 94, 0.3)'
                              : 'inset 0 2px 4px rgba(0, 0, 0, 0.3)'
                          }}
                        >
                          {step.status === 'completed' ? (
                            <CheckCircle2 className="w-8 h-8 text-white" />
                          ) : step.status === 'current' ? (
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            >
                              {step.icon}
                            </motion.div>
                          ) : (
                            <span className="opacity-50">{step.icon}</span>
                          )}
                        </motion.div>
                        
                        {step.status === 'current'}
                      </div>
                      
                      <div className="mt-3">
                        <p className={clsx(
                          "text-sm font-medium",
                          step.status === 'completed' && "text-green-400",
                          step.status === 'current' && "text-blue-400",
                          step.status === 'upcoming' && "text-gray-500"
                        )}>
                          {step.name}
                        </p>
                        <p className={clsx(
                          "text-xs mt-1",
                          step.status === 'upcoming' ? "text-gray-600" : "text-gray-400"
                        )}>
                          {step.description}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 pb-8">
            <div className="flex justify-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onContinue}
                className="group relative px-8 py-3 rounded-2xl font-semibold text-white overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #10B981, #228b22, #06B6D4)',
                  boxShadow: '0 10px 40px rgba(34, 139, 34, 0.3), 0 0 60px rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                <motion.div
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  style={{ 
                    background: 'linear-gradient(135deg, #228b22, #228b22, #10B981)',
                    opacity: 0
                  }}
                />
                <span className="relative flex items-center space-x-2">
                  <span>Continue to Harvest</span>
                  <motion.div
                    animate={{ x: [0, 5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </motion.div>
                </span>
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};