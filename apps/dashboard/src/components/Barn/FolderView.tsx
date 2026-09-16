import React from 'react';
import { motion } from 'framer-motion';
import { Folder, FolderOpen } from 'lucide-react';
import { clsx } from 'clsx';
import { BarnFolder } from '@/types/barn';

interface FolderViewProps {
  folder: BarnFolder;
  harvestCount: number;
  onClick: () => void;
}

export const FolderView: React.FC<FolderViewProps> = ({ folder, harvestCount, onClick }) => {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <motion.div
      whileHover={{ y: -4 }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={clsx(
        'relative bg-white dark:bg-gray-900 rounded-apple-lg p-6',
        'border-2 border-dashed border-gray-300 dark:border-gray-700',
        'hover:border-primary-400 dark:hover:border-primary-600',
        'cursor-pointer transition-all duration-300 group'
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-apple">
          {isHovered ? (
            <FolderOpen className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          ) : (
            <Folder className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          {folder.name}
        </h3>
        {folder.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {folder.description}
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{harvestCount} harvests</span>
          <span>{(folder.subFolderIds ?? []).length} folders</span>
        </div>
      </div>
    </motion.div>
  );
};