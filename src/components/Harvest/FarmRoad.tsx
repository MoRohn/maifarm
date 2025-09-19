import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Footprints, Tractor, TreePine } from 'lucide-react';
import { clsx } from 'clsx';

interface FarmRoadProps {
  direction: 'horizontal' | 'vertical' | 'intersection';
  showTraffic?: boolean;
  className?: string;
}

export const FarmRoad: React.FC<FarmRoadProps> = ({
  direction,
  showTraffic = false,
  className
}) => {
  const [dustParticles, setDustParticles] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const [tractorPosition, setTractorPosition] = useState(0);

  useEffect(() => {
    if (showTraffic) {
      // Animate tractor movement
      const interval = setInterval(() => {
        setTractorPosition(prev => (prev + 1) % 100);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [showTraffic]);

  useEffect(() => {
    // Generate random dust particles
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        const newParticle = {
          id: Date.now(),
          x: Math.random() * 100,
          y: Math.random() * 100
        };
        setDustParticles(prev => [...prev.slice(-5), newParticle]);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const getRoadPattern = () => {
    if (direction === 'horizontal') {
      return (
        <>
          {/* Main dirt road */}
          <div className="absolute inset-0 bg-gradient-to-b from-amber-700 via-amber-600 to-amber-700" />
          
          {/* Tire tracks */}
          <div className="absolute inset-x-0 top-[30%] h-[2px] bg-amber-800 opacity-50" />
          <div className="absolute inset-x-0 top-[35%] h-[1px] bg-amber-900 opacity-30" />
          <div className="absolute inset-x-0 bottom-[30%] h-[2px] bg-amber-800 opacity-50" />
          <div className="absolute inset-x-0 bottom-[35%] h-[1px] bg-amber-900 opacity-30" />
          
          {/* Road texture */}
          <svg className="absolute inset-0 w-full h-full opacity-20">
            <defs>
              <pattern id="dirt-texture-h" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="5" cy="5" r="1" fill="currentColor" className="text-amber-800" />
                <circle cx="15" cy="10" r="0.5" fill="currentColor" className="text-amber-900" />
                <circle cx="10" cy="15" r="0.8" fill="currentColor" className="text-amber-800" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dirt-texture-h)" />
          </svg>
        </>
      );
    } else if (direction === 'vertical') {
      return (
        <>
          {/* Main dirt road */}
          <div className="absolute inset-0 bg-gradient-to-r from-amber-700 via-amber-600 to-amber-700" />
          
          {/* Tire tracks */}
          <div className="absolute inset-y-0 left-[30%] w-[2px] bg-amber-800 opacity-50" />
          <div className="absolute inset-y-0 left-[35%] w-[1px] bg-amber-900 opacity-30" />
          <div className="absolute inset-y-0 right-[30%] w-[2px] bg-amber-800 opacity-50" />
          <div className="absolute inset-y-0 right-[35%] w-[1px] bg-amber-900 opacity-30" />
          
          {/* Road texture */}
          <svg className="absolute inset-0 w-full h-full opacity-20">
            <defs>
              <pattern id="dirt-texture-v" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="5" cy="5" r="1" fill="currentColor" className="text-amber-800" />
                <circle cx="15" cy="10" r="0.5" fill="currentColor" className="text-amber-900" />
                <circle cx="10" cy="15" r="0.8" fill="currentColor" className="text-amber-800" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dirt-texture-v)" />
          </svg>
        </>
      );
    } else {
      // Intersection
      return (
        <>
          {/* Main intersection */}
          <div className="absolute inset-0 bg-gradient-to-br from-amber-700 via-amber-600 to-amber-700" />
          
          {/* Crossroads pattern */}
          <div className="absolute inset-x-0 top-[48%] h-[4%] bg-amber-600" />
          <div className="absolute inset-y-0 left-[48%] w-[4%] bg-amber-600" />
          
          {/* Center circle */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-amber-700 rounded-full border-2 border-amber-800" />
          
          {/* Road texture */}
          <svg className="absolute inset-0 w-full h-full opacity-20">
            <defs>
              <pattern id="dirt-texture-i" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="2" fill="currentColor" className="text-amber-800" />
                <circle cx="20" cy="20" r="1" fill="currentColor" className="text-amber-900" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dirt-texture-i)" />
          </svg>
        </>
      );
    }
  };

  return (
    <div className={clsx('relative overflow-hidden', className)}>
      {getRoadPattern()}
      
      {/* Dust particles */}
      {dustParticles.map(particle => (
        <motion.div
          key={particle.id}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ 
            opacity: [0, 0.3, 0],
            scale: [0, 1, 0.5],
            y: -20
          }}
          transition={{ duration: 2 }}
          className="absolute w-2 h-2 bg-amber-400 rounded-full"
          style={{ 
            left: `${particle.x}%`, 
            top: `${particle.y}%` 
          }}
        />
      ))}
      
      {/* Moving tractor (horizontal roads only) */}
      {showTraffic && direction === 'horizontal' && (
        <motion.div
          animate={{ x: `${tractorPosition}%` }}
          transition={{ duration: 0.1, ease: "linear" }}
          className="absolute top-1/2 transform -translate-y-1/2"
        >
          <Tractor className="w-6 h-6 text-green-700" />
        </motion.div>
      )}
      
      {/* Random footprints */}
      {direction !== 'intersection' && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="absolute opacity-20"
              style={{
                left: `${20 + i * 30}%`,
                top: `${30 + i * 15}%`,
                transform: `rotate(${i * 45}deg)`
              }}
            >
              <Footprints className="w-4 h-4 text-amber-900" />
            </div>
          ))}
        </div>
      )}
      
      {/* Road signs at intersections */}
      {direction === 'intersection' && (
        <>
          <div className="absolute top-2 right-2">
            <div className="bg-green-700 p-1 rounded">
              <TreePine className="w-3 h-3 text-white" />
            </div>
          </div>
          <div className="absolute bottom-2 left-2">
            <div className="bg-yellow-600 p-1 rounded transform rotate-45">
              <div className="w-3 h-3 bg-black" />
            </div>
          </div>
        </>
      )}
      
      {/* Road edge stones */}
      {direction !== 'intersection' && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(5)].map((_, i) => (
            <div
              key={`stone-${i}`}
              className="absolute w-2 h-2 bg-gray-600 rounded-full opacity-40"
              style={{
                [direction === 'horizontal' ? 'left' : 'top']: `${i * 20 + 10}%`,
                [direction === 'horizontal' ? 'top' : 'left']: '10%'
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};