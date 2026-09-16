import React, { useState, useEffect } from 'react';
import { 
  Cloud, 
  CloudRain, 
  CloudSnow, 
  Sun, 
  CloudDrizzle,
  Wind,
  CloudLightning,
  Thermometer,
  Droplets,
  Eye
} from 'lucide-react';

interface WeatherData {
  temperature: number;
  condition: string;
  description: string;
  humidity: number;
  windSpeed: number;
  visibility: number;
  feelsLike: number;
  location: string;
}

const Weather: React.FC = () => {
  const [weather, setWeather] = useState<WeatherData>({
    temperature: 72,
    condition: 'partly-cloudy',
    description: 'Partly Cloudy',
    humidity: 65,
    windSpeed: 8,
    visibility: 10,
    feelsLike: 70,
    location: 'San Francisco, CA'
  });

  const [unit, setUnit] = useState<'F' | 'C'>('F');

  const getWeatherIcon = (condition: string) => {
    const iconClass = "w-20 h-20 text-white drop-shadow-lg";
    
    switch(condition.toLowerCase()) {
      case 'clear':
      case 'sunny':
        return <Sun className={iconClass} />;
      case 'cloudy':
      case 'partly-cloudy':
        return <Cloud className={iconClass} />;
      case 'rain':
      case 'rainy':
        return <CloudRain className={iconClass} />;
      case 'drizzle':
        return <CloudDrizzle className={iconClass} />;
      case 'snow':
      case 'snowy':
        return <CloudSnow className={iconClass} />;
      case 'storm':
      case 'thunderstorm':
        return <CloudLightning className={iconClass} />;
      case 'windy':
        return <Wind className={iconClass} />;
      default:
        return <Cloud className={iconClass} />;
    }
  };

  const convertTemperature = (temp: number, toUnit: 'F' | 'C') => {
    if (toUnit === 'C') {
      return Math.round((temp - 32) * 5/9);
    }
    return temp;
  };

  const toggleUnit = () => {
    setUnit(prev => prev === 'F' ? 'C' : 'F');
  };

  const getBackgroundGradient = (condition: string) => {
    switch(condition.toLowerCase()) {
      case 'clear':
      case 'sunny':
        return 'from-yellow-400 via-orange-400 to-pink-400';
      case 'cloudy':
      case 'partly-cloudy':
        return 'from-gray-400 via-blue-400 to-gray-500';
      case 'rain':
      case 'rainy':
      case 'drizzle':
        return 'from-gray-500 via-blue-500 to-gray-600';
      case 'snow':
      case 'snowy':
        return 'from-blue-200 via-white to-gray-300';
      case 'storm':
      case 'thunderstorm':
        return 'from-gray-700 via-purple-600 to-gray-800';
      default:
        return 'from-blue-400 via-cyan-400 to-blue-500';
    }
  };

  // Simulate weather updates
  useEffect(() => {
    const conditions = ['clear', 'partly-cloudy', 'cloudy', 'rain', 'storm'];
    const descriptions = ['Clear Skies', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Thunderstorm'];
    
    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * conditions.length);
      setWeather(prev => ({
        ...prev,
        temperature: Math.floor(Math.random() * 30) + 60,
        condition: conditions[randomIndex],
        description: descriptions[randomIndex],
        humidity: Math.floor(Math.random() * 40) + 40,
        windSpeed: Math.floor(Math.random() * 20) + 5,
        feelsLike: prev.temperature + Math.floor(Math.random() * 6) - 3
      }));
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`relative min-h-[400px] rounded-3xl overflow-hidden bg-gradient-to-br ${getBackgroundGradient(weather.condition)} p-1`}>
      {/* Glassmorphism container */}
      <div className="relative h-full backdrop-blur-md bg-white/10 rounded-3xl p-8 shadow-2xl border border-white/20">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
        
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-white/90 text-sm font-medium mb-1">Current Weather</h2>
            <p className="text-white text-2xl font-semibold">{weather.location}</p>
          </div>
          <button
            onClick={toggleUnit}
            className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-full text-white text-sm font-medium transition-colors backdrop-blur-sm"
          >
            °{unit}
          </button>
        </div>

        {/* Main weather display */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-6">
            <div className="relative">
              {getWeatherIcon(weather.condition)}
              <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-16 h-2 bg-black/10 rounded-full blur-md"></div>
            </div>
            <div>
              <div className="text-6xl font-bold text-white">
                {convertTemperature(weather.temperature, unit)}°
              </div>
              <div className="text-xl text-white/90 mt-1">
                {weather.description}
              </div>
              <div className="text-sm text-white/70 mt-1">
                Feels like {convertTemperature(weather.feelsLike, unit)}°
              </div>
            </div>
          </div>
        </div>

        {/* Weather details grid */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
            <div className="flex items-center space-x-2 mb-2">
              <Droplets className="w-5 h-5 text-white/70" />
              <span className="text-white/70 text-sm">Humidity</span>
            </div>
            <div className="text-white text-2xl font-semibold">
              {weather.humidity}%
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
            <div className="flex items-center space-x-2 mb-2">
              <Wind className="w-5 h-5 text-white/70" />
              <span className="text-white/70 text-sm">Wind Speed</span>
            </div>
            <div className="text-white text-2xl font-semibold">
              {weather.windSpeed} mph
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
            <div className="flex items-center space-x-2 mb-2">
              <Eye className="w-5 h-5 text-white/70" />
              <span className="text-white/70 text-sm">Visibility</span>
            </div>
            <div className="text-white text-2xl font-semibold">
              {weather.visibility} mi
            </div>
          </div>
        </div>

        {/* Update indicator */}
        <div className="absolute bottom-4 right-4 flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span className="text-white/50 text-xs">Live</span>
        </div>
      </div>
    </div>
  );
};

export default Weather;