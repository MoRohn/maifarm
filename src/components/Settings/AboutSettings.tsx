import React from 'react';
import { Info, Github, Twitter, Globe, Heart, ExternalLink, Shield, FileText } from 'lucide-react';
import { motion } from 'framer-motion';

const AboutSettings: React.FC = () => {
  const version = '2.0.0';
  const buildDate = '2024-02-15';
  const buildNumber = '2024.02.15.001';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          About MaiFarm
        </h3>
      </div>

      {/* Logo and Version */}
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg p-8 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="inline-flex items-center justify-center w-24 h-24 bg-white dark:bg-gray-800 rounded-2xl shadow-lg mb-4"
        >
          <span className="text-4xl">🌾</span>
        </motion.div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          MaiFarm V2
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Multi-Agent Intelligence Farm Orchestrator
        </p>
        <div className="flex items-center justify-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span>Version {version}</span>
          <span>•</span>
          <span>Build {buildNumber}</span>
        </div>
      </div>

      {/* Description */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <h4 className="font-medium text-gray-900 dark:text-white mb-3">
          What is MaiFarm?
        </h4>
        <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
          MaiFarm is an advanced orchestration platform for managing multiple AI agents working collaboratively. 
          The name combines "Mai" (My with AI spelling) and "Farm" representing the ecosystem of agents working 
          together to accomplish complex tasks. Built with cutting-edge web technologies and an Apple-inspired 
          design philosophy, MaiFarm V2 brings unprecedented power and elegance to AI agent orchestration.
        </p>
      </div>

      {/* Key Features */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <h4 className="font-medium text-gray-900 dark:text-white mb-4">
          Key Features
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h5 className="font-medium text-gray-900 dark:text-white">Secure by Design</h5>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                End-to-end encryption and local-first architecture
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Heart className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h5 className="font-medium text-gray-900 dark:text-white">AI-Powered</h5>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Intelligent suggestions and autonomous exploration
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Team */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <h4 className="font-medium text-gray-900 dark:text-white mb-4">
          Built with Love by
        </h4>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          A collaborative effort of 10 AI agents working together to create the future of AI orchestration.
        </p>
        <div className="flex flex-wrap gap-2">
          {['Architecture Agent', 'UI/UX Agent', 'Backend Agent', 'Security Agent', 'Performance Agent'].map((agent) => (
            <span
              key={agent}
              className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm"
            >
              {agent}
            </span>
          ))}
        </div>
      </div>

      {/* Links */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <h4 className="font-medium text-gray-900 dark:text-white mb-4">
          Resources
        </h4>
        <div className="space-y-3">
          <a
            href="#"
            className="flex items-center justify-between p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-gray-400" />
              <span className="text-gray-700 dark:text-gray-300">Documentation</span>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </a>
          <a
            href="#"
            className="flex items-center justify-between p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-3">
              <Github className="w-5 h-5 text-gray-400" />
              <span className="text-gray-700 dark:text-gray-300">GitHub Repository</span>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </a>
          <a
            href="#"
            className="flex items-center justify-between p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-gray-400" />
              <span className="text-gray-700 dark:text-gray-300">Website</span>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </a>
        </div>
      </div>

      {/* Legal */}
      <div className="text-center text-sm text-gray-500 dark:text-gray-400 space-y-2">
        <p>© 2024 MaiFarm. All rights reserved.</p>
        <div className="flex items-center justify-center gap-4">
          <a href="#" className="hover:text-gray-700 dark:hover:text-gray-300">Privacy Policy</a>
          <span>•</span>
          <a href="#" className="hover:text-gray-700 dark:hover:text-gray-300">Terms of Service</a>
          <span>•</span>
          <a href="#" className="hover:text-gray-700 dark:hover:text-gray-300">License</a>
        </div>
      </div>
    </div>
  );
};

export default AboutSettings;