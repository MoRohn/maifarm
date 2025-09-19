import React, { useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { 
  CommunicationGraph as CommunicationGraphType,
  CommunicationNode,
  CommunicationEdge 
} from '@/types/monitoring';
import { 
  Network, 
  Activity, 
  AlertCircle,
  Zap,
  Info
} from 'lucide-react';

interface CommunicationGraphProps {
  graph: CommunicationGraphType;
  className?: string;
  height?: number;
}

export const CommunicationGraph: React.FC<CommunicationGraphProps> = ({ 
  graph, 
  className,
  height = 500 
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<CommunicationNode, undefined> | null>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const svg = d3.select(svgRef.current);
    
    // Clear previous content
    svg.selectAll('*').remove();

    // Create container groups
    const g = svg.append('g');
    const linksGroup = g.append('g').attr('class', 'links');
    const nodesGroup = g.append('g').attr('class', 'nodes');
    const labelsGroup = g.append('g').attr('class', 'labels');

    // Set up zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Create force simulation
    const simulation = d3.forceSimulation<CommunicationNode>(graph.nodes)
      .force('link', d3.forceLink<CommunicationNode, CommunicationEdge>(graph.edges)
        .id((d) => d.id)
        .distance(100)
        .strength(0.5))
      .force('charge', d3.forceManyBody<CommunicationNode>().strength(-300))
      .force('center', d3.forceCenter<CommunicationNode>(width / 2, height / 2))
      .force('collision', d3.forceCollide<CommunicationNode>().radius(30));

    simulationRef.current = simulation;

    // Create gradient defs for animated edges
    const defs = svg.append('defs');
    
    // Create animated gradient for active edges
    const gradient = defs.append('linearGradient')
      .attr('id', 'edge-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '0%');

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#3B82F6')
      .attr('stop-opacity', 0.2);

    gradient.append('stop')
      .attr('offset', '50%')
      .attr('stop-color', '#3B82F6')
      .attr('stop-opacity', 1);

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#3B82F6')
      .attr('stop-opacity', 0.2);

    // Animate gradient
    gradient.append('animate')
      .attr('attributeName', 'x1')
      .attr('from', '-100%')
      .attr('to', '100%')
      .attr('dur', '3s')
      .attr('repeatCount', 'indefinite');

    // Create edges
    const links = linksGroup.selectAll('line')
      .data(graph.edges)
      .enter()
      .append('line')
      .attr('stroke', (d) => d.active ? 'url(#edge-gradient)' : '#4B5563')
      .attr('stroke-width', (d) => Math.min(d.weight / 10, 5))
      .attr('stroke-opacity', (d) => d.active ? 0.8 : 0.3)
      .attr('class', 'transition-all duration-300');

    // Create edge labels for latency
    const edgeLabels = labelsGroup.selectAll('.edge-label')
      .data(graph.edges.filter(e => e.active))
      .enter()
      .append('g')
      .attr('class', 'edge-label');

    edgeLabels.append('rect')
      .attr('width', 40)
      .attr('height', 20)
      .attr('x', -20)
      .attr('y', -10)
      .attr('fill', '#1F2937')
      .attr('rx', 4)
      .attr('opacity', 0.8);

    edgeLabels.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#9CA3AF')
      .attr('font-size', '12px')
      .text((d) => `${d.latency}ms`);

    // Create nodes
    const nodes = nodesGroup.selectAll('.node')
      .data(graph.nodes)
      .enter()
      .append('g')
      .attr('class', 'node cursor-pointer')
      .call(d3.drag<SVGGElement, CommunicationNode>()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded));

    // Add node circles
    nodes.append('circle')
      .attr('r', (d) => 20 + d.activity * 10)
      .attr('fill', (d) => getNodeColor(d))
      .attr('stroke', '#374151')
      .attr('stroke-width', 2)
      .attr('class', 'transition-all duration-300');

    // Add status indicators
    nodes.append('circle')
      .attr('r', 5)
      .attr('cx', 15)
      .attr('cy', -15)
      .attr('fill', (d) => getStatusColor(d.status))
      .attr('class', 'animate-pulse');

    // Add node icons
    nodes.each(function(d) {
      const node = d3.select(this);
      if (d.type === 'agent') {
        // Add agent icon
        node.append('text')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', '20px')
          .text('🤖');
      } else if (d.type === 'system') {
        // Add system icon
        node.append('text')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', '20px')
          .text('⚙️');
      }
    });

    // Add node labels
    const nodeLabels = labelsGroup.selectAll('.node-label')
      .data(graph.nodes)
      .enter()
      .append('text')
      .attr('class', 'node-label')
      .attr('text-anchor', 'middle')
      .attr('y', 35)
      .attr('fill', '#E5E7EB')
      .attr('font-size', '14px')
      .text((d) => d.label);

    // Update positions on tick
    simulation.on('tick', () => {
      links
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      edgeLabels
        .attr('transform', (d: any) => {
          const x = (d.source.x + d.target.x) / 2;
          const y = (d.source.y + d.target.y) / 2;
          return `translate(${x}, ${y})`;
        });

      nodes
        .attr('transform', (d: any) => `translate(${d.x}, ${d.y})`);

      nodeLabels
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y);
    });

    // Drag functions
    function dragStarted(event: d3.D3DragEvent<SVGGElement, CommunicationNode, CommunicationNode>) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, CommunicationNode, CommunicationNode>) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragEnded(event: d3.D3DragEvent<SVGGElement, CommunicationNode, CommunicationNode>) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [graph, height]);

  const stats = useMemo(() => {
    const activeNodes = graph.nodes.filter(n => n.status === 'active').length;
    const totalMessages = graph.edges.reduce((sum, e) => sum + e.weight, 0);
    const avgLatency = graph.edges.length > 0
      ? graph.edges.reduce((sum, e) => sum + e.latency, 0) / graph.edges.length
      : 0;

    return {
      nodes: graph.nodes.length,
      activeNodes,
      edges: graph.edges.length,
      totalMessages,
      avgLatency: Math.round(avgLatency)
    };
  }, [graph]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={clsx(
        'bg-gray-900 rounded-apple-xl p-6',
        'border border-gray-800',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-500/20 rounded-apple">
            <Network className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">
              Agent Communication Network
            </h3>
            <p className="text-sm text-gray-400">
              Real-time inter-agent communication visualization
            </p>
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex items-center space-x-4 text-xs">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-gray-400">Active</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 rounded-full bg-gray-500" />
            <span className="text-gray-400">Idle</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-gray-400">Error</span>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-5 gap-4 mb-4">
        <StatCard
          icon={Activity}
          label="Active Nodes"
          value={`${stats.activeNodes}/${stats.nodes}`}
          color="text-green-400"
        />
        <StatCard
          icon={Network}
          label="Connections"
          value={stats.edges}
          color="text-blue-400"
        />
        <StatCard
          icon={Zap}
          label="Messages"
          value={formatNumber(stats.totalMessages)}
          color="text-yellow-400"
        />
        <StatCard
          icon={Activity}
          label="Avg Latency"
          value={`${stats.avgLatency}ms`}
          color="text-purple-400"
        />
        <StatCard
          icon={Info}
          label="Clusters"
          value={graph.clusters.length}
          color="text-cyan-400"
        />
      </div>

      {/* Graph Container */}
      <div 
        ref={containerRef}
        className="relative bg-gray-950 rounded-apple-lg overflow-hidden"
        style={{ height }}
      >
        <svg
          ref={svgRef}
          width="100%"
          height={height}
          className="cursor-grab active:cursor-grabbing"
        />
        
        {/* Overlay Controls */}
        <div className="absolute top-4 right-4 flex flex-col space-y-2">
          <button className="p-2 bg-gray-800/80 hover:bg-gray-700/80 rounded-apple text-gray-400 hover:text-white transition-colors">
            <Activity className="w-4 h-4" />
          </button>
          <button className="p-2 bg-gray-800/80 hover:bg-gray-700/80 rounded-apple text-gray-400 hover:text-white transition-colors">
            <AlertCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cluster Information */}
      {graph.clusters.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-4">
          {graph.clusters.map(cluster => (
            <ClusterCard key={cluster.id} cluster={cluster} />
          ))}
        </div>
      )}
    </motion.div>
  );
};

interface StatCardProps {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value, color }) => {
  return (
    <div className="bg-gray-800/50 rounded-apple p-3">
      <div className="flex items-center space-x-2 mb-1">
        <Icon className={clsx('w-4 h-4', color)} />
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className="text-lg font-semibold text-white">{value}</div>
    </div>
  );
};

const ClusterCard: React.FC<{ cluster: any }> = ({ cluster }) => {
  return (
    <div className="bg-gray-800/50 rounded-apple p-3">
      <h4 className="text-sm font-medium text-white mb-1">{cluster.name}</h4>
      <p className="text-xs text-gray-400 mb-2">{cluster.purpose}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {cluster.agentIds.length} agents
        </span>
        <span className="text-xs text-green-400">
          Score: {cluster.collaborationScore}%
        </span>
      </div>
    </div>
  );
};

// Helper functions
function getNodeColor(node: CommunicationNode): string {
  if (node.type === 'agent') {
    return node.activity > 0.7 ? '#3B82F6' : '#1E40AF';
  } else if (node.type === 'system') {
    return '#6366F1';
  }
  return '#4B5563';
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'active': return '#10B981';
    case 'idle': return '#6B7280';
    case 'error': return '#EF4444';
    default: return '#6B7280';
  }
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}