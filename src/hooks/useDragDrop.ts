import { useState, useCallback, useEffect } from 'react';
import { DropResult, DragStart } from 'react-beautiful-dnd';
import { dragDropService } from '../services/dragDropService';
import { useFarmStore } from '../store/farmStore';
import { toast } from 'react-hot-toast';

interface UseDragDropOptions {
  onReorderSuccess?: () => void;
  onReorderError?: (error: Error) => void;
}

export const useDragDrop = (options: UseDragDropOptions = {}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [draggedItem, setDraggedItem] = useState<{ id: string; type: string } | null>(null);
  const { farms, reorderFarms, reorderAgentsInFarm, moveAgentBetweenFarms } = useFarmStore();

  const handleDragStart = useCallback((result: DragStart) => {
    const { draggableId, type } = result;
    setIsDragging(true);
    setDraggedItem({ id: draggableId, type });
    
    // Add visual feedback
    document.body.classList.add('is-dragging');
  }, []);

  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { source, destination, type } = result;
    
    setIsDragging(false);
    setDraggedItem(null);
    document.body.classList.remove('is-dragging');

    if (!destination) {
      return;
    }

    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    try {
      if (type === 'farm') {
        const reordered = dragDropService.reorderFarms(farms, source.index, destination.index);
        reorderFarms(source.index, destination.index);
        toast.success('Farms reordered successfully');
      } else if (type === 'agent') {
        if (source.droppableId === destination.droppableId) {
          // Reorder within the same farm
          const farm = farms.find(f => f.id === source.droppableId);
          if (farm) {
            const reorderedAgents = dragDropService.reorderAgents(
              farm.agents,
              source.index,
              destination.index
            );
            reorderAgentsInFarm(farm.id, source.index, destination.index);
            toast.success('Agents reordered successfully');
          }
        } else {
          // Move between farms
          const sourceFarm = farms.find(f => f.id === source.droppableId);
          const destFarm = farms.find(f => f.id === destination.droppableId);
          
          if (sourceFarm && destFarm) {
            const agent = sourceFarm.agents.find(a => a.id === result.draggableId);
            if (agent) {
              const canDrop = dragDropService.canDropAgent(agent, destFarm);
              if (!canDrop.canDrop) {
                toast.error(canDrop.reason || 'Cannot move agent');
                return;
              }
              
              await moveAgentBetweenFarms(
                source.droppableId,
                destination.droppableId,
                result.draggableId,
                destination.index
              );
              toast.success(`Moved ${agent.name} to ${destFarm.name}`);
            }
          }
        }
      }
      
      options.onReorderSuccess?.();
    } catch (error) {
      console.error('Drag and drop error:', error);
      toast.error('Failed to reorder items');
      options.onReorderError?.(error as Error);
    }
  }, [farms, reorderFarms, reorderAgentsInFarm, moveAgentBetweenFarms, options]);

  // Add global styles for drag feedback
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      body.is-dragging {
        cursor: grabbing !important;
        user-select: none;
      }
      
      body.is-dragging * {
        cursor: grabbing !important;
      }
      
      .drag-preview {
        animation: dragPreviewPulse 1s ease-in-out infinite;
      }
      
      @keyframes dragPreviewPulse {
        0%, 100% { transform: scale(1); opacity: 0.8; }
        50% { transform: scale(1.05); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return {
    isDragging,
    draggedItem,
    handleDragStart,
    handleDragEnd,
  };
};