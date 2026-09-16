import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Wheat, 
  Users, 
  Package, 
  Sprout,
  Home as Barn,
  TreePine,
  Droplets,
  Sun,
  Cloud,
  Wind
} from 'lucide-react';

interface FarmSection {
  id: string;
  title: string;
  icon: React.ElementType;
  x: number;
  y: number;
  description: string;
  stats: {
    label: string;
    value: string | number;
  }[];
  color: string;
}

interface FarmBlueprintProps {
  metrics: {
    activeFarms: number;
    totalFarms: number;
    activeAgents: number;
    uniqueAgents: number;
    completedTasks: number;
    successRate: number;
    totalSeeds: number;
    activeHarvests: number;
    barnItems: number;
  };
}

export const FarmBlueprint: React.FC<FarmBlueprintProps> = ({ metrics }) => {
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  const farmSections: FarmSection[] = [
    {
      id: 'farms',
      title: 'Active Fields',
      icon: Wheat,
      x: 30,
      y: 25,
      description: 'Your cultivated fields where AI agents work together',
      stats: [
        { label: 'Active', value: metrics.activeFarms },
        { label: 'Total', value: metrics.totalFarms }
      ],
      color: '#10B981'
    },
    {
      id: 'farmers',
      title: 'AI Farmers',
      icon: Users,
      x: 70,
      y: 30,
      description: 'Specialized agents working on your tasks',
      stats: [
        { label: 'Active', value: metrics.activeAgents },
        { label: 'Available', value: metrics.uniqueAgents }
      ],
      color: '#3B82F6'
    },
    {
      id: 'seeds',
      title: 'Seed Storage',
      icon: Sprout,
      x: 25,
      y: 65,
      description: 'Templates and prompts ready to plant',
      stats: [
        { label: 'Seeds Ready', value: metrics.totalSeeds || 12 },
        { label: 'Categories', value: 4 }
      ],
      color: '#8B5CF6'
    },
    {
      id: 'harvest',
      title: 'Harvest Area',
      icon: Package,
      x: 75,
      y: 70,
      description: 'Collect and review completed work',
      stats: [
        { label: 'Ready', value: metrics.activeHarvests || 3 },
        { label: 'This Week', value: 24 }
      ],
      color: '#F59E0B'
    },
    {
      id: 'barn',
      title: 'The Barn',
      icon: Barn,
      x: 50,
      y: 50,
      description: 'Your storage for completed harvests',
      stats: [
        { label: 'Stored Items', value: metrics.barnItems || 48 },
        { label: 'Collections', value: 8 }
      ],
      color: '#EF4444'
    }
  ];

  return (
    <div className="relative w-full bg-gradient-to-br from-green-50 to-amber-50 dark:from-green-950/20 dark:to-amber-950/20 rounded-2xl p-8 overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 opacity-10">
        <Sun className="absolute top-4 right-4 w-12 h-12 text-yellow-500" />
        <Cloud className="absolute top-12 left-20 w-10 h-10 text-blue-400" />
        <Wind className="absolute bottom-8 right-16 w-8 h-8 text-gray-400" />
        <TreePine className="absolute bottom-4 left-4 w-10 h-10 text-green-600" />
        <TreePine className="absolute top-20 right-20 w-8 h-8 text-green-600" />
        <Droplets className="absolute bottom-16 left-32 w-6 h-6 text-blue-500" />
      </div>

      {/* Farm Blueprint SVG */}
      <svg
        viewBox="0 0 100 100"
        className="w-full h-[500px] relative z-10"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Field grid pattern */}
        <defs>
          <pattern id="farmGrid" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="10" height="10" fill="none" stroke="#10B981" strokeWidth="0.1" opacity="0.2" />
          </pattern>
          <pattern id="fieldPattern" x="0" y="0" width="2" height="2" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.2" fill="#10B981" opacity="0.1" />
          </pattern>
        </defs>

        {/* Background field */}
        <rect x="5" y="5" width="90" height="90" fill="url(#farmGrid)" rx="2" />
        
        {/* Farm paths */}
        <path
          d="M 50 5 L 50 95 M 5 50 L 95 50"
          stroke="#8B7355"
          strokeWidth="0.5"
          strokeDasharray="2 1"
          opacity="0.3"
        />
        
        {/* Diagonal paths */}
        <path
          d="M 30 25 L 50 50 L 25 65"
          stroke="#8B7355"
          strokeWidth="0.3"
          strokeDasharray="1 1"
          opacity="0.2"
        />
        <path
          d="M 70 30 L 50 50 L 75 70"
          stroke="#8B7355"
          strokeWidth="0.3"
          strokeDasharray="1 1"
          opacity="0.2"
        />

        {/* Field sections */}
        <rect x="10" y="10" width="35" height="35" fill="url(#fieldPattern)" rx="1" opacity="0.5" />
        <rect x="55" y="10" width="35" height="35" fill="url(#fieldPattern)" rx="1" opacity="0.5" />
        <rect x="10" y="55" width="35" height="35" fill="url(#fieldPattern)" rx="1" opacity="0.5" />
        <rect x="55" y="55" width="35" height="35" fill="url(#fieldPattern)" rx="1" opacity="0.5" />

        {/* Interactive farm sections */}
        {farmSections.map((section) => (
          <g key={section.id}>
            {/* Connection lines to center */}
            <line
              x1={section.x}
              y1={section.y}
              x2="50"
              y2="50"
              stroke={section.color}
              strokeWidth="0.2"
              strokeDasharray="0.5 0.5"
              opacity={hoveredSection === section.id ? 0.6 : 0.2}
            />

            {/* Section circle background */}
            <circle
              cx={section.x}
              cy={section.y}
              r="8"
              fill="white"
              stroke={section.color}
              strokeWidth={hoveredSection === section.id ? "1" : "0.5"}
              opacity={hoveredSection === section.id ? 1 : 0.9}
              className="cursor-pointer transition-all"
              onMouseEnter={() => setHoveredSection(section.id)}
              onMouseLeave={() => setHoveredSection(null)}
              onClick={() => setSelectedSection(section.id)}
            />

            {/* Section icon */}
            <foreignObject
              x={section.x - 4}
              y={section.y - 4}
              width="8"
              height="8"
              className="pointer-events-none"
            >
              <section.icon 
                className="w-8 h-8" 
                style={{ color: section.color }}
              />
            </foreignObject>

            {/* Pulse animation for active sections */}
            {Number(section.stats[0].value) > 0 && (
              <circle
                cx={section.x}
                cy={section.y}
                r="8"
                fill="none"
                stroke={section.color}
                strokeWidth="0.5"
                opacity="0.5"
              >
                <animate
                  attributeName="r"
                  values="8;12;8"
                  dur="2s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.5;0.1;0.5"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </circle>
            )}
          </g>
        ))}

        {/* Center barn building */}
        <rect x="45" y="45" width="10" height="10" fill="#8B4513" rx="1" opacity="0.6" />
        <polygon points="45,45 50,40 55,45" fill="#DC2626" opacity="0.7" />
      </svg>

      {/* Information cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-8">
        {farmSections.map((section) => (
          <motion.div
            key={section.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            onHoverStart={() => setHoveredSection(section.id)}
            onHoverEnd={() => setHoveredSection(null)}
            className={`
              bg-white dark:bg-gray-800 rounded-xl p-4 cursor-pointer
              border-2 transition-all duration-200
              ${hoveredSection === section.id 
                ? 'shadow-lg border-opacity-100' 
                : 'shadow-sm border-opacity-50'
              }
            `}
            style={{ borderColor: section.color }}
          >
            <div className="flex items-center space-x-2 mb-2">
              <div 
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${section.color}20` }}
              >
                <section.icon 
                  className="w-5 h-5" 
                  style={{ color: section.color }}
                />
              </div>
              <h4 className="font-semibold text-gray-900 dark:text-white">
                {section.title}
              </h4>
            </div>
            
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
              {section.description}
            </p>
            
            <div className="space-y-1">
              {section.stats.map((stat, idx) => (
                <div key={idx} className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 dark:text-gray-500">
                    {stat.label}:
                  </span>
                  <span 
                    className="text-sm font-bold"
                    style={{ color: section.color }}
                  >
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Selected section detail modal */}
      {selectedSection && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-2xl p-8 flex items-center justify-center z-20"
          onClick={() => setSelectedSection(null)}
        >
          <div className="max-w-md text-center">
            {(() => {
              const section = farmSections.find(s => s.id === selectedSection);
              if (!section) return null;
              return (
                <>
                  <div 
                    className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${section.color}20` }}
                  >
                    <section.icon 
                      className="w-10 h-10" 
                      style={{ color: section.color }}
                    />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    {section.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    {section.description}
                  </p>
                  <div className="flex justify-center space-x-8">
                    {section.stats.map((stat, idx) => (
                      <div key={idx}>
                        <div 
                          className="text-3xl font-bold mb-1"
                          style={{ color: section.color }}
                        >
                          {stat.value}
                        </div>
                        <div className="text-sm text-gray-500">
                          {stat.label}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    className="mt-6 px-6 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSection(null);
                    }}
                  >
                    Close
                  </button>
                </>
              );
            })()}
          </div>
        </motion.div>
      )}
    </div>
  );
};