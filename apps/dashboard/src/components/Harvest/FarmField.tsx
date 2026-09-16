import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wheat, Sprout, TreePine, Flower, Bug, Bird } from 'lucide-react';
import { clsx } from 'clsx';

interface FarmFieldProps {
  children: React.ReactNode;
  fieldId: number;
  agentName?: string;
  status?: 'planting' | 'growing' | 'harvesting' | 'harvested' | 'idle';
  cropType?: 'wheat' | 'corn' | 'carrots' | 'potatoes';
  className?: string;
}

export const FarmField: React.FC<FarmFieldProps> = ({
  children,
  fieldId,
  agentName,
  status = 'idle',
  cropType = 'wheat',
  className
}) => {
  const [growthStage, setGrowthStage] = useState(0);
  const [showAnimals, setShowAnimals] = useState(false);

  useEffect(() => {
    // Animate growth based on status
    if (status === 'growing') {
      const interval = setInterval(() => {
        setGrowthStage(prev => (prev < 3 ? prev + 1 : prev));
      }, 5000);
      return () => clearInterval(interval);
    } else if (status === 'harvested') {
      setGrowthStage(3);
    } else if (status === 'planting') {
      setGrowthStage(0);
    }
  }, [status]);

  useEffect(() => {
    // Randomly show farm animals
    const timeout = setTimeout(() => {
      setShowAnimals(Math.random() > 0.7);
    }, Math.random() * 10000 + 5000);
    return () => clearTimeout(timeout);
  }, []);

  const getCropIcon = () => {
    switch (cropType) {
      case 'wheat': return <Wheat className="w-4 h-4" />;
      case 'corn': return <TreePine className="w-4 h-4" />;
      case 'carrots': return <Flower className="w-4 h-4" />;
      default: return <Sprout className="w-4 h-4" />;
    }
  };

  const getFieldColor = () => {
    switch (status) {
      case 'planting': return 'from-amber-900 to-amber-800';
      case 'growing': return 'from-green-800 to-green-700';
      case 'harvesting': return 'from-yellow-700 to-amber-600';
      case 'harvested': return 'from-amber-800 to-amber-700';
      default: return 'from-green-900 to-green-800';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: fieldId * 0.1 }}
      className={clsx(
        'relative rounded-lg overflow-hidden',
        className
      )}
    >
      {/* Field Background with Gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${getFieldColor()} opacity-20`} />
      
      {/* Crop Rows Pattern */}
      <div className="absolute inset-0 pointer-events-none">
        <svg className="w-full h-full opacity-10">
          <defs>
            <pattern id={`crop-rows-${fieldId}`} x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              <line x1="0" y1="20" x2="40" y2="20" stroke="currentColor" strokeWidth="1" className="text-green-700" />
              <line x1="20" y1="0" x2="20" y2="40" stroke="currentColor" strokeWidth="0.5" className="text-green-600" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#crop-rows-${fieldId})`} />
        </svg>
      </div>

      {/* Wooden Fence Border */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Top Fence */}
        <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-b from-amber-800 to-amber-900 border-t-2 border-amber-700">
          <div className="flex justify-around h-full">
            {[...Array(10)].map((_, i) => (
              <div key={`top-${i}`} className="w-1 bg-amber-900" />
            ))}
          </div>
        </div>
        
        {/* Bottom Fence */}
        <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-t from-amber-800 to-amber-900 border-b-2 border-amber-700">
          <div className="flex justify-around h-full">
            {[...Array(10)].map((_, i) => (
              <div key={`bottom-${i}`} className="w-1 bg-amber-900" />
            ))}
          </div>
        </div>
        
        {/* Left Fence */}
        <div className="absolute top-0 left-0 bottom-0 w-3 bg-gradient-to-r from-amber-800 to-amber-900 border-l-2 border-amber-700">
          <div className="flex flex-col justify-around w-full h-full">
            {[...Array(8)].map((_, i) => (
              <div key={`left-${i}`} className="h-1 bg-amber-900" />
            ))}
          </div>
        </div>
        
        {/* Right Fence */}
        <div className="absolute top-0 right-0 bottom-0 w-3 bg-gradient-to-l from-amber-800 to-amber-900 border-r-2 border-amber-700">
          <div className="flex flex-col justify-around w-full h-full">
            {[...Array(8)].map((_, i) => (
              <div key={`right-${i}`} className="h-1 bg-amber-900" />
            ))}
          </div>
        </div>

        {/* Corner Posts */}
        <div className="absolute top-0 left-0 w-4 h-4 bg-amber-900 rounded-full border-2 border-amber-700" />
        <div className="absolute top-0 right-0 w-4 h-4 bg-amber-900 rounded-full border-2 border-amber-700" />
        <div className="absolute bottom-0 left-0 w-4 h-4 bg-amber-900 rounded-full border-2 border-amber-700" />
        <div className="absolute bottom-0 right-0 w-4 h-4 bg-amber-900 rounded-full border-2 border-amber-700" />
      </div>

      {/* Field Sign */}
      <div className="absolute top-4 left-4 z-10">
        <motion.div
          initial={{ rotate: -5 }}
          animate={{ rotate: 5 }}
          transition={{ duration: 3, repeat: Infinity, repeatType: "reverse" }}
          className="bg-amber-700 px-3 py-1 rounded shadow-lg border-2 border-amber-600"
        >
          <div className="flex items-center space-x-2">
            {getCropIcon()}
            <span className="text-xs font-bold text-amber-100">
              Field #{fieldId + 1}
            </span>
          </div>
          {agentName && (
            <div className="text-xs text-amber-200 mt-0.5">
              {agentName}
            </div>
          )}
        </motion.div>
      </div>

      {/* Growth Stage Indicators */}
      <div className="absolute top-4 right-4 z-10">
        <div className="flex space-x-1">
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0 }}
              animate={{ scale: i <= growthStage ? 1 : 0.5 }}
              transition={{ delay: i * 0.2 }}
              className={clsx(
                'w-6 h-6 rounded-full flex items-center justify-center',
                i <= growthStage 
                  ? 'bg-green-500 text-white' 
                  : 'bg-gray-600 text-gray-400'
              )}
            >
              <Sprout className="w-3 h-3" />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Random Farm Animals */}
      <AnimatePresence>
        {showAnimals && (
          <>
            <motion.div
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ duration: 1 }}
              className="absolute bottom-20 left-8 z-10"
            >
              <Bird className="w-4 h-4 text-gray-700" />
            </motion.div>
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 1, delay: 0.5 }}
              className="absolute top-20 right-12 z-10"
            >
              <Bug className="w-3 h-3 text-gray-600" />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Crop Animation Overlay */}
      {status === 'growing' && (
        <div className="absolute inset-x-0 bottom-16 flex justify-around pointer-events-none">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              animate={{ 
                rotate: [-2, 2, -2],
                y: [0, -2, 0]
              }}
              transition={{ 
                duration: 3 + i * 0.2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="text-green-600 opacity-30"
            >
              {getCropIcon()}
            </motion.div>
          ))}
        </div>
      )}

      {/* Terminal Content Container */}
      <div className="relative z-20 m-3">
        {children}
      </div>

      {/* Status Bar */}
      <div className="absolute bottom-3 left-3 right-3 z-10">
        <div className="bg-black/50 backdrop-blur-sm rounded px-2 py-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-green-400 font-mono">
              Status: {status}
            </span>
            <span className="text-xs text-amber-400 font-mono">
              Crop: {cropType}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};