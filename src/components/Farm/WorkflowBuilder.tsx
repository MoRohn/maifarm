import React, { useState, useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  NodeTypes,
  Handle,
  Position,
} from 'react-flow-renderer';
import { motion } from 'framer-motion';
import {
  Plus,
  Play,
  Square,
  GitBranch,
  Clock,
  RefreshCw,
  Zap,
  Save,
  Upload,
  Download,
  Trash2,
  Settings,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Workflow, WorkflowNode as WorkflowNodeType, WorkflowEdge } from '../../types/workflow';

interface WorkflowBuilderProps {
  workflow?: Workflow;
  onSave?: (workflow: Partial<Workflow>) => void;
}

// Custom node component
const CustomNode: React.FC<{ data: any; type: string }> = ({ data, type }) => {
  const getIcon = () => {
    switch (type) {
      case 'start':
        return <Play className="w-5 h-5" />;
      case 'end':
        return <Square className="w-5 h-5" />;
      case 'task':
        return <Zap className="w-5 h-5" />;
      case 'decision':
        return <GitBranch className="w-5 h-5" />;
      case 'wait':
        return <Clock className="w-5 h-5" />;
      case 'loop':
        return <RefreshCw className="w-5 h-5" />;
      default:
        return null;
    }
  };

  const getNodeColor = () => {
    switch (type) {
      case 'start':
        return 'border-green-500 bg-green-50 dark:bg-green-900/20';
      case 'end':
        return 'border-red-500 bg-red-50 dark:bg-red-900/20';
      case 'task':
        return 'border-blue-500 bg-blue-50 dark:bg-blue-900/20';
      case 'decision':
        return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
      case 'wait':
        return 'border-purple-500 bg-purple-50 dark:bg-purple-900/20';
      case 'loop':
        return 'border-orange-500 bg-orange-50 dark:bg-orange-900/20';
      default:
        return 'border-gray-500 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  return (
    <div className={clsx(
      'px-4 py-3 rounded-apple border-2 min-w-[150px]',
      getNodeColor()
    )}>
      {type !== 'start' && (
        <Handle type="target" position={Position.Top} className="w-2 h-2" />
      )}
      
      <div className="flex items-center space-x-2">
        {getIcon()}
        <div>
          <div className="font-medium text-gray-900 dark:text-white">
            {data.label}
          </div>
          {data.description && (
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {data.description}
            </div>
          )}
        </div>
      </div>

      {type !== 'end' && (
        <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
      )}
    </div>
  );
};

const nodeTypes: NodeTypes = {
  start: (props) => <CustomNode {...props} type="start" />,
  end: (props) => <CustomNode {...props} type="end" />,
  task: (props) => <CustomNode {...props} type="task" />,
  decision: (props) => <CustomNode {...props} type="decision" />,
  wait: (props) => <CustomNode {...props} type="wait" />,
  loop: (props) => <CustomNode {...props} type="loop" />,
};

export const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({ workflow, onSave }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(
    workflow?.nodes.map(n => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
    })) || [
      {
        id: '1',
        type: 'start',
        position: { x: 250, y: 50 },
        data: { label: 'Start' },
      },
    ]
  );

  const [edges, setEdges, onEdgesChange] = useEdgesState(
    workflow?.edges || []
  );

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showNodePanel, setShowNodePanel] = useState(false);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setShowNodePanel(true);
  }, []);

  const addNode = (type: WorkflowNodeType['type']) => {
    const newNode: Node = {
      id: `${nodes.length + 1}`,
      type,
      position: {
        x: Math.random() * 500 + 100,
        y: Math.random() * 300 + 100,
      },
      data: {
        label: type.charAt(0).toUpperCase() + type.slice(1),
        description: '',
      },
    };

    setNodes((nds) => [...nds, newNode]);
  };

  const deleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(null);
    setShowNodePanel(false);
  };

  const updateNodeData = (nodeId: string, data: any) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      )
    );
  };

  const handleSave = () => {
    const workflowData: Partial<Workflow> = {
      nodes: nodes.map(n => ({
        id: n.id,
        type: n.type as WorkflowNodeType['type'],
        position: n.position,
        data: n.data,
      })),
      edges: edges.map(e => ({
        ...e,
        type: e.type || 'default'
      })) as WorkflowEdge[],
    };

    onSave?.(workflowData);
  };

  const nodeButtons = [
    { type: 'task' as const, icon: Zap, label: 'Task' },
    { type: 'decision' as const, icon: GitBranch, label: 'Decision' },
    { type: 'wait' as const, icon: Clock, label: 'Wait' },
    { type: 'loop' as const, icon: RefreshCw, label: 'Loop' },
    { type: 'end' as const, icon: Square, label: 'End' },
  ];

  return (
    <div className="h-[600px] bg-gray-50 dark:bg-gray-900 rounded-apple-lg overflow-hidden">
      <div className="flex h-full">
        {/* Workflow Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            className="bg-gray-50 dark:bg-gray-900"
          >
            <Background color="#94a3b8" gap={16} />
            <Controls className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" />
            <MiniMap 
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              nodeColor={(node) => {
                switch (node.type) {
                  case 'start': return '#10b981';
                  case 'end': return '#ef4444';
                  case 'task': return '#3b82f6';
                  case 'decision': return '#f59e0b';
                  case 'wait': return '#8b5cf6';
                  case 'loop': return '#f97316';
                  default: return '#6b7280';
                }
              }}
            />
          </ReactFlow>

          {/* Toolbar */}
          <div className="absolute top-4 left-4 flex items-center space-x-2 bg-white dark:bg-gray-800 rounded-apple shadow-apple p-2">
            {nodeButtons.map(({ type, icon: Icon, label }) => (
              <motion.button
                key={type}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => addNode(type)}
                className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-apple"
                title={`Add ${label} Node`}
              >
                <Icon className="w-5 h-5" />
              </motion.button>
            ))}
          </div>

          {/* Save Button */}
          <div className="absolute top-4 right-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSave}
              className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-apple shadow-apple hover:bg-primary-700"
            >
              <Save className="w-4 h-4" />
              <span>Save Workflow</span>
            </motion.button>
          </div>
        </div>

        {/* Node Properties Panel */}
        {showNodePanel && selectedNode && (
          <motion.div
            initial={{ x: 300 }}
            animate={{ x: 0 }}
            className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Node Properties
              </h3>
              <button
                onClick={() => setShowNodePanel(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Label
                </label>
                <input
                  type="text"
                  value={selectedNode.data.label || ''}
                  onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-apple bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={selectedNode.data.description || ''}
                  onChange={(e) => updateNodeData(selectedNode.id, { description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-apple bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  rows={3}
                />
              </div>

              {selectedNode.type === 'task' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Task Type
                  </label>
                  <select
                    value={selectedNode.data.taskType || 'agent'}
                    onChange={(e) => updateNodeData(selectedNode.id, { taskType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-apple bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="agent">Agent Task</option>
                    <option value="system">System Task</option>
                    <option value="external">External API</option>
                    <option value="manual">Manual Task</option>
                  </select>
                </div>
              )}

              {selectedNode.type === 'wait' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Duration (ms)
                  </label>
                  <input
                    type="number"
                    value={selectedNode.data.config?.duration || 1000}
                    onChange={(e) => updateNodeData(selectedNode.id, { 
                      config: { ...selectedNode.data.config, duration: parseInt(e.target.value) }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-apple bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              )}

              <div className="pt-4">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => deleteNode(selectedNode.id)}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-apple hover:bg-red-700 w-full justify-center"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Node</span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};