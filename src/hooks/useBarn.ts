import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { barnService } from '../services/barnService';
import { BarnItem, BarnFolder, BarnStats } from '../types/barn';

interface BarnItemFilter {
  type?: BarnItem['type'];
  category?: string;
  tags?: string[];
  folderId?: string;
  searchQuery?: string;
}

export function useBarnItems(filter?: BarnItemFilter) {
  const [items, setItems] = useState<BarnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket } = useWebSocket({ 
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567' 
  });

  // Load barn items
  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await barnService.getAll(filter);
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load barn items');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Store harvest in barn
  const storeHarvest = useCallback(async (
    harvestId: string,
    options?: {
      name?: string;
      description?: string;
      type?: BarnItem['type'];
      category?: string;
      tags?: string[];
      folderId?: string;
    }
  ) => {
    try {
      const newItem = await barnService.storeHarvest(harvestId, options);
      setItems(prev => [newItem, ...prev]);
      return newItem;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to store harvest');
    }
  }, []);

  // Update barn item
  const updateItem = useCallback(async (id: string, updates: Partial<BarnItem>) => {
    try {
      const updatedItem = await barnService.updateItem(id, updates);
      setItems(prev => prev.map(item => item.id === id ? updatedItem : item));
      return updatedItem;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update barn item');
    }
  }, []);

  // Use barn item
  const useItem = useCallback(async (id: string) => {
    try {
      const updatedItem = await barnService.useItem(id);
      setItems(prev => prev.map(item => item.id === id ? updatedItem : item));
      return updatedItem;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to use barn item');
    }
  }, []);

  // Delete barn item
  const deleteItem = useCallback(async (id: string) => {
    try {
      await barnService.deleteItem(id);
      setItems(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to delete barn item');
    }
  }, []);

  // Listen for WebSocket events
  useEffect(() => {
    if (!socket) return;

    const handleItemStored = (data: any) => {
      loadItems(); // Refresh the list
    };

    const handleItemUsed = (data: any) => {
      // Update specific item's use count
      setItems(prev => prev.map(item => 
        item.id === data.itemId 
          ? { ...item, useCount: data.useCount, lastUsedAt: new Date() }
          : item
      ));
    };

    const handleItemDeleted = (data: any) => {
      setItems(prev => prev.filter(item => item.id !== data.itemId));
    };

    socket.on('barn:item-stored', handleItemStored);
    socket.on('barn:item-used', handleItemUsed);
    socket.on('barn:item-deleted', handleItemDeleted);

    return () => {
      socket.off('barn:item-stored', handleItemStored);
      socket.off('barn:item-used', handleItemUsed);
      socket.off('barn:item-deleted', handleItemDeleted);
    };
  }, [socket, loadItems]);

  // Initial load
  useEffect(() => {
    loadItems();
  }, [loadItems]);

  return {
    items,
    loading,
    error,
    storeHarvest,
    updateItem,
    useItem,
    deleteItem,
    refresh: loadItems
  };
}

export function useBarnItem(id: string) {
  const [item, setItem] = useState<BarnItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadItem = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await barnService.getById(id);
        setItem(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load barn item');
      } finally {
        setLoading(false);
      }
    };

    loadItem();
  }, [id]);

  // Subscribe to item updates
  useEffect(() => {
    const unsubscribe = barnService.subscribeToItem(id, (updatedItem) => {
      setItem(updatedItem);
    });

    return unsubscribe;
  }, [id]);

  return { item, loading, error };
}

export function useBarnFolders() {
  const [folders, setFolders] = useState<BarnFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFolders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await barnService.getFolders();
      setFolders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load barn folders');
    } finally {
      setLoading(false);
    }
  }, []);

  const createFolder = useCallback(async (
    name: string,
    description?: string,
    parentId?: string
  ) => {
    try {
      const newFolder = await barnService.createFolder(name, description, parentId);
      setFolders(prev => [...prev, newFolder]);
      return newFolder;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to create folder');
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  return {
    folders,
    loading,
    error,
    createFolder,
    refresh: loadFolders
  };
}

export function useBarnStats() {
  const [stats, setStats] = useState<BarnStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket } = useWebSocket({ 
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567' 
  });

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await barnService.getStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load barn statistics');
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh stats when barn items change
  useEffect(() => {
    if (!socket) return;

    const events = ['barn:item-stored', 'barn:item-deleted', 'barn:item-used'];
    const handleUpdate = () => loadStats();

    events.forEach(event => socket.on(event, handleUpdate));
    
    return () => {
      events.forEach(event => socket.off(event, handleUpdate));
    };
  }, [socket, loadStats]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return { stats, loading, error, refresh: loadStats };
}

// Helper hook to convert barn item to seed
export function useBarnItemToSeed(itemId: string) {
  const [yaml, setYaml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convertToSeed = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const yamlContent = await barnService.createSeedFromItem(itemId);
      setYaml(yamlContent);
      return yamlContent;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to convert to seed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  return { yaml, loading, error, convertToSeed };
}