/**
 * Hook for using the Advanced Terminal System
 *
 * Provides easy access to all advanced terminal features
 */

import { useEffect, useState, useCallback } from 'react';
import { advancedStreamEngine } from '@/services/AdvancedTerminalStreamEngine';
import { terminalRecordingService } from '@/services/TerminalRecordingService';

interface UseAdvancedTerminalOptions {
  sessionId: string;
  agentIds: number[];
  autoStart?: boolean;
  streamConfig?: {
    targetFPS?: number;
    maxBufferSize?: number;
    adaptiveQuality?: boolean;
    compressionEnabled?: boolean;
  };
}

export const useAdvancedTerminal = ({
  sessionId,
  agentIds,
  autoStart = true,
  streamConfig = {},
}: UseAdvancedTerminalOptions) => {
  const [isReady, setIsReady] = useState(false);
  const [streams, setStreams] = useState<Map<number, string>>(new Map());
  const [isRecording, setIsRecording] = useState(false);
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);

  // Initialize streams
  useEffect(() => {
    if (!autoStart || agentIds.length === 0) return;

    const newStreams = new Map<number, string>();

    agentIds.forEach((agentId) => {
      const streamKey = advancedStreamEngine.createStream(
        sessionId,
        agentId,
        streamConfig
      );
      newStreams.set(agentId, streamKey);
    });

    setStreams(newStreams);
    setIsReady(true);

    return () => {
      // Cleanup streams
      agentIds.forEach((agentId) => {
        advancedStreamEngine.destroyStream(sessionId, agentId);
      });
    };
  }, [sessionId, agentIds, autoStart, streamConfig]);

  // Push content to stream
  const pushContent = useCallback(
    (agentId: number, content: string, timestamp?: number) => {
      advancedStreamEngine.pushContent(sessionId, agentId, content, timestamp);

      // Also add to recording if active
      if (isRecording && currentRecordingId) {
        terminalRecordingService.addFrame(
          currentRecordingId,
          agentId,
          content,
          'stdout'
        );
      }
    },
    [sessionId, isRecording, currentRecordingId]
  );

  // Pause stream
  const pauseStream = useCallback(
    (agentId: number) => {
      advancedStreamEngine.pauseStream(sessionId, agentId);
    },
    [sessionId]
  );

  // Resume stream
  const resumeStream = useCallback(
    (agentId: number) => {
      advancedStreamEngine.resumeStream(sessionId, agentId);
    },
    [sessionId]
  );

  // Get metrics for an agent
  const getMetrics = useCallback(
    (agentId: number) => {
      return advancedStreamEngine.getMetrics(sessionId, agentId);
    },
    [sessionId]
  );

  // Get all stats
  const getStats = useCallback(() => {
    return advancedStreamEngine.getStats();
  }, []);

  // Start recording
  const startRecording = useCallback(() => {
    if (isRecording) return;

    const recordingId = terminalRecordingService.startRecording(
      sessionId,
      agentIds
    );
    setCurrentRecordingId(recordingId);
    setIsRecording(true);

    return recordingId;
  }, [sessionId, agentIds, isRecording]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (!isRecording || !currentRecordingId) return null;

    const recording = terminalRecordingService.stopRecording(currentRecordingId);
    setIsRecording(false);
    setCurrentRecordingId(null);

    return recording;
  }, [isRecording, currentRecordingId]);

  // Update stream config
  const updateConfig = useCallback(
    (agentId: number, config: any) => {
      advancedStreamEngine.updateConfig(sessionId, agentId, config);
    },
    [sessionId]
  );

  // Clear buffer
  const clearBuffer = useCallback(
    (agentId: number) => {
      advancedStreamEngine.clearBuffer(sessionId, agentId);
    },
    [sessionId]
  );

  return {
    isReady,
    streams,
    pushContent,
    pauseStream,
    resumeStream,
    getMetrics,
    getStats,
    updateConfig,
    clearBuffer,
    // Recording
    isRecording,
    currentRecordingId,
    startRecording,
    stopRecording,
  };
};
