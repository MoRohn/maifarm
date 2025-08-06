import React, { createContext, useContext, useState, useCallback } from 'react';
import { DragDropContext as BeautifulDragDropContext, DropResult, DragStart } from 'react-beautiful-dnd';

interface DragDropState {
  isDragging: boolean;
  draggedItemId: string | null;
  draggedItemType: 'farm' | 'agent' | null;
}

interface DragDropContextValue extends DragDropState {
  onDragStart: (result: DragStart) => void;
  onDragEnd: (result: DropResult) => void;
}

const DragDropContext = createContext<DragDropContextValue | null>(null);

export const useDragDrop = () => {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error('useDragDrop must be used within DragDropProvider');
  }
  return context;
};

interface DragDropProviderProps {
  children: React.ReactNode;
  onReorderFarms?: (startIndex: number, endIndex: number) => void;
  onReorderAgents?: (farmId: string, startIndex: number, endIndex: number) => void;
  onMoveAgentBetweenFarms?: (agentId: string, sourceFarmId: string, destinationFarmId: string, destinationIndex: number) => void;
}

export const DragDropProvider: React.FC<DragDropProviderProps> = ({
  children,
  onReorderFarms,
  onReorderAgents,
  onMoveAgentBetweenFarms,
}) => {
  const [dragState, setDragState] = useState<DragDropState>({
    isDragging: false,
    draggedItemId: null,
    draggedItemType: null,
  });

  const onDragStart = useCallback((result: DragStart) => {
    const { draggableId, type } = result;
    setDragState({
      isDragging: true,
      draggedItemId: draggableId,
      draggedItemType: type as 'farm' | 'agent',
    });
  }, []);

  const onDragEnd = useCallback((result: DropResult) => {
    const { source, destination, type } = result;

    setDragState({
      isDragging: false,
      draggedItemId: null,
      draggedItemType: null,
    });

    if (!destination) {
      return;
    }

    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    if (type === 'farm' && onReorderFarms) {
      onReorderFarms(source.index, destination.index);
    } else if (type === 'agent') {
      if (source.droppableId === destination.droppableId && onReorderAgents) {
        onReorderAgents(source.droppableId, source.index, destination.index);
      } else if (source.droppableId !== destination.droppableId && onMoveAgentBetweenFarms) {
        const agentId = result.draggableId;
        onMoveAgentBetweenFarms(
          agentId,
          source.droppableId,
          destination.droppableId,
          destination.index
        );
      }
    }
  }, [onReorderFarms, onReorderAgents, onMoveAgentBetweenFarms]);

  const contextValue: DragDropContextValue = {
    ...dragState,
    onDragStart,
    onDragEnd,
  };

  return (
    <BeautifulDragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <DragDropContext.Provider value={contextValue}>
        {children}
      </DragDropContext.Provider>
    </BeautifulDragDropContext>
  );
};