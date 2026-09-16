/**
 * Advanced Terminal System Showcase
 *
 * Example implementation showcasing all features:
 * - Advanced streaming engine
 * - Responsive grid layouts
 * - Performance monitoring
 * - Recording and playback
 * - Picture-in-picture
 * - Virtual scrolling
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Square, Download, Upload, Settings } from 'lucide-react';
import { AdvancedTerminalGrid } from './AdvancedTerminalGrid';
import { TerminalPerformanceMonitor } from './TerminalPerformanceMonitor';
import { terminalRecordingService } from '@/services/TerminalRecordingService';

export const AdvancedTerminalShowcase: React.FC<{
  sessionId: string;
  agents: Array<{
    sessionId: string;
    agentId: number;
    agentName: string;
  }>;
}> = ({ sessionId, agents }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);
  const [showPerformance, setShowPerformance] = useState(true);
  const [recordings, setRecordings] = useState(terminalRecordingService.getRecordings());

  // Recording controls
  const startRecording = () => {
    const recordingId = terminalRecordingService.startRecording(
      sessionId,
      agents.map((a) => a.agentId)
    );
    setCurrentRecordingId(recordingId);
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (currentRecordingId) {
      terminalRecordingService.stopRecording(currentRecordingId);
      setRecordings(terminalRecordingService.getRecordings());
      setIsRecording(false);
      setCurrentRecordingId(null);
    }
  };

  const downloadRecording = (recordingId: string) => {
    const json = terminalRecordingService.exportToJSON(recordingId);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terminal-recording-${recordingId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importRecording = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const json = event.target?.result as string;
            terminalRecordingService.importFromJSON(json);
            setRecordings(terminalRecordingService.getRecordings());
          } catch (error) {
            console.error('Failed to import recording:', error);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  return (
    <div className="advanced-terminal-showcase h-full flex flex-col space-y-4 p-4">
      {/* Header with controls */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">
            Advanced Terminal System
          </h1>
          <p className="text-sm text-gray-400">
            Live-streaming terminals with adaptive quality and performance monitoring
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Recording controls */}
          {isRecording ? (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={stopRecording}
              className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-lg"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop Recording</span>
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={startRecording}
              className="flex items-center space-x-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 text-red-400 rounded-lg transition-colors"
            >
              <Play className="w-4 h-4" />
              <span>Start Recording</span>
            </motion.button>
          )}

          {/* Import recording */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={importRecording}
            className="p-2 bg-gray-700/50 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
            title="Import recording"
          >
            <Upload className="w-4 h-4" />
          </motion.button>

          {/* Performance toggle */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowPerformance(!showPerformance)}
            className={`p-2 rounded-lg transition-colors ${
              showPerformance
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
            }`}
            title="Toggle performance monitor"
          >
            <Settings className="w-4 h-4" />
          </motion.button>
        </div>
      </motion.div>

      {/* Performance monitor */}
      {showPerformance && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
        >
          <TerminalPerformanceMonitor />
        </motion.div>
      )}

      {/* Terminal grid */}
      <div className="flex-1 min-h-0">
        <AdvancedTerminalGrid agents={agents} className="h-full" />
      </div>

      {/* Recordings panel */}
      {recordings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50"
        >
          <h3 className="text-sm font-semibold text-gray-200 mb-3">
            Saved Recordings ({recordings.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recordings.slice(0, 6).map((recording) => (
              <motion.div
                key={recording.id}
                whileHover={{ scale: 1.02 }}
                className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/30"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-300 truncate">
                      {recording.sessionId}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(recording.startTime).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => downloadRecording(recording.id)}
                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{recording.frameCount} frames</span>
                  <span>
                    {recording.duration
                      ? `${(recording.duration / 1000).toFixed(1)}s`
                      : 'In progress'}
                  </span>
                  <span>{(recording.size / 1024).toFixed(1)} KB</span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};
