import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Maximize2, 
  Minimize2, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  Filter,
  Activity,
  Cpu,
  Network
} from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Tooltip } from '../../common/Tooltip';

interface Node {
  id: string;
  name: string;
  type: 'agent' | 'farm' | 'resource' | 'task';
  status: 'active' | 'idle' | 'busy' | 'error';
  val: number;
  color: string;
  fx?: number;
  fy?: number;
  vx?: number;
  vy?: number;
}

interface Link {
  source: string;
  target: string;
  value: number;
  type: 'communication' | 'coordination' | 'resource' | 'dependency';
  color: string;
  curvature?: number;
  particles?: number;
}

interface MessageFlow {
  id: string;
  from: string;
  to: string;
  type: string;
  timestamp: number;
  data?: any;
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

interface AgentCommunicationGraphProps {
  farmId: string;
  agents: Array<{ id: string; name: string; status: string }>;
  className?: string;
}

export const AgentCommunicationGraph: React.FC<AgentCommunicationGraphProps> = ({
  farmId,
  agents,
  className = ''
}) => {
  const graphRef = useRef<any>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [messageFlows, setMessageFlows] = useState<MessageFlow[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [filterType, setFilterType] = useState<string>('all');
  const [showLabels, setShowLabels] = useState(true);
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [stats, setStats] = useState({
    totalMessages: 0,
    activeConnections: 0,
    bandwidth: 0,
    latency: 0
  });

  const { socket } = useWebSocket();

  // Color scheme for different elements
  const colorScheme = useMemo(() => ({
    agent: {
      active: '#10b981',
      idle: '#6b7280',
      busy: '#f59e0b',
      error: '#ef4444'
    },
    link: {
      communication: '#3b82f6',
      coordination: '#8b5cf6',
      resource: '#ec4899',
      dependency: '#06b6d4'
    },
    particle: '#fbbf24'
  }), []);

  // Initialize graph data from agents
  useEffect(() => {
    const nodes: Node[] = [
      // Farm node (central)
      {
        id: farmId,
        name: 'Farm',
        type: 'farm',
        status: 'active',
        val: 20,
        color: '#8b5cf6',
        fx: dimensions.width / 2,
        fy: dimensions.height / 2
      }
    ];

    // Add agent nodes
    agents.forEach((agent, index) => {
      const angle = (2 * Math.PI * index) / agents.length;
      const radius = 150;
      
      nodes.push({
        id: agent.id,
        name: agent.name,
        type: 'agent',
        status: agent.status as any || 'idle',
        val: 15,
        color: colorScheme.agent[agent.status as keyof typeof colorScheme.agent] || colorScheme.agent.idle
      });
    });

    // Create links between agents and farm
    const links: Link[] = agents.map(agent => ({
      source: farmId,
      target: agent.id,
      value: 2,
      type: 'coordination',
      color: colorScheme.link.coordination,
      particles: 2
    }));

    // Add some inter-agent communication links (simulated)
    if (agents.length > 1) {
      for (let i = 0; i < agents.length; i++) {
        const nextIndex = (i + 1) % agents.length;
        if (Math.random() > 0.5) { // Random connections for demo
          links.push({
            source: agents[i].id,
            target: agents[nextIndex].id,
            value: 1,
            type: 'communication',
            color: colorScheme.link.communication,
            curvature: 0.3,
            particles: 1
          });
        }
      }
    }

    setGraphData({ nodes, links });
  }, [agents, farmId, dimensions, colorScheme]);

  // Handle WebSocket events for real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleAgentUpdate = (data: any) => {
      if (data.farmId !== farmId) return;

      setGraphData(prev => {
        const nodes = [...prev.nodes];
        const nodeIndex = nodes.findIndex(n => n.id === data.agentId);
        
        if (nodeIndex >= 0) {
          nodes[nodeIndex] = {
            ...nodes[nodeIndex],
            status: data.status,
            color: colorScheme.agent[data.status as keyof typeof colorScheme.agent] || colorScheme.agent.idle
          };
        }

        return { ...prev, nodes };
      });

      // Add message flow animation
      addMessageFlow({
        id: `msg-${Date.now()}`,
        from: farmId,
        to: data.agentId,
        type: 'status_update',
        timestamp: Date.now()
      });
    };

    const handleCommunication = (data: any) => {
      if (!data.from || !data.to) return;

      // Update link strength
      setGraphData(prev => {
        const links = [...prev.links];
        const linkIndex = links.findIndex(
          l => (l.source === data.from && l.target === data.to) ||
               (l.source === data.to && l.target === data.from)
        );

        if (linkIndex >= 0) {
          links[linkIndex].value = Math.min(links[linkIndex].value + 0.5, 5);
          links[linkIndex].particles = Math.min((links[linkIndex].particles || 0) + 1, 5);
        } else {
          // Create new link
          links.push({
            source: data.from,
            target: data.to,
            value: 1,
            type: 'communication',
            color: colorScheme.link.communication,
            particles: 1
          });
        }

        return { ...prev, links };
      });

      // Add message flow
      addMessageFlow({
        id: `msg-${Date.now()}-${Math.random()}`,
        from: data.from,
        to: data.to,
        type: data.type || 'message',
        timestamp: Date.now(),
        data: data.payload
      });

      // Update stats
      setStats(prev => ({
        ...prev,
        totalMessages: prev.totalMessages + 1,
        activeConnections: graphData.links.filter(l => l.particles && l.particles > 0).length
      }));
    };

    socket.on('agent:status', handleAgentUpdate);
    socket.on('agent:communication', handleCommunication);
    socket.on('terminal:output', (data) => {
      if (data.agentId) {
        handleCommunication({
          from: data.agentId,
          to: farmId,
          type: 'output'
        });
      }
    });

    return () => {
      socket.off('agent:status', handleAgentUpdate);
      socket.off('agent:communication', handleCommunication);
      socket.off('terminal:output');
    };
  }, [socket, farmId, graphData.links, colorScheme]);

  // Add message flow animation
  const addMessageFlow = useCallback((flow: MessageFlow) => {
    setMessageFlows(prev => {
      const updated = [...prev, flow];
      // Keep only last 50 messages
      if (updated.length > 50) {
        return updated.slice(-50);
      }
      return updated;
    });

    // Remove after animation
    setTimeout(() => {
      setMessageFlows(prev => prev.filter(f => f.id !== flow.id));
    }, 3000);
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ 
          width: width || 800, 
          height: height || 600 
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isFullscreen]);

  // Graph interaction handlers
  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node);
  }, []);

  const handleNodeDragEnd = useCallback((node: any) => {
    node.fx = node.x;
    node.fy = node.y;
  }, []);

  const handleZoomIn = () => {
    if (graphRef.current) {
      const newZoom = Math.min(zoomLevel * 1.2, 5);
      graphRef.current.zoom(newZoom, 500);
      setZoomLevel(newZoom);
    }
  };

  const handleZoomOut = () => {
    if (graphRef.current) {
      const newZoom = Math.max(zoomLevel / 1.2, 0.1);
      graphRef.current.zoom(newZoom, 500);
      setZoomLevel(newZoom);
    }
  };

  const handleReset = () => {
    if (graphRef.current) {
      graphRef.current.centerAt(0, 0, 500);
      graphRef.current.zoom(1, 500);
      setZoomLevel(1);
    }
  };

  // Custom node rendering
  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.name;
    const fontSize = 12 / globalScale;
    ctx.font = `${fontSize}px Sans-Serif`;
    
    // Draw node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI, false);
    ctx.fillStyle = node.color;
    ctx.fill();
    
    // Add pulse effect for active nodes
    if (node.status === 'active' || node.status === 'busy') {
      ctx.strokeStyle = node.color;
      ctx.globalAlpha = 0.3 + Math.sin(Date.now() * 0.003) * 0.3;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    
    // Draw label if enabled
    if (showLabels) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, node.x, node.y + node.val + fontSize);
    }

    // Draw status indicator
    if (node.type === 'agent') {
      const indicatorRadius = 3;
      ctx.beginPath();
      ctx.arc(node.x + node.val * 0.7, node.y - node.val * 0.7, indicatorRadius, 0, 2 * Math.PI);
      ctx.fillStyle = node.status === 'error' ? '#ef4444' : 
                      node.status === 'busy' ? '#f59e0b' :
                      node.status === 'active' ? '#10b981' : '#6b7280';
      ctx.fill();
    }
  }, [showLabels]);

  // Custom link rendering with particles
  const linkCanvasObjectMode = () => 'after';
  
  const linkCanvasObject = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    // Draw particles along the link
    if (link.particles && link.particles > 0) {
      const start = link.source;
      const end = link.target;
      
      for (let i = 0; i < link.particles; i++) {
        const t = ((Date.now() * 0.001 * animationSpeed + i * 0.2) % 1);
        const x = start.x + (end.x - start.x) * t;
        const y = start.y + (end.y - start.y) * t;
        
        ctx.beginPath();
        ctx.arc(x, y, 2 / globalScale, 0, 2 * Math.PI);
        ctx.fillStyle = colorScheme.particle;
        ctx.fill();
      }
    }
  }, [animationSpeed, colorScheme.particle]);

  return (
    <div 
      ref={containerRef}
      className={`relative bg-gray-900 rounded-lg overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50' : ''} ${className}`}
    >
      {/* Header Controls */}
      <div className="absolute top-0 left-0 right-0 bg-gray-800/90 backdrop-blur-sm p-4 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Network className="w-5 h-5 text-blue-400" />
              Agent Communication Network
            </h3>
            
            {/* Stats */}
            <div className="flex items-center space-x-3 text-sm">
              <div className="flex items-center gap-1">
                <Activity className="w-4 h-4 text-green-400" />
                <span className="text-gray-300">{stats.totalMessages} messages</span>
              </div>
              <div className="flex items-center gap-1">
                <Cpu className="w-4 h-4 text-blue-400" />
                <span className="text-gray-300">{agents.length} agents</span>
              </div>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center space-x-2">
            {/* Filter Dropdown */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm"
            >
              <option value="all">All Connections</option>
              <option value="communication">Communication</option>
              <option value="coordination">Coordination</option>
              <option value="resource">Resources</option>
            </select>

            {/* Animation Speed */}
            <Tooltip content="Animation Speed">
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={animationSpeed}
                onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
                className="w-20"
              />
            </Tooltip>

            {/* Toggle Labels */}
            <Tooltip content={showLabels ? "Hide Labels" : "Show Labels"}>
              <button
                onClick={() => setShowLabels(!showLabels)}
                className={`p-2 rounded ${showLabels ? 'bg-blue-600' : 'bg-gray-700'} hover:bg-opacity-80 transition-colors`}
              >
                <Filter className="w-4 h-4 text-white" />
              </button>
            </Tooltip>

            {/* Zoom Controls */}
            <div className="flex items-center space-x-1 bg-gray-700 rounded">
              <Tooltip content="Zoom In">
                <button
                  onClick={handleZoomIn}
                  className="p-2 hover:bg-gray-600 rounded-l transition-colors"
                >
                  <ZoomIn className="w-4 h-4 text-white" />
                </button>
              </Tooltip>
              <Tooltip content="Reset View">
                <button
                  onClick={handleReset}
                  className="p-2 hover:bg-gray-600 transition-colors"
                >
                  <RotateCcw className="w-4 h-4 text-white" />
                </button>
              </Tooltip>
              <Tooltip content="Zoom Out">
                <button
                  onClick={handleZoomOut}
                  className="p-2 hover:bg-gray-600 rounded-r transition-colors"
                >
                  <ZoomOut className="w-4 h-4 text-white" />
                </button>
              </Tooltip>
            </div>

            {/* Fullscreen Toggle */}
            <Tooltip content={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}>
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4 text-white" />
                ) : (
                  <Maximize2 className="w-4 h-4 text-white" />
                )}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Graph Container */}
      <div className="pt-16 h-full">
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height - 64}
          nodeLabel="name"
          nodeColor="color"
          nodeVal="val"
          linkColor="color"
          linkWidth="value"
          linkCurvature="curvature"
          linkDirectionalParticles="particles"
          linkDirectionalParticleSpeed={0.01 * animationSpeed}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleColor={() => colorScheme.particle}
          onNodeClick={handleNodeClick}
          onNodeDragEnd={handleNodeDragEnd}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => 'replace'}
          linkCanvasObject={linkCanvasObject}
          linkCanvasObjectMode={linkCanvasObjectMode}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          enablePanInteraction={true}
          cooldownTicks={100}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
        />
      </div>

      {/* Selected Node Details */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute bottom-4 right-4 bg-gray-800 rounded-lg p-4 max-w-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-white">{selectedNode.name}</h4>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Type:</span>
                <span className="text-white capitalize">{selectedNode.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Status:</span>
                <span className={`capitalize ${
                  selectedNode.status === 'active' ? 'text-green-400' :
                  selectedNode.status === 'busy' ? 'text-yellow-400' :
                  selectedNode.status === 'error' ? 'text-red-400' :
                  'text-gray-400'
                }`}>
                  {selectedNode.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">ID:</span>
                <span className="text-white text-xs font-mono">
                  {selectedNode.id.substring(0, 8)}...
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Message Flow Indicators */}
      <div className="absolute bottom-4 left-4 space-y-1 max-h-32 overflow-y-auto">
        <AnimatePresence>
          {messageFlows.slice(-5).map(flow => (
            <motion.div
              key={flow.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-gray-800/80 backdrop-blur-sm rounded px-2 py-1 text-xs text-white"
            >
              <span className="text-blue-400">
                {graphData.nodes.find(n => n.id === flow.from)?.name || 'Unknown'}
              </span>
              {' → '}
              <span className="text-green-400">
                {graphData.nodes.find(n => n.id === flow.to)?.name || 'Unknown'}
              </span>
              <span className="text-gray-400 ml-2">{flow.type}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AgentCommunicationGraph;