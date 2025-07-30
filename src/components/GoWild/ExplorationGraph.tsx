import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ExplorationPath, ExplorationNode } from '../../types/goWild';

interface ExplorationGraphProps {
  path: ExplorationPath;
  onNodeClick?: (node: ExplorationNode) => void;
}

const ExplorationGraph: React.FC<ExplorationGraphProps> = ({ path, onNodeClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => {
      if (svgRef.current) {
        const { width } = svgRef.current.getBoundingClientRect();
        setDimensions({ width, height: 400 });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!svgRef.current || path.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { width, height } = dimensions;
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Create main group
    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Prepare data for force simulation
    const nodes = path.nodes.map(node => ({
      ...node,
      x: node.position?.x || Math.random() * innerWidth,
      y: node.position?.y || Math.random() * innerHeight
    }));

    const links = path.edges.map(edge => ({
      source: nodes.find(n => n.id === edge.source)!,
      target: nodes.find(n => n.id === edge.target)!,
      ...edge
    }));

    // Create force simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(innerWidth / 2, innerHeight / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Create gradient definitions
    const defs = svg.append('defs');

    // Add gradient for nodes
    const nodeGradient = defs.append('radialGradient')
      .attr('id', 'node-gradient');
    
    nodeGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#e879f9')
      .attr('stop-opacity', 1);
    
    nodeGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#a855f7')
      .attr('stop-opacity', 1);

    // Add glow filter
    const filter = defs.append('filter')
      .attr('id', 'glow');
    
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '3')
      .attr('result', 'coloredBlur');
    
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Create links
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d: any) => {
        switch (d.type) {
          case 'explore': return '#94a3b8';
          case 'backtrack': return '#f87171';
          case 'leap': return '#fbbf24';
          default: return '#94a3b8';
        }
      })
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', (d: any) => Math.sqrt(d.weight) * 2)
      .attr('stroke-dasharray', (d: any) => d.type === 'leap' ? '5,5' : 'none');

    // Create node groups
    const nodeGroup = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (event, d) => onNodeClick?.(d as ExplorationNode))
      .on('mouseenter', (event, d) => setHoveredNode(d.id))
      .on('mouseleave', () => setHoveredNode(null));

    // Add circles for nodes
    nodeGroup.append('circle')
      .attr('r', (d: any) => {
        const baseSize = 20;
        const creativityBonus = d.creativity * 0.2;
        return baseSize + creativityBonus;
      })
      .attr('fill', (d: any) => {
        switch (d.type) {
          case 'idea': return '#60a5fa';
          case 'solution': return '#34d399';
          case 'discovery': return 'url(#node-gradient)';
          case 'branch': return '#f59e0b';
          default: return '#94a3b8';
        }
      })
      .attr('filter', (d: any) => d.type === 'discovery' ? 'url(#glow)' : 'none')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Add icons
    nodeGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', 'white')
      .attr('font-size', '14px')
      .attr('font-weight', 'bold')
      .text((d: any) => {
        switch (d.type) {
          case 'idea': return '💡';
          case 'solution': return '✓';
          case 'discovery': return '⭐';
          case 'branch': return '⚡';
          default: return '•';
        }
      });

    // Add labels
    nodeGroup.append('text')
      .attr('x', 0)
      .attr('y', (d: any) => 25 + d.creativity * 0.2)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#4b5563')
      .text((d: any) => d.label.length > 20 ? d.label.substring(0, 20) + '...' : d.label);

    // Add confidence indicator
    nodeGroup.append('circle')
      .attr('r', (d: any) => 30 + d.creativity * 0.2)
      .attr('fill', 'none')
      .attr('stroke', (d: any) => `rgba(168, 85, 247, ${d.confidence})`}
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', (d: any) => {
        const radius = 30 + d.creativity * 0.2;
        const circumference = 2 * Math.PI * radius;
        const dashLength = circumference * d.confidence;
        return `${dashLength} ${circumference - dashLength}`;
      });

    // Highlight current node
    const currentNode = nodes.find(n => n.id === path.currentNodeId);
    if (currentNode) {
      nodeGroup
        .filter((d: any) => d.id === currentNode.id)
        .append('circle')
        .attr('r', 40)
        .attr('fill', 'none')
        .attr('stroke', '#e879f9')
        .attr('stroke-width', 3)
        .attr('opacity', 0.6)
        .attr('class', 'pulse-ring');
    }

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      nodeGroup.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // Drag behavior
    const drag = d3.drag<SVGGElement, any>()
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
      });

    nodeGroup.call(drag);

    return () => {
      simulation.stop();
    };
  }, [path, dimensions, onNodeClick]);

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
        style={{ background: 'transparent' }}
      />
      
      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg p-3 space-y-2 text-xs">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-blue-400 rounded-full" />
          <span className="text-gray-600 dark:text-gray-400">Idea</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-green-400 rounded-full" />
          <span className="text-gray-600 dark:text-gray-400">Solution</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full" />
          <span className="text-gray-600 dark:text-gray-400">Discovery</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-amber-400 rounded-full" />
          <span className="text-gray-600 dark:text-gray-400">Branch</span>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center space-x-2">
        <button
          onClick={() => {
            const svg = d3.select(svgRef.current);
            svg.transition()
              .duration(750)
              .call(
                d3.zoom<SVGSVGElement, unknown>().transform,
                d3.zoomIdentity
              );
          }}
          className="px-3 py-1 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg text-sm hover:bg-white dark:hover:bg-gray-700 transition-colors"
        >
          Reset View
        </button>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0% {
            opacity: 0.6;
            transform: scale(1);
          }
          50% {
            opacity: 0.3;
            transform: scale(1.1);
          }
          100% {
            opacity: 0.6;
            transform: scale(1);
          }
        }

        :global(.pulse-ring) {
          animation: pulse 2s infinite;
        }
      `}</style>
    </div>
  );
};

export default ExplorationGraph;