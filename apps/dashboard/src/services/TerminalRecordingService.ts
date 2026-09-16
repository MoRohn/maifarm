/**
 * Terminal Recording Service
 *
 * Features:
 * - Record terminal sessions
 * - Playback recordings
 * - Export to various formats (JSON, ASCIINEMA, etc.)
 * - Compression and optimization
 */

import { EventEmitter } from 'events';

interface RecordingFrame {
  timestamp: number;
  agentId: number;
  content: string;
  type: 'stdout' | 'stderr' | 'command' | 'system';
}

interface RecordingMetadata {
  id: string;
  sessionId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  agentIds: number[];
  frameCount: number;
  size: number;
  compressed: boolean;
}

interface Recording {
  metadata: RecordingMetadata;
  frames: RecordingFrame[];
}

interface PlaybackState {
  recordingId: string;
  currentFrame: number;
  isPlaying: boolean;
  playbackSpeed: number;
  startTime: number;
}

export class TerminalRecordingService extends EventEmitter {
  private static instance: TerminalRecordingService;

  private activeRecordings: Map<
    string,
    {
      metadata: RecordingMetadata;
      frames: RecordingFrame[];
      startTime: number;
    }
  > = new Map();

  private savedRecordings: Map<string, Recording> = new Map();
  private playbackStates: Map<string, PlaybackState> = new Map();
  private playbackIntervals: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {
    super();
    this.loadSavedRecordings();
  }

  static getInstance(): TerminalRecordingService {
    if (!TerminalRecordingService.instance) {
      TerminalRecordingService.instance = new TerminalRecordingService();
    }
    return TerminalRecordingService.instance;
  }

  /**
   * Start recording a session
   */
  startRecording(sessionId: string, agentIds: number[]): string {
    const recordingId = `recording-${sessionId}-${Date.now()}`;

    const metadata: RecordingMetadata = {
      id: recordingId,
      sessionId,
      startTime: Date.now(),
      agentIds,
      frameCount: 0,
      size: 0,
      compressed: false,
    };

    this.activeRecordings.set(recordingId, {
      metadata,
      frames: [],
      startTime: Date.now(),
    });

    this.emit('recording:started', { recordingId, sessionId, agentIds });

    return recordingId;
  }

  /**
   * Add a frame to an active recording
   */
  addFrame(
    recordingId: string,
    agentId: number,
    content: string,
    type: RecordingFrame['type'] = 'stdout'
  ): void {
    const recording = this.activeRecordings.get(recordingId);
    if (!recording) {
      console.warn(`Recording not found: ${recordingId}`);
      return;
    }

    const frame: RecordingFrame = {
      timestamp: Date.now() - recording.startTime,
      agentId,
      content,
      type,
    };

    recording.frames.push(frame);
    recording.metadata.frameCount++;
    recording.metadata.size += content.length;

    this.emit('recording:frame-added', { recordingId, frame });
  }

  /**
   * Stop recording and save
   */
  stopRecording(recordingId: string, save: boolean = true): Recording | null {
    const recording = this.activeRecordings.get(recordingId);
    if (!recording) {
      console.warn(`Recording not found: ${recordingId}`);
      return null;
    }

    recording.metadata.endTime = Date.now();
    recording.metadata.duration = recording.metadata.endTime - recording.metadata.startTime;

    const finalRecording: Recording = {
      metadata: recording.metadata,
      frames: recording.frames,
    };

    if (save) {
      this.savedRecordings.set(recordingId, finalRecording);
      this.saveToStorage(recordingId, finalRecording);
    }

    this.activeRecordings.delete(recordingId);

    this.emit('recording:stopped', {
      recordingId,
      duration: finalRecording.metadata.duration,
      frameCount: finalRecording.metadata.frameCount,
    });

    return finalRecording;
  }

  /**
   * Get all recordings
   */
  getRecordings(): RecordingMetadata[] {
    return Array.from(this.savedRecordings.values()).map((rec) => rec.metadata);
  }

  /**
   * Get a specific recording
   */
  getRecording(recordingId: string): Recording | null {
    return this.savedRecordings.get(recordingId) || null;
  }

  /**
   * Delete a recording
   */
  deleteRecording(recordingId: string): boolean {
    const deleted = this.savedRecordings.delete(recordingId);
    if (deleted) {
      this.removeFromStorage(recordingId);
      this.emit('recording:deleted', { recordingId });
    }
    return deleted;
  }

  /**
   * Start playback of a recording
   */
  startPlayback(recordingId: string, speed: number = 1.0): boolean {
    const recording = this.savedRecordings.get(recordingId);
    if (!recording) {
      console.warn(`Recording not found: ${recordingId}`);
      return false;
    }

    // Stop existing playback if any
    this.stopPlayback(recordingId);

    const playbackState: PlaybackState = {
      recordingId,
      currentFrame: 0,
      isPlaying: true,
      playbackSpeed: speed,
      startTime: Date.now(),
    };

    this.playbackStates.set(recordingId, playbackState);

    // Start playback loop
    this.playbackLoop(recordingId, recording);

    this.emit('playback:started', { recordingId, speed });

    return true;
  }

  /**
   * Playback loop
   */
  private playbackLoop(recordingId: string, recording: Recording): void {
    const state = this.playbackStates.get(recordingId);
    if (!state || !state.isPlaying) return;

    const frames = recording.frames;
    if (state.currentFrame >= frames.length) {
      this.stopPlayback(recordingId);
      this.emit('playback:completed', { recordingId });
      return;
    }

    const currentFrame = frames[state.currentFrame];
    const nextFrame = frames[state.currentFrame + 1];

    // Emit current frame
    this.emit('playback:frame', {
      recordingId,
      frame: currentFrame,
      progress: (state.currentFrame / frames.length) * 100,
    });

    state.currentFrame++;

    // Calculate delay to next frame
    let delay = 16; // Default 60fps
    if (nextFrame) {
      const timeDiff = nextFrame.timestamp - currentFrame.timestamp;
      delay = timeDiff / state.playbackSpeed;
    }

    // Schedule next frame
    const timeout = setTimeout(() => {
      this.playbackLoop(recordingId, recording);
    }, Math.max(16, delay)); // Min 16ms (60fps)

    this.playbackIntervals.set(recordingId, timeout);
  }

  /**
   * Pause playback
   */
  pausePlayback(recordingId: string): boolean {
    const state = this.playbackStates.get(recordingId);
    if (!state) return false;

    state.isPlaying = false;
    const interval = this.playbackIntervals.get(recordingId);
    if (interval) {
      clearTimeout(interval);
      this.playbackIntervals.delete(recordingId);
    }

    this.emit('playback:paused', { recordingId });
    return true;
  }

  /**
   * Resume playback
   */
  resumePlayback(recordingId: string): boolean {
    const state = this.playbackStates.get(recordingId);
    const recording = this.savedRecordings.get(recordingId);

    if (!state || !recording) return false;

    state.isPlaying = true;
    this.playbackLoop(recordingId, recording);

    this.emit('playback:resumed', { recordingId });
    return true;
  }

  /**
   * Stop playback
   */
  stopPlayback(recordingId: string): boolean {
    const state = this.playbackStates.get(recordingId);
    if (!state) return false;

    const interval = this.playbackIntervals.get(recordingId);
    if (interval) {
      clearTimeout(interval);
      this.playbackIntervals.delete(recordingId);
    }

    this.playbackStates.delete(recordingId);

    this.emit('playback:stopped', { recordingId });
    return true;
  }

  /**
   * Seek to a specific frame
   */
  seekToFrame(recordingId: string, frameIndex: number): boolean {
    const state = this.playbackStates.get(recordingId);
    const recording = this.savedRecordings.get(recordingId);

    if (!state || !recording) return false;

    const wasPlaying = state.isPlaying;

    // Pause if playing
    if (wasPlaying) {
      this.pausePlayback(recordingId);
    }

    // Update frame index
    state.currentFrame = Math.max(0, Math.min(frameIndex, recording.frames.length - 1));

    // Resume if was playing
    if (wasPlaying) {
      this.resumePlayback(recordingId);
    }

    this.emit('playback:seeked', { recordingId, frameIndex: state.currentFrame });
    return true;
  }

  /**
   * Set playback speed
   */
  setPlaybackSpeed(recordingId: string, speed: number): boolean {
    const state = this.playbackStates.get(recordingId);
    if (!state) return false;

    state.playbackSpeed = Math.max(0.1, Math.min(speed, 10));

    this.emit('playback:speed-changed', { recordingId, speed: state.playbackSpeed });
    return true;
  }

  /**
   * Export recording to JSON
   */
  exportToJSON(recordingId: string): string {
    const recording = this.savedRecordings.get(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    return JSON.stringify(recording, null, 2);
  }

  /**
   * Export recording to ASCIINEMA format
   */
  exportToASCIINEMA(recordingId: string): string {
    const recording = this.savedRecordings.get(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    const header = {
      version: 2,
      width: 120,
      height: 30,
      timestamp: Math.floor(recording.metadata.startTime / 1000),
      duration: (recording.metadata.duration || 0) / 1000,
      title: `Terminal Recording - ${recording.metadata.sessionId}`,
    };

    const frames = recording.frames.map((frame) => [
      frame.timestamp / 1000, // Convert to seconds
      'o', // stdout
      frame.content,
    ]);

    return JSON.stringify(header) + '\n' + frames.map((f) => JSON.stringify(f)).join('\n');
  }

  /**
   * Import recording from JSON
   */
  importFromJSON(json: string): string {
    const recording: Recording = JSON.parse(json);
    this.savedRecordings.set(recording.metadata.id, recording);
    this.saveToStorage(recording.metadata.id, recording);

    this.emit('recording:imported', { recordingId: recording.metadata.id });

    return recording.metadata.id;
  }

  /**
   * Save recording to local storage
   */
  private saveToStorage(recordingId: string, recording: Recording): void {
    try {
      const key = `terminal-recording-${recordingId}`;
      localStorage.setItem(key, JSON.stringify(recording));
    } catch (error) {
      console.error('Failed to save recording to storage:', error);
    }
  }

  /**
   * Remove recording from local storage
   */
  private removeFromStorage(recordingId: string): void {
    try {
      const key = `terminal-recording-${recordingId}`;
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to remove recording from storage:', error);
    }
  }

  /**
   * Load saved recordings from local storage
   */
  private loadSavedRecordings(): void {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('terminal-recording-')) {
          const data = localStorage.getItem(key);
          if (data) {
            const recording: Recording = JSON.parse(data);
            this.savedRecordings.set(recording.metadata.id, recording);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load recordings from storage:', error);
    }
  }

  /**
   * Get playback state
   */
  getPlaybackState(recordingId: string): PlaybackState | null {
    return this.playbackStates.get(recordingId) || null;
  }

  /**
   * Compress recording
   */
  compressRecording(recordingId: string): boolean {
    const recording = this.savedRecordings.get(recordingId);
    if (!recording || recording.metadata.compressed) return false;

    // Simple compression: merge consecutive frames from same agent
    const compressed: RecordingFrame[] = [];
    let lastFrame: RecordingFrame | null = null;

    for (const frame of recording.frames) {
      if (
        lastFrame &&
        lastFrame.agentId === frame.agentId &&
        lastFrame.type === frame.type &&
        frame.timestamp - lastFrame.timestamp < 100
      ) {
        // Merge with last frame
        lastFrame.content += frame.content;
      } else {
        if (lastFrame) compressed.push(lastFrame);
        lastFrame = { ...frame };
      }
    }

    if (lastFrame) compressed.push(lastFrame);

    recording.frames = compressed;
    recording.metadata.compressed = true;
    recording.metadata.frameCount = compressed.length;

    this.saveToStorage(recordingId, recording);

    this.emit('recording:compressed', {
      recordingId,
      originalFrames: recording.frames.length,
      compressedFrames: compressed.length,
    });

    return true;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    // Stop all active recordings
    for (const recordingId of this.activeRecordings.keys()) {
      this.stopRecording(recordingId, false);
    }

    // Stop all playback
    for (const recordingId of this.playbackStates.keys()) {
      this.stopPlayback(recordingId);
    }

    this.emit('service:cleanup');
  }
}

// Export singleton
export const terminalRecordingService = TerminalRecordingService.getInstance();
