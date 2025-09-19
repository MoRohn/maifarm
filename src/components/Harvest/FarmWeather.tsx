import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudRain, CloudSnow, Zap } from 'lucide-react';

interface FarmWeatherProps {
  weather: 'sunny' | 'cloudy' | 'rainy' | 'stormy';
  intensity?: 'light' | 'medium' | 'heavy';
}

interface Particle {
  id: number;
  x: number;
  delay: number;
  duration: number;
  size: number;
}

const FarmWeather: React.FC<FarmWeatherProps> = ({ 
  weather, 
  intensity = 'medium' 
}) => {
  const [raindrops, setRaindrops] = useState<Particle[]>([]);
  const [lightning, setLightning] = useState(false);
  const [clouds, setClouds] = useState<Particle[]>([]);

  // Generate rain particles
  useEffect(() => {
    if (weather === 'rainy' || weather === 'stormy') {
      const particleCount = intensity === 'light' ? 20 : intensity === 'medium' ? 40 : 60;
      const drops: Particle[] = [];
      
      for (let i = 0; i < particleCount; i++) {
        drops.push({
          id: i,
          x: Math.random() * 100,
          delay: Math.random() * 2,
          duration: 1 + Math.random() * 0.5,
          size: Math.random() * 2 + 1
        });
      }
      
      setRaindrops(drops);
    } else {
      setRaindrops([]);
    }
  }, [weather, intensity]);

  // Generate clouds
  useEffect(() => {
    if (weather === 'cloudy' || weather === 'rainy' || weather === 'stormy') {
      const cloudCount = weather === 'stormy' ? 8 : 5;
      const cloudList: Particle[] = [];
      
      for (let i = 0; i < cloudCount; i++) {
        cloudList.push({
          id: i,
          x: Math.random() * 120 - 10,
          delay: i * 2,
          duration: 30 + Math.random() * 20,
          size: 50 + Math.random() * 100
        });
      }
      
      setClouds(cloudList);
    } else {
      setClouds([]);
    }
  }, [weather]);

  // Lightning effect for storms
  useEffect(() => {
    if (weather === 'stormy') {
      const lightningInterval = setInterval(() => {
        if (Math.random() > 0.7) {
          setLightning(true);
          setTimeout(() => setLightning(false), 200);
        }
      }, 3000);
      
      return () => clearInterval(lightningInterval);
    }
  }, [weather]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Sun */}
      <AnimatePresence>
        {weather === 'sunny' && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 1 }}
            className="absolute top-20 right-20"
          >
            <div className="relative">
              {/* Sun rays */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0"
              >
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-1 h-16 bg-gradient-to-t from-transparent to-yellow-300"
                    style={{
                      top: '50%',
                      left: '50%',
                      transform: `translate(-50%, -50%) rotate(${i * 45}deg) translateY(-40px)`,
                      opacity: 0.6
                    }}
                  />
                ))}
              </motion.div>
              
              {/* Sun core */}
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="relative w-24 h-24 bg-gradient-to-br from-yellow-300 to-orange-400 rounded-full shadow-2xl"
              >
                <div className="absolute inset-2 bg-gradient-to-br from-yellow-200 to-yellow-400 rounded-full" />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clouds */}
      <AnimatePresence>
        {clouds.map(cloud => (
          <motion.div
            key={cloud.id}
            initial={{ x: -200, opacity: 0 }}
            animate={{ 
              x: window.innerWidth + 200,
              opacity: weather === 'stormy' ? 0.9 : 0.7
            }}
            exit={{ opacity: 0 }}
            transition={{ 
              duration: cloud.duration,
              delay: cloud.delay,
              repeat: Infinity,
              ease: "linear"
            }}
            className="absolute"
            style={{
              top: `${10 + (cloud.id % 3) * 15}%`,
              width: `${cloud.size}px`,
              height: `${cloud.size * 0.6}px`
            }}
          >
            <div className={`relative w-full h-full ${
              weather === 'stormy' ? 'text-gray-800' : 'text-white'
            }`}>
              {/* Cloud shape using overlapping circles */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`absolute w-3/4 h-3/4 ${
                  weather === 'stormy' ? 'bg-gray-800' : 'bg-white'
                } rounded-full opacity-80`} />
                <div className={`absolute w-2/3 h-2/3 ${
                  weather === 'stormy' ? 'bg-gray-700' : 'bg-white'
                } rounded-full left-1/4 opacity-90`} />
                <div className={`absolute w-2/3 h-2/3 ${
                  weather === 'stormy' ? 'bg-gray-700' : 'bg-white'
                } rounded-full right-1/4 opacity-90`} />
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Rain */}
      <AnimatePresence>
        {raindrops.map(drop => (
          <motion.div
            key={drop.id}
            initial={{ y: -10, opacity: 0 }}
            animate={{ 
              y: window.innerHeight + 10,
              opacity: [0, 0.6, 0.6, 0]
            }}
            transition={{ 
              duration: drop.duration,
              delay: drop.delay,
              repeat: Infinity,
              ease: "linear"
            }}
            className="absolute"
            style={{ left: `${drop.x}%` }}
          >
            <div 
              className="bg-gradient-to-b from-blue-400 to-blue-600 rounded-full"
              style={{
                width: `${drop.size}px`,
                height: `${drop.size * 8}px`,
                opacity: 0.6
              }}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Lightning */}
      <AnimatePresence>
        {lightning && weather === 'stormy' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="absolute inset-0 bg-white/20"
          >
            <div className="absolute top-20 left-1/3">
              <Zap className="w-32 h-32 text-yellow-300 drop-shadow-2xl" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fog/Mist for cloudy weather */}
      <AnimatePresence>
        {weather === 'cloudy' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2 }}
            className="absolute inset-0 bg-gradient-to-t from-gray-400/50 to-transparent"
          />
        )}
      </AnimatePresence>

      {/* Rainbow after storm */}
      <AnimatePresence>
        {weather === 'sunny' && Math.random() > 0.8 && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 0.4, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ duration: 3 }}
            className="absolute top-1/4 left-1/2 transform -translate-x-1/2"
          >
            <div className="relative w-96 h-48">
              <div className="absolute inset-0 bg-gradient-to-t from-transparent via-red-400 to-transparent rounded-t-full h-4 top-0" />
              <div className="absolute inset-0 bg-gradient-to-t from-transparent via-orange-400 to-transparent rounded-t-full h-4 top-4" />
              <div className="absolute inset-0 bg-gradient-to-t from-transparent via-yellow-400 to-transparent rounded-t-full h-4 top-8" />
              <div className="absolute inset-0 bg-gradient-to-t from-transparent via-green-400 to-transparent rounded-t-full h-4 top-12" />
              <div className="absolute inset-0 bg-gradient-to-t from-transparent via-blue-400 to-transparent rounded-t-full h-4 top-16" />
              <div className="absolute inset-0 bg-gradient-to-t from-transparent via-indigo-400 to-transparent rounded-t-full h-4 top-20" />
              <div className="absolute inset-0 bg-gradient-to-t from-transparent via-purple-400 to-transparent rounded-t-full h-4 top-24" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FarmWeather;