import React, { useState } from 'react';
import { Droppable, Draggable } from 'react-beautiful-dnd';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { FarmCard } from './FarmCard';
import { FarmTaskModal } from '../Task/FarmTaskModal';
import { Farm } from '@/types';
import { Grid3x3, Plus } from 'lucide-react';

interface FarmGridProps {
  farms: Farm[];
  onCreateFarm?: () => void;
  className?: string;
}

export const FarmGrid: React.FC<FarmGridProps> = ({ farms, onCreateFarm, className }) => {
  const [showFarmModal, setShowFarmModal] = useState(false);
  
  const handleCreateFarm = () => {
    if (onCreateFarm) {
      onCreateFarm();
    } else {
      setShowFarmModal(true);
    }
  };
  
  return (
    <>
      <div className={clsx('space-y-6', className)}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Active Farms
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Drag to reorder your farms or manage agent assignments
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleCreateFarm}
            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Farm</span>
          </motion.button>
        </div>

      <Droppable droppableId="farms" type="farm" direction="vertical">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={clsx(
              'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-h-[200px]',
              snapshot.isDraggingOver && 'bg-primary-50 dark:bg-primary-900/10 rounded-apple-lg transition-colors'
            )}
          >
            <AnimatePresence>
              {farms.map((farm, index) => (
                <Draggable key={farm.id} draggableId={farm.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      style={{
                        ...provided.draggableProps.style,
                        transform: snapshot.isDragging 
                          ? `${provided.draggableProps.style?.transform} rotate(2deg)` 
                          : provided.draggableProps.style?.transform,
                      }}
                      className={clsx(
                        snapshot.isDragging && 'shadow-2xl cursor-grabbing',
                        !snapshot.isDragging && 'cursor-grab'
                      )}
                    >
                      <FarmCard farm={farm} />
                    </div>
                  )}
                </Draggable>
              ))}
            </AnimatePresence>
            {provided.placeholder}
            
            {farms.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-full"
              >
                <div className="bg-white dark:bg-gray-900 rounded-apple-lg p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-700">
                  <Grid3x3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No active farms
                  </h4>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Start your first farm to see it here
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCreateFarm}
                    className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors"
                  >
                    Create Your First Farm
                  </motion.button>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </Droppable>
    </div>
    
    {/* Farm Task Modal */}
    <FarmTaskModal
      isOpen={showFarmModal}
      onClose={() => setShowFarmModal(false)}
    />
    </>
  );
};