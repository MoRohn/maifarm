import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Cloud, 
  CloudRain, 
  CloudSnow, 
  Sun, 
  CloudDrizzle,
  Wind,
  CloudLightning,
  Loader2,
  MapPin,
  Droplets,
  Eye,
  Gauge
} from 'lucide-react';
import { GlassPanel } from './GlassPanel';
import { cn } from '@/utils/cn';

interface WeatherData {
  temperature: number;
  condition: string;
  description: string;
  humidity: number;
  windSpeed: number;
  visibility: number;
  pressure: number;
  location: string;
  icon: string;
  feelsLike: number;
}

const weatherIcons: Record<string, React.ElementType> = {
  'clear': Sun,
  'clouds': Cloud,
  'rain': CloudRain,
  'drizzle': CloudDrizzle,
  'snow': CloudSnow,
  'thunderstorm': CloudLightning,
  'wind': Wind,
};

const weatherGradients: Record<string, string> = {
  'clear': 'from-yellow-400/20 via-orange-400/10 to-transparent',
  'clouds': 'from-gray-400/20 via-gray-300/10 to-transparent',
  'rain': 'from-blue-500/20 via-blue-400/10 to-transparent',
  'drizzle': 'from-blue-400/20 via-cyan-400/10 to-transparent',
  'snow': 'from-blue-100/30 via-white/20 to-transparent',
  'thunderstorm': 'from-purple-600/20 via-indigo-500/10 to-transparent',
  'wind': 'from-teal-400/20 via-green-400/10 to-transparent',
};

interface WeatherWidgetProps {
  apiKey?: string;
  location?: string;
  unit?: 'celsius' | 'fahrenheit';
  className?: string;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  apiKey,
  location = 'San Francisco',
  unit = 'celsius',
  className
}) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Mock data for demonstration (replace with actual API call)
  useEffect(() => {
    const fetchWeather = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Simulated API response - replace with actual API call
        // For production, use: `https://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${apiKey}&units=${unit === 'celsius' ? 'metric' : 'imperial'}`
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock weather data
        const mockData: WeatherData = {
          temperature: 22,
          condition: 'clear',
          description: 'Clear sky with light breeze',
          humidity: 65,
          windSpeed: 12,
          visibility: 10,
          pressure: 1013,
          location: location,
          icon: 'clear',
          feelsLike: 24
        };
        
        setWeather(mockData);
      } catch (err) {
        setError('Failed to fetch weather data');
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
    
    // Refresh every 10 minutes
    const interval = setInterval(fetchWeather, 600000);
    return () => clearInterval(interval);
  }, [location, apiKey, unit]);

  const WeatherIcon = weather ? weatherIcons[weather.condition] || Cloud : Cloud;
  const gradient = weather ? weatherGradients[weather.condition] || weatherGradients['clouds'] : weatherGradients['clouds'];

  const tempUnit = unit === 'celsius' ? '°C' : '°F';

  return (
    <motion.div
      className={cn('relative', className)}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      <GlassPanel
        variant="vibrant"
        className="relative overflow-hidden p-6 min-w-[320px]"
        glow={isHovered}
      >
        {/* Background gradient effect */}
        <div className={cn(
          'absolute inset-0 bg-gradient-to-br opacity-50 transition-opacity duration-500',
          gradient,
          isHovered ? 'opacity-70' : 'opacity-50'
        )} />
        
        {/* Content */}
        <div className="relative z-10">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center h-40"
              >
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </motion.div>
            ) : error ? (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center text-red-400"
              >
                {error}
              </motion.div>
            ) : weather ? (
              <motion.div
                key="weather"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {/* Location */}
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">{weather.location}</span>
                </div>

                {/* Main weather display */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <motion.div
                      animate={{ 
                        rotate: weather.condition === 'wind' ? [0, 360] : 0,
                        scale: isHovered ? 1.1 : 1
                      }}
                      transition={{ 
                        rotate: { duration: 20, repeat: Infinity, ease: 'linear' },
                        scale: { duration: 0.3 }
                      }}
                    >
                      <WeatherIcon className="w-16 h-16 text-blue-500" />
                    </motion.div>
                    
                    <div>
                      <motion.div 
                        className="text-4xl font-bold text-gray-800"
                        animate={{ scale: isHovered ? 1.05 : 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        {weather.temperature}{tempUnit}
                      </motion.div>
                      <div className="text-sm text-gray-600">
                        Feels like {weather.feelsLike}{tempUnit}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Weather description */}
                <div className="mb-4">
                  <p className="text-sm text-gray-600 capitalize">{weather.description}</p>
                </div>

                {/* Additional metrics */}
                <motion.div 
                  className="grid grid-cols-2 gap-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="flex items-center gap-2 bg-white/30 rounded-lg p-2">
                    <Droplets className="w-4 h-4 text-blue-400" />
                    <div>
                      <div className="text-xs text-gray-500">Humidity</div>
                      <div className="text-sm font-semibold text-gray-700">{weather.humidity}%</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 bg-white/30 rounded-lg p-2">
                    <Wind className="w-4 h-4 text-teal-400" />
                    <div>
                      <div className="text-xs text-gray-500">Wind</div>
                      <div className="text-sm font-semibold text-gray-700">{weather.windSpeed} km/h</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 bg-white/30 rounded-lg p-2">
                    <Eye className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">Visibility</div>
                      <div className="text-sm font-semibold text-gray-700">{weather.visibility} km</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 bg-white/30 rounded-lg p-2">
                    <Gauge className="w-4 h-4 text-green-400" />
                    <div>
                      <div className="text-xs text-gray-500">Pressure</div>
                      <div className="text-sm font-semibold text-gray-700">{weather.pressure} hPa</div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Animated background particles */}
        {weather && weather.condition === 'snow' && (
          <div className="absolute inset-0 pointer-events-none">
            {[...Array(15)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 bg-white rounded-full opacity-70"
                initial={{ 
                  x: Math.random() * 320,
                  y: -10
                }}
                animate={{ 
                  y: 400,
                  x: Math.random() * 320
                }}
                transition={{
                  duration: Math.random() * 5 + 5,
                  repeat: Infinity,
                  delay: Math.random() * 5,
                  ease: 'linear'
                }}
              />
            ))}
          </div>
        )}

        {/* Rain effect */}
        {weather && (weather.condition === 'rain' || weather.condition === 'drizzle') && (
          <div className="absolute inset-0 pointer-events-none">
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-0.5 h-4 bg-blue-400/30"
                initial={{ 
                  x: Math.random() * 320,
                  y: -20
                }}
                animate={{ 
                  y: 400
                }}
                transition={{
                  duration: weather.condition === 'rain' ? 1 : 2,
                  repeat: Infinity,
                  delay: Math.random() * 2,
                  ease: 'linear'
                }}
              />
            ))}
          </div>
        )}
      </GlassPanel>
    </motion.div>
  );
};

export default WeatherWidget;