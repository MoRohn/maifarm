/**
 * useAnsiWorker Hook
 *
 * React hook for using the ANSI parser Web Worker.
 * Automatically manages worker lifecycle and provides a clean API.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import type { ParsedLine } from '../utils/enhancedAnsiParser';

interface WorkerMessage {
  type: string;
  id?: string;
  result?: any;
  error?: string;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

export function useAnsiWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRequests = useRef<Map<string, PendingRequest>>(new Map());
  const requestId = useRef(0);
  const [isReady, setIsReady] = useState(false);

  // Initialize worker
  useEffect(() => {
    const worker = new Worker('/workers/ansi-parser.worker.js');

    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const { type, id, result, error } = e.data;

      if (type === 'ready') {
        setIsReady(true);
        return;
      }

      if (!id) return;

      const pending = pendingRequests.current.get(id);
      if (!pending) return;

      if (type === 'success') {
        pending.resolve(result);
      } else if (type === 'error') {
        pending.reject(new Error(error || 'Worker error'));
      }

      pendingRequests.current.delete(id);
    };

    worker.onerror = (error) => {
      console.error('Worker error:', error);

      // Reject all pending requests
      for (const [id, pending] of pendingRequests.current.entries()) {
        pending.reject(new Error('Worker error'));
      }

      pendingRequests.current.clear();
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingRequests.current.clear();
    };
  }, []);

  // Send message to worker
  const sendMessage = useCallback((type: string, data: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      if (!isReady) {
        reject(new Error('Worker not ready'));
        return;
      }

      const id = `req-${++requestId.current}`;

      pendingRequests.current.set(id, { resolve, reject });

      workerRef.current.postMessage({
        type,
        data,
        id
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        const pending = pendingRequests.current.get(id);
        if (pending) {
          pending.reject(new Error('Worker timeout'));
          pendingRequests.current.delete(id);
        }
      }, 5000);
    });
  }, [isReady]);

  // Parse a single line
  const parseLine = useCallback(async (line: string): Promise<ParsedLine> => {
    return sendMessage('parse-line', line);
  }, [sendMessage]);

  // Parse multiple lines in batch
  const parseBatch = useCallback(async (lines: string[]): Promise<ParsedLine[]> => {
    return sendMessage('parse-batch', lines);
  }, [sendMessage]);

  // Clean terminal output
  const clean = useCallback(async (text: string): Promise<string> => {
    return sendMessage('clean', text);
  }, [sendMessage]);

  return {
    isReady,
    parseLine,
    parseBatch,
    clean
  };
}
