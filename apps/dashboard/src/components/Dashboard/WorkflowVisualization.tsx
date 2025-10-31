import React, { useCallback, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  MarkerType,
  Handle,
  Position,
} from 'react-flow-renderer';
import { motion } from 'framer-motion';
import { 
  Plus, 
  Play, 
  Pause, 
  RotateCw,
  Settings,
  CheckCircle,
  AlertCircle,
  Clock,
  Zap
} from 'lucide-react';
import { clsx } from 'clsx';

interface WorkflowNode extends Node {
  data: {
    label: string;
    type: 'start' | 'agent' | 'decision' | 'end';
    status: 'idle' | 'active' | 'completed' | 'error';
    agent?: string;
    duration?: number;
    progress?: number;
  };
}

const nodeTypes = {
  customNode: ({ data, selected }: { data: WorkflowNode['data']; selected: boolean }) => {
    const statusColors = {
      idle: 'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800',
      active: 'border-green-400 bg-green-50 dark:border-green-600 dark:bg-green-900/20',
      running: 'border-green-400 bg-green-50 dark:border-green-600 dark:bg-green-900/20',
      completed: 'border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20',
      error: 'border-red-400 bg-red-50 dark:border-red-600 dark:bg-red-900/20',
    };

    const statusIcons = {
      idle: Clock,
      active: Zap,
      running: Zap,
      completed: CheckCircle,
      error: AlertCircle,
    };

    const StatusIcon = statusIcons[data.status];

    return (
      <div className={clsx(
        'px-4 py-3 rounded-apple border-2 min-w-[200px] transition-all',
        statusColors[data.status],
        selected && 'ring-2 ring-primary-500 ring-offset-2'
      )}>
        <Handle
          type="target"
          position={Position.Top}
          className="w-3 h-3 bg-primary-500 border-2 border-white dark:border-gray-900"
        />
        
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
            {data.label}
          </h4>
          <StatusIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </div>

        {data.agent && (
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            Agent: {data.agent}
          </p>
        )}

        {data.status === 'active' && data.progress !== undefined && (
          <div className="mt-2">
            <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${data.progress}%` }}
                className="h-full bg-primary-500"
              />
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {data.progress}%
            </p>
          </div>
        )}

        {data.duration && (
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            Duration: {data.duration}ms
          </p>
        )}

        <Handle
          type="source"
          position={Position.Bottom}
          className="w-3 h-3 bg-primary-500 border-2 border-white dark:border-gray-900"
        />
      </div>
    );
  },
};

interface WorkflowVisualizationProps {
  initialNodes?: WorkflowNode[];
  initialEdges?: Edge[];
  onWorkflowChange?: (_nodes: Node[], _edges: Edge[]) => void;
  className?: string;
}

export const WorkflowVisualization: React.FC<WorkflowVisualizationProps> = ({
  initialNodes = [],
  initialEdges = [],
  onWorkflowChange,
  className,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge = {
        ...params,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#6366f1',
        },
        style: {
          stroke: '#6366f1',
          strokeWidth: 2,
        },
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node.id);
  }, []);

  const addNode = useCallback((type: WorkflowNode['data']['type']) => {
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type: 'customNode',
      position: { x: Math.random() * 500, y: Math.random() * 300 },
      data: {
        label: `New ${type}`,
        type,
        status: 'idle',
      },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const defaultNodes: WorkflowNode[] = [
    {
      id: '1',
      type: 'customNode',
      position: { x: 100, y: 100 },
      data: {
        label: 'Start Workflow',
        type: 'start',
        status: 'completed',
      },
    },
    {
      id: '2',
      type: 'customNode',
      position: { x: 300, y: 100 },
      data: {
        label: 'Data Collection',
        type: 'agent',
        status: 'active',
        agent: 'Collector Agent',
        progress: 65,
      },
    },
    {
      id: '3',
      type: 'customNode',
      position: { x: 500, y: 100 },
      data: {
        label: 'Process Data',
        type: 'agent',
        status: 'idle',
        agent: 'Processor Agent',
      },
    },
    {
      id: '4',
      type: 'customNode',
      position: { x: 700, y: 100 },
      data: {
        label: 'Quality Check',
        type: 'decision',
        status: 'idle',
      },
    },
    {
      id: '5',
      type: 'customNode',
      position: { x: 900, y: 100 },
      data: {
        label: 'Complete',
        type: 'end',
        status: 'idle',
      },
    },
  ];

  const defaultEdges: Edge[] = [
    {
      id: 'e1-2',
      source: '1',
      target: '2',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#6366f1',
      },
      style: {
        stroke: '#6366f1',
        strokeWidth: 2,
      },
    },
    {
      id: 'e2-3',
      source: '2',
      target: '3',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#6366f1',
      },
      style: {
        stroke: '#6366f1',
        strokeWidth: 2,
      },
    },
    {
      id: 'e3-4',
      source: '3',
      target: '4',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#6366f1',
      },
      style: {
        stroke: '#6366f1',
        strokeWidth: 2,
      },
    },
    {
      id: 'e4-5',
      source: '4',
      target: '5',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#6366f1',
      },
      style: {
        stroke: '#6366f1',
        strokeWidth: 2,
      },
    },
  ];

  React.useEffect(() => {
    if (nodes.length === 0 && edges.length === 0) {
      setNodes(defaultNodes);
      setEdges(defaultEdges);
    }
  }, []);

  React.useEffect(() => {
    onWorkflowChange?.(nodes, edges);
  }, [nodes, edges, onWorkflowChange]);

  return (
    <div className={clsx('bg-white dark:bg-gray-900 rounded-apple-lg border border-gray-200 dark:border-gray-800', className)}>
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Workflow Designer
          </h3>
          <div className="flex items-center space-x-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => addNode('agent')}
              className="flex items-center space-x-2 px-3 py-1.5 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Node</span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
            >
              <Play className="w-4 h-4" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
            >
              <RotateCw className="w-4 h-4" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
            >
              <Settings className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      </div>
      
      <div style={{ height: '600px' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          className="bg-gray-50 dark:bg-gray-950"
        >
          <Background color="#e5e7eb" gap={16} />
          <Controls className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800" />
          <MiniMap 
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
            nodeColor={(node) => {
              const data = node.data as WorkflowNode['data'];
              const colors = {
                idle: '#9ca3af',
                active: '#34d399',
                running: '#34d399',
                completed: '#60a5fa',
                error: '#f87171',
              };
              return colors[data.status];
            }}
          />
        </ReactFlow>
      </div>

      {selectedNode && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            Node Properties
          </h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">ID:</span>
              <span className="font-mono text-gray-900 dark:text-white">{selectedNode}</span>
            </div>
            <button className="w-full px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-apple hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm">
              Configure Node
            </button>
          </div>
        </div>
      )}
    </div>
  );
};