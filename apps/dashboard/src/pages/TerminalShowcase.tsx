/**
 * Terminal Showcase Page
 *
 * Demonstrates the enhanced light mode terminal with various themes
 * and features for testing and presentation purposes.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Sun,
  Moon,
  Info,
  Code2,
  Palette,
  Terminal as TerminalIcon,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  XCircle,
  Package,
  Zap
} from 'lucide-react';
import EnhancedLightTerminal from '@/components/Terminal/EnhancedLightTerminal';
import { lightThemes, enhancedTerminalThemes } from '@/config/terminalThemesEnhanced';
import '../styles/enhanced-terminal.css';

// Sample terminal output for demonstration
const generateSampleOutput = (): string[] => {
  return [
    '$ npm install @maifarm/terminal-enhanced',
    'Installing packages...',
    '',
    '⠋ Installing dependencies...',
    '⠙ Resolving packages...',
    '⠹ Downloading @maifarm/core@2.5.0...',
    '⠸ Downloading @maifarm/ui@1.2.3...',
    '⠼ Downloading @maifarm/utils@3.0.1...',
    '',
    '✓ Packages installed successfully!',
    '',
    '$ npm run build',
    '',
    '> maifarm@2.5.0 build',
    '> vite build',
    '',
    'vite v5.0.0 building for production...',
    '',
    'transforming...',
    '✓ 1523 modules transformed.',
    '',
    'rendering chunks...',
    'computing gzip size...',
    '',
    'dist/index.html                   0.46 kB │ gzip:  0.30 kB',
    'dist/assets/index-DiwGThb8.css   142.68 kB │ gzip: 23.45 kB',
    'dist/assets/index-CzgQm5n9.js    523.42 kB │ gzip: 168.32 kB',
    '',
    '✓ built in 12.34s',
    '',
    '$ npm test',
    '',
    'PASS  src/components/Terminal.test.tsx',
    '  Terminal Component',
    '    ✓ renders without crashing (45ms)',
    '    ✓ displays output correctly (12ms)',
    '    ✓ handles theme switching (8ms)',
    '    ✓ supports search functionality (15ms)',
    '    ✓ maintains WCAG AAA compliance (22ms)',
    '',
    'Test Suites: 1 passed, 1 total',
    'Tests:       5 passed, 5 total',
    'Snapshots:   0 total',
    'Time:        2.156s',
    '',
    '$ git status',
    'On branch feature/enhanced-terminal',
    'Your branch is up to date with \'origin/feature/enhanced-terminal\'.',
    '',
    'Changes to be committed:',
    '  (use "git restore --staged <file>..." to unstage)',
    '        new file:   src/components/Terminal/EnhancedLightTerminal.tsx',
    '        new file:   src/config/terminalThemesEnhanced.ts',
    '        new file:   src/styles/enhanced-terminal.css',
    '',
    '$ echo "Terminal enhancement complete!"',
    'Terminal enhancement complete!',
    '',
    '$ Performance Metrics:',
    'INFO: Rendering performance: 60 FPS stable',
    'INFO: Memory usage: 42.3 MB (optimized)',
    'INFO: Load time: 0.234s',
    'SUCCESS: All performance benchmarks passed',
    '',
    'WARNING: Large dataset detected (10,000+ lines)',
    'INFO: Virtual scrolling enabled for optimal performance',
    '',
    'ERROR: Failed to connect to remote server',
    'DEBUG: Attempting reconnection... (attempt 1/3)',
    'DEBUG: Attempting reconnection... (attempt 2/3)',
    'SUCCESS: Connection restored',
    '',
    '$ claude-cli analyze --performance',
    'Analyzing terminal performance...',
    '',
    '┌─────────────────────────────────────┐',
    '│  Performance Analysis Report        │',
    '├─────────────────────────────────────┤',
    '│  Contrast Ratio:    AAA (21:1)     │',
    '│  Readability Score: 98/100         │',
    '│  Accessibility:     WCAG AAA       │',
    '│  Render Time:       < 16ms         │',
    '│  Memory Footprint:  Optimized      │',
    '└─────────────────────────────────────┘',
    '',
    'Analysis complete. Terminal is production-ready.',
  ];
};

interface ThemeCardProps {
  themeName: string;
  isActive: boolean;
  onClick: () => void;
}

const ThemeCard: React.FC<ThemeCardProps> = ({ themeName, isActive, onClick }) => {
  const theme = enhancedTerminalThemes[themeName];

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`relative p-4 rounded-xl cursor-pointer transition-all ${
        isActive ? 'ring-2 ring-blue-500 shadow-lg' : 'shadow-md hover:shadow-lg'
      }`}
      style={{
        background: theme.backgroundGradient || theme.backgroundColor,
        border: `1px solid ${theme.borderColor}`,
      }}
    >
      {isActive && (
        <div className="absolute top-2 right-2">
          <CheckCircle className="w-5 h-5 text-blue-500" />
        </div>
      )}

      <h3 className="font-semibold mb-2" style={{ color: theme.headerText }}>
        {theme.name}
      </h3>

      <div className="space-y-1 text-sm">
        <div className="flex items-center space-x-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: theme.textColor }}
          />
          <span style={{ color: theme.textColor }}>Text Color</span>
        </div>
        <div className="flex items-center space-x-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: theme.promptColor }}
          />
          <span style={{ color: theme.textColor }}>Prompt</span>
        </div>
        <div className="flex items-center space-x-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: theme.successColor }}
          />
          <span style={{ color: theme.textColor }}>Success</span>
        </div>
        <div className="flex items-center space-x-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: theme.errorColor }}
          />
          <span style={{ color: theme.textColor }}>Error</span>
        </div>
      </div>

      {theme.effects?.glassMorphism && (
        <div className="mt-3 flex items-center space-x-1 text-xs" style={{ color: theme.textColor }}>
          <Sparkles className="w-3 h-3" />
          <span className="opacity-60">Glass Morphism</span>
        </div>
      )}
    </motion.div>
  );
};

const TerminalShowcase: React.FC = () => {
  const [selectedTheme, setSelectedTheme] = useState('premiumLight');
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  // Simulate terminal output animation
  useEffect(() => {
    const lines = generateSampleOutput();
    let currentIndex = 0;

    const interval = setInterval(() => {
      if (currentIndex < lines.length) {
        setTerminalLines((prev) => [...prev, lines[currentIndex]]);
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const resetAnimation = useCallback(() => {
    setIsAnimating(true);
    setTerminalLines([]);
    setTimeout(() => {
      const lines = generateSampleOutput();
      let currentIndex = 0;

      const interval = setInterval(() => {
        if (currentIndex < lines.length) {
          setTerminalLines((prev) => [...prev, lines[currentIndex]]);
          currentIndex++;
        } else {
          clearInterval(interval);
          setIsAnimating(false);
        }
      }, 50);
    }, 300);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <TerminalIcon className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Enhanced Terminal Showcase</h1>
                <p className="text-sm text-gray-600">Professional Light Mode Themes</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowComparison(!showComparison)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {showComparison ? 'Hide' : 'Show'} Comparison
              </button>
              <button
                onClick={resetAnimation}
                disabled={isAnimating}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 inline mr-2 ${isAnimating ? 'animate-spin' : ''}`} />
                Replay Demo
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Theme Selector */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Palette className="w-5 h-5 mr-2" />
            Available Light Themes
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {lightThemes.map((themeName) => (
              <ThemeCard
                key={themeName}
                themeName={themeName}
                isActive={selectedTheme === themeName}
                onClick={() => setSelectedTheme(themeName)}
              />
            ))}
          </div>
        </div>

        {/* Terminal Demo */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Code2 className="w-5 h-5 mr-2" />
            Live Terminal Demo
          </h2>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <EnhancedLightTerminal
              sessionId="demo-session"
              agentId={1}
              agentName="Enhanced Terminal Demo"
              lines={terminalLines}
              defaultTheme={selectedTheme}
              showControls={true}
              autoScroll={true}
              enableSearch={true}
              onThemeChange={(theme) => setSelectedTheme(theme)}
              className="shadow-2xl"
            />
          </motion.div>
        </div>

        {/* Feature Highlights */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Zap className="w-5 h-5 mr-2" />
            Enhanced Features
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-lg shadow-md">
              <CheckCircle className="w-6 h-6 text-green-500 mb-2" />
              <h3 className="font-semibold text-gray-900 mb-1">WCAG AAA Compliance</h3>
              <p className="text-sm text-gray-600">
                All light themes meet or exceed WCAG AAA standards with contrast ratios above 7:1
              </p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-md">
              <Sun className="w-6 h-6 text-yellow-500 mb-2" />
              <h3 className="font-semibold text-gray-900 mb-1">Eye Comfort</h3>
              <p className="text-sm text-gray-600">
                Soft backgrounds and optimized typography reduce eye strain during extended use
              </p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-md">
              <Sparkles className="w-6 h-6 text-purple-500 mb-2" />
              <h3 className="font-semibold text-gray-900 mb-1">Modern Design</h3>
              <p className="text-sm text-gray-600">
                Glass morphism, subtle gradients, and smooth animations for a premium feel
              </p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-md">
              <Package className="w-6 h-6 text-blue-500 mb-2" />
              <h3 className="font-semibold text-gray-900 mb-1">Virtual Scrolling</h3>
              <p className="text-sm text-gray-600">
                Handles 10,000+ lines smoothly with optimized performance and memory usage
              </p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-md">
              <AlertCircle className="w-6 h-6 text-orange-500 mb-2" />
              <h3 className="font-semibold text-gray-900 mb-1">Smart Highlighting</h3>
              <p className="text-sm text-gray-600">
                Automatic syntax highlighting with context-aware coloring for different output types
              </p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-md">
              <TerminalIcon className="w-6 h-6 text-indigo-500 mb-2" />
              <h3 className="font-semibold text-gray-900 mb-1">Professional Tools</h3>
              <p className="text-sm text-gray-600">
                Search, export, zoom controls, and line numbers for professional development
              </p>
            </div>
          </div>
        </div>

        {/* Comparison View */}
        <AnimatePresence>
          {showComparison && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Info className="w-5 h-5 mr-2" />
                Theme Comparison
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Premium Light</h3>
                  <EnhancedLightTerminal
                    sessionId="compare-1"
                    agentId={2}
                    agentName="Premium Light Theme"
                    lines={terminalLines}
                    defaultTheme="premiumLight"
                    showControls={false}
                    className="shadow-lg"
                  />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Soft Pastel</h3>
                  <EnhancedLightTerminal
                    sessionId="compare-2"
                    agentId={3}
                    agentName="Soft Pastel Theme"
                    lines={terminalLines}
                    defaultTheme="softPastel"
                    showControls={false}
                    className="shadow-lg"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Performance Metrics */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">AAA</div>
              <div className="text-sm text-gray-600">WCAG Rating</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">21:1</div>
              <div className="text-sm text-gray-600">Contrast Ratio</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">60 FPS</div>
              <div className="text-sm text-gray-600">Render Speed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">&lt;50ms</div>
              <div className="text-sm text-gray-600">Response Time</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TerminalShowcase;