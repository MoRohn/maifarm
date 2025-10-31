import { useState, useEffect, useCallback } from 'react';
import { e2eEncryptionService } from '@/services/encryption/e2eEncryption';
import { cryptoWorkerService } from '@/services/encryption/cryptoWorker';
import { E2ESession, E2EMessage, EncryptionMetrics } from '@/types/encryption';

interface UseE2EEncryptionReturn {
  sessions: E2ESession[];
  activeSession: E2ESession | null;
  isEstablishing: boolean;
  error: Error | null;
  metrics: EncryptionMetrics | null;
  establishSession: (participantId: string) => Promise<E2ESession>;
  sendEncryptedMessage: (sessionId: string, message: string) => Promise<E2EMessage>;
  receiveEncryptedMessage: (sessionId: string, message: E2EMessage) => Promise<string>;
  terminateSession: (sessionId: string) => void;
  rotateKeys: () => Promise<void>;
}

export function useE2EEncryption(): UseE2EEncryptionReturn {
  const [sessions, setSessions] = useState<E2ESession[]>([]);
  const [activeSession, setActiveSession] = useState<E2ESession | null>(null);
  const [isEstablishing, setIsEstablishing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [metrics, setMetrics] = useState<EncryptionMetrics | null>(null);

  useEffect(() => {
    // Initialize crypto worker
    cryptoWorkerService.initialize().catch(err => {
      console.error('Failed to initialize crypto worker:', err);
      setError(err);
    });

    // Set up metrics polling
    const metricsInterval = setInterval(() => {
      const currentMetrics = e2eEncryptionService.getMetrics();
      setMetrics({
        operationsPerSecond: 0, // Would need to track this
        averageLatency: 0, // Would need to track this
        keyRotations: 0, // Would need to track this
        failedOperations: 0, // Would need to track this
        activeKeys: currentMetrics.activeKeys || 0,
        activeSessions: currentMetrics.activeSessions || 0,
      });
    }, 5000);

    return () => {
      clearInterval(metricsInterval);
      cryptoWorkerService.terminate();
    };
  }, []);

  const establishSession = useCallback(async (participantId: string): Promise<E2ESession> => {
    setIsEstablishing(true);
    setError(null);

    try {
      const session = await e2eEncryptionService.establishSession(participantId);
      setSessions(prev => [...prev, session]);
      setActiveSession(session);
      return session;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to establish session');
      setError(error);
      throw error;
    } finally {
      setIsEstablishing(false);
    }
  }, []);

  const sendEncryptedMessage = useCallback(async (
    sessionId: string,
    message: string
  ): Promise<E2EMessage> => {
    setError(null);

    try {
      const encryptedMessage = await e2eEncryptionService.encryptMessage(sessionId, message);
      return encryptedMessage;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to encrypt message');
      setError(error);
      throw error;
    }
  }, []);

  const receiveEncryptedMessage = useCallback(async (
    sessionId: string,
    message: E2EMessage
  ): Promise<string> => {
    setError(null);

    try {
      const decrypted = await e2eEncryptionService.decryptMessage(sessionId, message);
      
      // Convert ArrayBuffer to string if needed
      if (decrypted instanceof ArrayBuffer) {
        return new TextDecoder().decode(decrypted);
      }
      
      return decrypted as string;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to decrypt message');
      setError(error);
      throw error;
    }
  }, []);

  const terminateSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
    if (activeSession?.sessionId === sessionId) {
      setActiveSession(null);
    }
  }, [activeSession]);

  const rotateKeys = useCallback(async () => {
    setError(null);

    try {
      await e2eEncryptionService.rotateKeys();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to rotate keys');
      setError(error);
      throw error;
    }
  }, []);

  return {
    sessions,
    activeSession,
    isEstablishing,
    error,
    metrics,
    establishSession,
    sendEncryptedMessage,
    receiveEncryptedMessage,
    terminateSession,
    rotateKeys,
  };
}