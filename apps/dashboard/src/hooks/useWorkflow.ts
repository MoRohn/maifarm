import { useState, useEffect, useCallback } from 'react';
import { workflowService, WorkflowStatus, WorkflowOptions, WorkflowResult } from '@/services/farmService';
import { useWebSocket } from './useWebSocket';
import { toast } from 'react-hot-toast';

export const useWorkflow = () => {
  const [activeWorkflows, setActiveWorkflows] = useState<WorkflowStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const { socket } = useWebSocket({
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567'
  });

  // Load active workflows on mount
  useEffect(() => {
    loadActiveWorkflows();
  }, []);

  // Subscribe to WebSocket events for workflow updates
  useEffect(() => {
    if (!socket) return;

    const handleWorkflowProgress = (data: WorkflowStatus) => {
      setActiveWorkflows(prev => {
        const index = prev.findIndex(w => w.workflowId === data.workflowId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = data;
          return updated;
        } else {
          return [...prev, data];
        }
      });

      // Show toast notifications for important status changes
      if (data.status === 'completed') {
        toast.success(`Workflow ${data.workflowId} completed successfully!`);
      } else if (data.status === 'failed') {
        toast.error(`Workflow ${data.workflowId} failed: ${data.error}`);
      }
    };

    socket.on('workflow:progress', handleWorkflowProgress);

    return () => {
      socket.off('workflow:progress', handleWorkflowProgress);
    };
  }, [socket]);

  const loadActiveWorkflows = async () => {
    try {
      setLoading(true);
      const workflows = await workflowService.getActiveWorkflows();
      setActiveWorkflows(workflows);
    } catch (error) {
      console.error('Error loading active workflows:', error);
      toast.error('Failed to load active workflows');
    } finally {
      setLoading(false);
    }
  };

  const executeWorkflow = useCallback(async (options: WorkflowOptions): Promise<WorkflowResult> => {
    try {
      setLoading(true);
      const result = await workflowService.executeWorkflow(options);
      
      // Add to active workflows
      const status = await workflowService.getWorkflowStatus(result.workflowId);
      setActiveWorkflows(prev => [...prev, status]);
      
      toast.success('Workflow started successfully!');
      return result;
    } catch (error) {
      console.error('Error executing workflow:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to execute workflow');
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const cancelWorkflow = useCallback(async (workflowId: string) => {
    try {
      await workflowService.cancelWorkflow(workflowId);
      
      // Update local state
      setActiveWorkflows(prev =>
        prev.map(w =>
          w.workflowId === workflowId
            ? { ...w, status: 'failed' as const, error: 'Cancelled by user' }
            : w
        )
      );
      
      toast.success('Workflow cancelled');
    } catch (error) {
      console.error('Error cancelling workflow:', error);
      toast.error('Failed to cancel workflow');
    }
  }, []);

  const getWorkflowStatus = useCallback((workflowId: string): WorkflowStatus | undefined => {
    return activeWorkflows.find(w => w.workflowId === workflowId);
  }, [activeWorkflows]);

  const createDemoSeeds = useCallback(async () => {
    try {
      const seeds = await workflowService.createDemoSeeds();
      toast.success(`Created ${seeds.length} demo seeds`);
      return seeds;
    } catch (error) {
      console.error('Error creating demo seeds:', error);
      toast.error('Failed to create demo seeds');
      throw error;
    }
  }, []);

  return {
    activeWorkflows,
    loading,
    executeWorkflow,
    cancelWorkflow,
    getWorkflowStatus,
    createDemoSeeds,
    refresh: loadActiveWorkflows
  };
};