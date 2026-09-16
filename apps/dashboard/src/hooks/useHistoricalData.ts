import { useState, useEffect, useCallback } from 'react';
import { HistoricalFarm, HistoricalFilters, BulkAction } from '@/types/historical';

interface HistoricalStats {
  totalFarms: number;
  averageSuccessRate: number;
  totalTasksCompleted: number;
  averageDuration: number;
}

export const useHistoricalData = () => {
  const [farms, setFarms] = useState<HistoricalFarm[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<HistoricalFilters>({});
  const [stats, setStats] = useState<HistoricalStats>({
    totalFarms: 0,
    averageSuccessRate: 0,
    totalTasksCompleted: 0,
    averageDuration: 0,
  });

  // Load historical farms from localStorage
  useEffect(() => {
    setLoading(true);
    try {
      const storedFarms = localStorage.getItem('historicalFarms');
      if (storedFarms) {
        const parsedFarms = JSON.parse(storedFarms);
        setFarms(parsedFarms);
        updateStats(parsedFarms);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load historical farms');
      console.error('Error loading historical farms:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Update stats based on farms
  const updateStats = (farmList: HistoricalFarm[]) => {
    const totalFarms = farmList.length;
    const totalTasksCompleted = farmList.reduce((sum, farm) => sum + (farm.metrics?.completedTasks || 0), 0);
    const averageSuccessRate = farmList.reduce((sum, farm) => 
      sum + ((farm.metrics?.completedTasks || 0) / (farm.metrics?.totalTasks || 1) * 100), 0) / totalFarms || 0;
    const averageDuration = farmList.reduce((sum, farm) => 
      sum + (farm.duration || 0), 0) / totalFarms || 0;

    setStats({
      totalFarms,
      totalTasksCompleted,
      averageSuccessRate,
      averageDuration,
    });
  };

  // Save farms to localStorage
  const saveFarms = (updatedFarms: HistoricalFarm[]) => {
    try {
      localStorage.setItem('historicalFarms', JSON.stringify(updatedFarms));
      setFarms(updatedFarms);
      updateStats(updatedFarms);
    } catch (err) {
      console.error('Error saving historical farms:', err);
    }
  };

  // Add a completed farm to history
  const addToHistory = useCallback((farm: HistoricalFarm) => {
    const updatedFarms = [farm, ...farms];
    saveFarms(updatedFarms);
  }, [farms]);

  // Perform bulk actions
  const performBulkAction = useCallback(async (action: BulkAction['type'], farmIds: string[]) => {
    switch (action) {
      case 'delete':
        const filteredFarms = farms.filter(farm => !farmIds.includes(farm.id));
        saveFarms(filteredFarms);
        break;
      case 'archive':
        // In a local storage implementation, archiving could mean moving to a different key
        const archivedFarms = farms.filter(farm => farmIds.includes(farm.id));
        const remainingFarms = farms.filter(farm => !farmIds.includes(farm.id));
        
        // Save archived farms separately
        const existingArchived = localStorage.getItem('archivedFarms');
        const archived = existingArchived ? JSON.parse(existingArchived) : [];
        localStorage.setItem('archivedFarms', JSON.stringify([...archived, ...archivedFarms]));
        
        saveFarms(remainingFarms);
        break;
      case 'export':
        exportData(farmIds);
        break;
    }
  }, [farms]);

  // Export data
  const exportData = useCallback((farmIds?: string[]) => {
    const farmsToExport = farmIds 
      ? farms.filter(farm => farmIds.includes(farm.id))
      : farms;

    const dataStr = JSON.stringify(farmsToExport, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `maifarm-history-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }, [farms]);

  // Filter farms based on criteria
  const filteredFarms = farms.filter(farm => {
    if (filters.search && !farm.name?.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    if (filters.statuses && !filters.statuses.includes(farm.status)) {
      return false;
    }
    if (filters.dateRange) {
      const farmDate = new Date(farm.archived || farm.createdAt || Date.now());
      if (filters.dateRange.start && farmDate < new Date(filters.dateRange.start)) {
        return false;
      }
      if (filters.dateRange.end && farmDate > new Date(filters.dateRange.end)) {
        return false;
      }
    }
    return true;
  });

  return {
    farms: filteredFarms,
    loading,
    error,
    filters,
    stats,
    setFilters,
    performBulkAction,
    exportData,
    addToHistory,
  };
};