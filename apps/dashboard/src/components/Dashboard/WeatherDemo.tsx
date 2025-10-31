import React, { useState } from 'react';
import { WeatherWidget } from '../common/WeatherWidget';
import { motion } from 'framer-motion';

export const WeatherDemo: React.FC = () => {
  const [unit, setUnit] = useState<'celsius' | 'fahrenheit'>('celsius');
  const [location, setLocation] = useState('San Francisco');

  const locations = [
    'San Francisco',
    'New York',
    'London',
    'Tokyo',
    'Paris',
    'Sydney'
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-8">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            Weather Widget Demo
          </h1>
          <p className="text-gray-600">
            Modern weather component with glassmorphism effects
          </p>
        </motion.div>

        {/* Controls */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-wrap gap-4 justify-center mb-8"
        >
          <div className="flex gap-2">
            <button
              onClick={() => setUnit('celsius')}
              className={`px-4 py-2 rounded-lg transition-all ${
                unit === 'celsius'
                  ? 'bg-blue-500 text-white shadow-lg'
                  : 'bg-white/60 backdrop-blur text-gray-700 hover:bg-white/80'
              }`}
            >
              Celsius
            </button>
            <button
              onClick={() => setUnit('fahrenheit')}
              className={`px-4 py-2 rounded-lg transition-all ${
                unit === 'fahrenheit'
                  ? 'bg-blue-500 text-white shadow-lg'
                  : 'bg-white/60 backdrop-blur text-gray-700 hover:bg-white/80'
              }`}
            >
              Fahrenheit
            </button>
          </div>

          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="px-4 py-2 rounded-lg bg-white/60 backdrop-blur text-gray-700 border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </motion.div>

        {/* Weather Widget Display */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex justify-center mb-12"
        >
          <WeatherWidget
            location={location}
            unit={unit}
            className="transform hover:scale-105 transition-transform duration-300"
          />
        </motion.div>

        {/* Multiple widgets showcase */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <h2 className="text-2xl font-semibold text-gray-800 text-center mb-8">
            Multiple Locations
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {locations.slice(0, 3).map((loc, index) => (
              <motion.div
                key={loc}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.7 + index * 0.1 }}
              >
                <WeatherWidget
                  location={loc}
                  unit={unit}
                  className="w-full"
                />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default WeatherDemo;