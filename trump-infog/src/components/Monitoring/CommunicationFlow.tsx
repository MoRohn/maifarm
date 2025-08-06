import React, { useEffect, useRef, useState } from 'react';
import { useInfogWebSocket } from '../../hooks/useInfogWebSocket';
import * as d3 from 'd3';

interface Node {
  id: string;
  name: string;
  type: string;
  status: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface Link {
  source: string | Node;
  target: string | Node;
  type: string;
  count: number;
}

export const CommunicationFlow: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const { agentStates, logs } = useInfogWebSocket();
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  useEffect(() => {
    const handleResize = () => {
      if (svgRef.current?.parentElement) {
        const { width } = svgRef.current.parentElement.getBoundingClientRect();
        setDimensions({ width: width - 48, height: 400 });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    // Create nodes from agent states
    const nodes: Node[] = [
      {
        id: 'dashboard',
        name: 'Monitoring Dashboard',
        type: 'dashboard',
        status: 'active'
      },
      ...Object.entries(agentStates).map(([agentId, state]) => ({
        id: agentId,
        name: agentId === 'agent_0' ? 'Data Collector' :
              agentId === 'agent_1' ? 'Content Analyzer' :
              agentId === 'agent_2' ? 'Design Generator' :
              agentId === 'agent_3' ? 'Output Assembler' : agentId,
        type: 'agent',
        status: state.status
      }))
    ];

    // Create links from communication logs
    const linkMap = new Map<string, Link>();
    
    logs.forEach(log => {
      // Extract communication patterns from logs
      if (log.message.includes('requesting') || log.message.includes('sending')) {
        const sourceMatch = log.source.match(/agent_\d/);
        if (sourceMatch) {
          const targetMatch = log.message.match(/agent_\d/);
          if (targetMatch && targetMatch[0] !== sourceMatch[0]) {
            const key = `${sourceMatch[0]}-${targetMatch[0]}`;
            const existing = linkMap.get(key);
            if (existing) {
              existing.count++;
            } else {
              linkMap.set(key, {
                source: sourceMatch[0],
                target: targetMatch[0],
                type: 'data',
                count: 1
              });
            }
          }
        }
      }
    });

    // Add dashboard connections
    Object.keys(agentStates).forEach(agentId => {
      linkMap.set(`dashboard-${agentId}`, {
        source: 'dashboard',
        target: agentId,
        type: 'monitoring',
        count: 1
      });
    });

    const links = Array.from(linkMap.values());

    // Clear previous visualization
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', dimensions.width)
      .attr('height', dimensions.height);

    // Create arrow markers
    svg.append('defs').selectAll('marker')
      .data(['data', 'monitoring'])
      .join('marker')
      .attr('id', d => `arrow-${d}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', d => d === 'data' ? '#3B82F6' : '#9CA3AF')
      .attr('d', 'M0,-5L10,0L0,5');

    const simulation = d3.forceSimulation<Node>(nodes)
      .force('link', d3.forceLink<Node, Link>(links)
        .id(d => d.id)
        .distance(150))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force('collision', d3.forceCollide().radius(50));

    // Create links
    const link = svg.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', d => d.type === 'data' ? '#3B82F6' : '#9CA3AF')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => Math.min(d.count * 2, 6))
      .attr('marker-end', d => `url(#arrow-${d.type})`);

    // Create node groups
    const node = svg.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .call(d3.drag<SVGGElement, Node>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }));

    // Add circles for nodes
    node.append('circle')
      .attr('r', d => d.type === 'dashboard' ? 30 : 25)
      .attr('fill', d => {
        if (d.type === 'dashboard') return '#6366F1';
        switch (d.status) {
          case 'working': return '#10B981';
          case 'ready': return '#3B82F6';
          case 'idle': return '#F59E0B';
          case 'error': return '#EF4444';
          default: return '#9CA3AF';
        }
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Add icons
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', '20px')
      .text(d => {
        if (d.type === 'dashboard') return '📊';
        switch (d.id) {
          case 'agent_0': return '📰';
          case 'agent_1': return '🧠';
          case 'agent_2': return '🎨';
          case 'agent_3': return '🏭';
          default: return '🤖';
        }
      });

    // Add labels
    node.append('text')
      .attr('x', 0)
      .attr('y', 35)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#374151')
      .text(d => d.name);

    // Add status indicator
    node.append('circle')
      .attr('cx', 20)
      .attr('cy', -20)
      .attr('r', 4)
      .attr('fill', d => {
        if (d.type === 'dashboard') return '#10B981';
        return d.status === 'working' || d.status === 'ready' ? '#10B981' : '#EF4444';
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 1);

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as Node).x!)
        .attr('y1', d => (d.source as Node).y!)
        .attr('x2', d => (d.target as Node).x!)
        .attr('y2', d => (d.target as Node).y!);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [agentStates, logs, dimensions]);

  return (
    <div className="bg-gray-50 rounded-lg p-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Communication Flow</h2>
        <p className="text-sm text-gray-600 mt-1">
          Real-time visualization of agent communication patterns
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4">
        <svg ref={svgRef} className="w-full" />
      </div>

      <div className="mt-4 flex items-center justify-center space-x-6 text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full" />
          <span className="text-gray-600">Data Flow</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-gray-400 rounded-full" />
          <span className="text-gray-600">Monitoring</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded-full" />
          <span className="text-gray-600">Active</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-500 rounded-full" />
          <span className="text-gray-600">Inactive</span>
        </div>
      </div>
    </div>
  );
};