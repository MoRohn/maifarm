import React, { useState } from 'react';
import { 
  Cloud, 
  CloudRain, 
  CloudSnow, 
  Sun, 
  CloudDrizzle,
  CloudLightning,
  Thermometer,
  Droplets
} from 'lucide-react';

interface WeatherWidgetProps {
  compact?: boolean;
  className?: string;
}

const WeatherWidget: React.FC<WeatherWidgetProps> = ({ compact = false, className = '' }) => {
  const [weather] = useState({
    temperature: 72,
    condition: 'partly-cloudy',
    description: 'Partly Cloudy',
    humidity: 65,
    location: 'San Francisco'
  });

  const getWeatherIcon = (condition: string) => {
    const iconClass = compact ? "w-8 h-8 text-white" : "w-12 h-12 text-white drop-shadow-md";
    
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
      default:
        return <Cloud className={iconClass} />;
    }
  };

  if (compact) {
    return (
      <div className={`relative rounded-2xl overflow-hidden bg-gradient-to-br from-blue-400 to-blue-600 p-0.5 ${className}`}>
        <div className="backdrop-blur-md bg-white/10 rounded-2xl p-3 border border-white/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {getWeatherIcon(weather.condition)}
              <div>
                <div className="text-2xl font-bold text-white">{weather.temperature}°</div>
                <div className="text-xs text-white/70">{weather.location}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center space-x-1 text-white/70">
                <Droplets className="w-3 h-3" />
                <span className="text-xs">{weather.humidity}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative rounded-3xl overflow-hidden bg-gradient-to-br from-blue-400 via-cyan-400 to-blue-500 p-1 ${className}`}>
      <div className="backdrop-blur-md bg-white/10 rounded-3xl p-6 shadow-xl border border-white/20">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-white text-lg font-semibold">{weather.location}</h3>
        </div>
        
        <div className="flex items-center space-x-4 mb-4">
          {getWeatherIcon(weather.condition)}
          <div>
            <div className="text-4xl font-bold text-white">{weather.temperature}°F</div>
            <div className="text-white/80">{weather.description}</div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Thermometer className="w-4 h-4 text-white/70" />
            <span className="text-white/90 text-sm">Feels like 70°</span>
          </div>
          <div className="flex items-center space-x-2">
            <Droplets className="w-4 h-4 text-white/70" />
            <span className="text-white/90 text-sm">{weather.humidity}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeatherWidget;