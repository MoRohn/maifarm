/**
 * Advanced Terminal Stream Engine
 *
 * Features:
 * - Adaptive frame rate based on activity
 * - Smart buffering with backpressure
 * - Real-time performance monitoring
 * - Automatic quality adjustment
 * - Connection health tracking
 */

import { EventEmitter } from 'events';

interface StreamMetrics {
  fps: number;
  latency: number;
  bufferSize: number;
  droppedFrames: number;
  bandwidth: number;
  lastUpdate: number;
}

interface StreamConfig {
  targetFPS: number;
  maxBufferSize: number;
  adaptiveQuality: boolean;
  compressionEnabled: boolean;
  minFPS: number;
  maxFPS: number;
}

interface TerminalFrame {
  sessionId: string;
  agentId: number;
  content: string;
  timestamp: number;
  sequence: number;
  compressed?: boolean;
}

interface BufferChunk {
  frames: TerminalFrame[];
  size: number;
  timestamp: number;
}

export class AdvancedTerminalStreamEngine extends EventEmitter {
  private static instance: AdvancedTerminalStreamEngine;

  private streams: Map<string, {
    buffer: TerminalFrame[];
    config: StreamConfig;
    metrics: StreamMetrics;
    lastFlush: number;
    frameInterval: NodeJS.Timeout | null;
    paused: boolean;
  }> = new Map();

  private readonly DEFAULT_CONFIG: StreamConfig = {
    targetFPS: 30,
    maxBufferSize: 1000,
    adaptiveQuality: true,
    compressionEnabled: true,
    minFPS: 10,
    maxFPS: 60,
  };

  private performanceObserver: PerformanceObserver | null = null;
  private qualityAdjustmentInterval: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.initializePerformanceMonitoring();
    this.startQualityAdjustment();
  }

  static getInstance(): AdvancedTerminalStreamEngine {
    if (!AdvancedTerminalStreamEngine.instance) {
      AdvancedTerminalStreamEngine.instance = new AdvancedTerminalStreamEngine();
    }
    return AdvancedTerminalStreamEngine.instance;
  }

  /**
   * Initialize performance monitoring
   */
  private initializePerformanceMonitoring(): void {
    if (typeof window === 'undefined' || !window.PerformanceObserver) {
      return;
    }

    try {
      this.performanceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if (entry.entryType === 'measure') {
            this.emit('performance', {
              name: entry.name,
              duration: entry.duration,
              timestamp: entry.startTime,
            });
          }
        });
      });

      this.performanceObserver.observe({ entryTypes: ['measure'] });
    } catch (error) {
      console.warn('Performance monitoring not available:', error);
    }
  }

  /**
   * Start adaptive quality adjustment
   */
  private startQualityAdjustment(): void {
    this.qualityAdjustmentInterval = setInterval(() => {
      this.adjustStreamQualities();
    }, 2000); // Check every 2 seconds
  }

  /**
   * Adjust stream qualities based on metrics
   */
  private adjustStreamQualities(): void {
    for (const [streamKey, stream] of this.streams) {
      if (!stream.config.adaptiveQuality) continue;

      const { metrics, config } = stream;

      // Adjust FPS based on latency and dropped frames
      if (metrics.latency > 200 || metrics.droppedFrames > 10) {
        // Reduce quality
        config.targetFPS = Math.max(
          config.minFPS,
          config.targetFPS - 5
        );
      } else if (metrics.latency < 50 && metrics.droppedFrames === 0) {
        // Increase quality
        config.targetFPS = Math.min(
          config.maxFPS,
          config.targetFPS + 5
        );
      }

      // Update frame interval if FPS changed
      this.updateFrameInterval(streamKey);

      this.emit('quality:adjusted', {
        streamKey,
        targetFPS: config.targetFPS,
        latency: metrics.latency,
        droppedFrames: metrics.droppedFrames,
      });
    }
  }

  /**
   * Create a new stream
   */
  createStream(
    sessionId: string,
    agentId: number,
    config?: Partial<StreamConfig>
  ): string {
    const streamKey = `${sessionId}:${agentId}`;

    if (this.streams.has(streamKey)) {
      console.warn(`Stream already exists: ${streamKey}`);
      return streamKey;
    }

    const streamConfig = { ...this.DEFAULT_CONFIG, ...config };

    this.streams.set(streamKey, {
      buffer: [],
      config: streamConfig,
      metrics: {
        fps: streamConfig.targetFPS,
        latency: 0,
        bufferSize: 0,
        droppedFrames: 0,
        bandwidth: 0,
        lastUpdate: Date.now(),
      },
      lastFlush: Date.now(),
      frameInterval: null,
      paused: false,
    });

    this.startFrameProcessing(streamKey);

    this.emit('stream:created', { streamKey, config: streamConfig });

    return streamKey;
  }

  /**
   * Start frame processing for a stream
   */
  private startFrameProcessing(streamKey: string): void {
    const stream = this.streams.get(streamKey);
    if (!stream) return;

    const interval = 1000 / stream.config.targetFPS;

    stream.frameInterval = setInterval(() => {
      if (!stream.paused) {
        this.processFrame(streamKey);
      }
    }, interval);
  }

  /**
   * Update frame interval when FPS changes
   */
  private updateFrameInterval(streamKey: string): void {
    const stream = this.streams.get(streamKey);
    if (!stream) return;

    // Clear existing interval
    if (stream.frameInterval) {
      clearInterval(stream.frameInterval);
    }

    // Start new interval with updated FPS
    this.startFrameProcessing(streamKey);
  }

  /**
   * Add content to stream buffer
   */
  pushContent(
    sessionId: string,
    agentId: number,
    content: string,
    timestamp?: number
  ): void {
    const streamKey = `${sessionId}:${agentId}`;
    const stream = this.streams.get(streamKey);

    if (!stream) {
      console.warn(`Stream not found: ${streamKey}`);
      return;
    }

    const frame: TerminalFrame = {
      sessionId,
      agentId,
      content,
      timestamp: timestamp || Date.now(),
      sequence: stream.buffer.length,
    };

    // Compress if enabled and content is large
    if (stream.config.compressionEnabled && content.length > 1000) {
      frame.compressed = true;
      // In a real implementation, use actual compression
      // For now, just mark it
    }

    stream.buffer.push(frame);
    stream.metrics.bufferSize = stream.buffer.length;

    // Handle buffer overflow
    if (stream.buffer.length > stream.config.maxBufferSize) {
      const removed = stream.buffer.shift();
      if (removed) {
        stream.metrics.droppedFrames++;
        this.emit('frame:dropped', { streamKey, frame: removed });
      }
    }

    // Update metrics
    stream.metrics.lastUpdate = Date.now();
  }

  /**
   * Process and emit a frame
   */
  private processFrame(streamKey: string): void {
    const stream = this.streams.get(streamKey);
    if (!stream || stream.buffer.length === 0) return;

    const startTime = performance.now();

    // Get frame(s) to process
    const framesToProcess = this.getFramesToProcess(stream);

    if (framesToProcess.length === 0) return;

    // Calculate metrics
    const now = Date.now();
    const timeSinceLastFlush = now - stream.lastFlush;
    stream.metrics.latency = timeSinceLastFlush;
    stream.metrics.fps = 1000 / timeSinceLastFlush;

    // Emit frames
    this.emit('frames:ready', {
      streamKey,
      frames: framesToProcess,
      metrics: { ...stream.metrics },
    });

    stream.lastFlush = now;

    // Remove processed frames from buffer
    stream.buffer.splice(0, framesToProcess.length);
    stream.metrics.bufferSize = stream.buffer.length;

    // Performance tracking
    const processingTime = performance.now() - startTime;
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(`frame-processed-${streamKey}`);
      performance.measure(
        `frame-processing-${streamKey}`,
        undefined,
        `frame-processed-${streamKey}`
      );
    }

    this.emit('frame:processed', {
      streamKey,
      count: framesToProcess.length,
      processingTime,
      bufferRemaining: stream.buffer.length,
    });
  }

  /**
   * Get frames to process based on buffer state
   */
  private getFramesToProcess(stream: {
    buffer: TerminalFrame[];
    config: StreamConfig;
    metrics: StreamMetrics;
  }): TerminalFrame[] {
    const bufferSize = stream.buffer.length;

    if (bufferSize === 0) return [];

    // Adaptive batch size based on buffer pressure
    let batchSize = 1;

    if (bufferSize > stream.config.maxBufferSize * 0.8) {
      // Buffer is filling up, process more frames
      batchSize = Math.min(10, Math.ceil(bufferSize / 10));
    } else if (bufferSize > stream.config.maxBufferSize * 0.5) {
      batchSize = 3;
    }

    return stream.buffer.slice(0, batchSize);
  }

  /**
   * Pause streaming
   */
  pauseStream(sessionId: string, agentId: number): void {
    const streamKey = `${sessionId}:${agentId}`;
    const stream = this.streams.get(streamKey);

    if (stream) {
      stream.paused = true;
      this.emit('stream:paused', { streamKey });
    }
  }

  /**
   * Resume streaming
   */
  resumeStream(sessionId: string, agentId: number): void {
    const streamKey = `${sessionId}:${agentId}`;
    const stream = this.streams.get(streamKey);

    if (stream) {
      stream.paused = false;
      this.emit('stream:resumed', { streamKey });
    }
  }

  /**
   * Get stream metrics
   */
  getMetrics(sessionId: string, agentId: number): StreamMetrics | null {
    const streamKey = `${sessionId}:${agentId}`;
    const stream = this.streams.get(streamKey);

    return stream ? { ...stream.metrics } : null;
  }

  /**
   * Get all stream metrics
   */
  getAllMetrics(): Record<string, StreamMetrics> {
    const metrics: Record<string, StreamMetrics> = {};

    for (const [streamKey, stream] of this.streams) {
      metrics[streamKey] = { ...stream.metrics };
    }

    return metrics;
  }

  /**
   * Update stream configuration
   */
  updateConfig(
    sessionId: string,
    agentId: number,
    config: Partial<StreamConfig>
  ): void {
    const streamKey = `${sessionId}:${agentId}`;
    const stream = this.streams.get(streamKey);

    if (stream) {
      Object.assign(stream.config, config);

      // Update frame interval if FPS changed
      if (config.targetFPS !== undefined) {
        this.updateFrameInterval(streamKey);
      }

      this.emit('config:updated', { streamKey, config: stream.config });
    }
  }

  /**
   * Clear stream buffer
   */
  clearBuffer(sessionId: string, agentId: number): void {
    const streamKey = `${sessionId}:${agentId}`;
    const stream = this.streams.get(streamKey);

    if (stream) {
      stream.buffer = [];
      stream.metrics.bufferSize = 0;
      this.emit('buffer:cleared', { streamKey });
    }
  }

  /**
   * Destroy a stream
   */
  destroyStream(sessionId: string, agentId: number): void {
    const streamKey = `${sessionId}:${agentId}`;
    const stream = this.streams.get(streamKey);

    if (stream) {
      // Clear interval
      if (stream.frameInterval) {
        clearInterval(stream.frameInterval);
      }

      // Clear buffer
      stream.buffer = [];

      // Remove from map
      this.streams.delete(streamKey);

      this.emit('stream:destroyed', { streamKey });
    }
  }

  /**
   * Cleanup all streams
   */
  cleanup(): void {
    // Stop quality adjustment
    if (this.qualityAdjustmentInterval) {
      clearInterval(this.qualityAdjustmentInterval);
    }

    // Stop performance observer
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }

    // Destroy all streams
    for (const [sessionId, agentId] of Array.from(this.streams.keys()).map(
      (key) => key.split(':').map((v, i) => (i === 1 ? parseInt(v) : v))
    )) {
      this.destroyStream(sessionId as string, agentId as number);
    }

    this.emit('engine:cleanup');
  }

  /**
   * Get stream statistics
   */
  getStats(): {
    totalStreams: number;
    activeStreams: number;
    pausedStreams: number;
    totalBufferSize: number;
    avgLatency: number;
    avgFPS: number;
  } {
    let activeCount = 0;
    let pausedCount = 0;
    let totalBuffer = 0;
    let totalLatency = 0;
    let totalFPS = 0;

    for (const stream of this.streams.values()) {
      if (stream.paused) {
        pausedCount++;
      } else {
        activeCount++;
      }
      totalBuffer += stream.metrics.bufferSize;
      totalLatency += stream.metrics.latency;
      totalFPS += stream.metrics.fps;
    }

    const streamCount = this.streams.size;

    return {
      totalStreams: streamCount,
      activeStreams: activeCount,
      pausedStreams: pausedCount,
      totalBufferSize: totalBuffer,
      avgLatency: streamCount > 0 ? totalLatency / streamCount : 0,
      avgFPS: streamCount > 0 ? totalFPS / streamCount : 0,
    };
  }
}

// Export singleton
export const advancedStreamEngine = AdvancedTerminalStreamEngine.getInstance();
