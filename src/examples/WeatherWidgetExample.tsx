import React from 'react';
import { WeatherWidget } from '../components/common/WeatherWidget';

/**
 * Weather Widget Usage Examples
 * 
 * The WeatherWidget component displays current weather information
 * with a modern glassmorphism design and smooth animations.
 */

export const WeatherWidgetExample: React.FC = () => {
  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-bold mb-4">Weather Widget Examples</h1>
      
      {/* Basic Usage */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Basic Usage</h2>
        <WeatherWidget />
      </section>

      {/* With Custom Location */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Custom Location</h2>
        <WeatherWidget location="Tokyo" />
      </section>

      {/* Fahrenheit Units */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Fahrenheit Units</h2>
        <WeatherWidget location="New York" unit="fahrenheit" />
      </section>

      {/* With API Key (for production) */}
      <section>
        <h2 className="text-lg font-semibold mb-2">With API Key</h2>
        <code className="block bg-gray-100 p-2 rounded mb-2">
          {`<WeatherWidget apiKey="YOUR_API_KEY" location="London" />`}
        </code>
        <p className="text-sm text-gray-600">
          Note: To use real weather data, obtain an API key from OpenWeatherMap
          and pass it to the component.
        </p>
      </section>

      {/* Multiple Widgets Side by Side */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Multiple Locations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <WeatherWidget location="Paris" />
          <WeatherWidget location="Sydney" />
          <WeatherWidget location="Dubai" />
        </div>
      </section>
    </div>
  );
};

export default WeatherWidgetExample;