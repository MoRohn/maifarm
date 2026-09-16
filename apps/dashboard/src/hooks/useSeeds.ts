import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { seedService } from '@/services/seedService';
import { Seed, SeedFilter, SeedCreateInput, SeedUpdateInput } from '@/types/seed';

export function useSeeds(filter?: SeedFilter) {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket } = useWebSocket({ 
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567' 
  });

  // Load seeds
  const loadSeeds = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await seedService.getAll(filter);
      setSeeds(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load seeds');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filter)]); // Use stringified filter to avoid unnecessary re-renders

  // Create seed
  const createSeed = useCallback(async (input: SeedCreateInput) => {
    try {
      const newSeed = await seedService.create(input);
      setSeeds(prev => [newSeed, ...prev]);
      return newSeed;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to create seed');
    }
  }, []);

  // Update seed
  const updateSeed = useCallback(async (id: string, input: SeedUpdateInput) => {
    try {
      const updatedSeed = await seedService.update(id, input);
      setSeeds(prev => prev.map(seed => seed.id === id ? updatedSeed : seed));
      return updatedSeed;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update seed');
    }
  }, []);

  // Delete seed
  const deleteSeed = useCallback(async (id: string) => {
    try {
      await seedService.delete(id);
      setSeeds(prev => prev.filter(seed => seed.id !== id));
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to delete seed');
    }
  }, []);

  // Use seed
  const useSeed = useCallback(async (id: string) => {
    try {
      const updatedSeed = await seedService.use(id);
      setSeeds(prev => prev.map(seed => seed.id === id ? updatedSeed : seed));
      return updatedSeed;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to use seed');
    }
  }, []);

  // Listen for WebSocket events
  useEffect(() => {
    if (!socket) return;

    const handleSeedCreated = (data: any) => {
      loadSeeds(); // Refresh the list
    };

    const handleSeedUpdated = (data: any) => {
      loadSeeds(); // Refresh the list
    };

    const handleSeedDeleted = (data: any) => {
      setSeeds(prev => prev.filter(seed => seed.id !== data.seedId));
    };

    socket.on('seed:created', handleSeedCreated);
    socket.on('seed:updated', handleSeedUpdated);
    socket.on('seed:deleted', handleSeedDeleted);

    return () => {
      socket.off('seed:created', handleSeedCreated);
      socket.off('seed:updated', handleSeedUpdated);
      socket.off('seed:deleted', handleSeedDeleted);
    };
  }, [socket, loadSeeds]);

  // Initial load
  useEffect(() => {
    loadSeeds();
  }, [loadSeeds]);

  return {
    seeds,
    loading,
    error,
    createSeed,
    updateSeed,
    deleteSeed,
    useSeed,
    refresh: loadSeeds
  };
}

export function useSeed(id: string) {
  const [seed, setSeed] = useState<Seed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSeed = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await seedService.getById(id);
        setSeed(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load seed');
      } finally {
        setLoading(false);
      }
    };

    loadSeed();
  }, [id]);

  return { seed, loading, error };
}

export function useSeedCategories() {
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await seedService.getCategories();
        setCategories(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load categories');
      } finally {
        setLoading(false);
      }
    };

    loadCategories();
  }, []);

  return { categories, loading, error };
}