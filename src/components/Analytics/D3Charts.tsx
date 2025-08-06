import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

interface ChartData {
  label: string;
  value: number;
  color?: string;
}

interface TimeSeriesData {
  timestamp: Date;
  value: number;
  category?: string;
}

interface NetworkData {
  nodes: { id: string; group: string; value: number }[];
  links: { source: string; target: string; value: number }[];
}

interface D3ChartsProps {
  type: 'donut' | 'area' | 'heatmap' | 'network' | 'scatter' | 'sankey';
  data: ChartData[] | TimeSeriesData[] | NetworkData | HeatmapData[] | ScatterData[] | SankeyData;
  width?: number;
  height?: number;
  className?: string;
}

const DonutChart: React.FC<{
  data: ChartData[];
  width: number;
  height: number;
}> = ({ data, width, height }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const radius = Math.min(width, height) / 2;
    const innerRadius = radius * 0.6;

    const g = svg
      .append('g')
      .attr('transform', `translate(${width / 2}, ${height / 2})`);

    const pie = d3.pie<ChartData>()
      .value(d => d.value)
      .sort(null);

    const arc = d3.arc<d3.PieArcDatum<ChartData>>()
      .innerRadius(innerRadius)
      .outerRadius(radius)
      .cornerRadius(4);

    const color = d3.scaleOrdinal()
      .domain(data.map(d => d.label))
      .range(d3.schemeCategory10);

    const arcs = g.selectAll('.arc')
      .data(pie(data))
      .enter()
      .append('g')
      .attr('class', 'arc');

    arcs.append('path')
      .attr('d', arc)
      .attr('fill', d => d.data.color || color(d.data.label) as string)
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .style('opacity', 0)
      .transition()
      .duration(800)
      .style('opacity', 1)
      .attrTween('d', function(d) {
        const i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
        return function(t) {
          return arc(i(t)) || '';
        };
      });

    // Add labels
    arcs.append('text')
      .attr('transform', d => `translate(${arc.centroid(d)})`)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .style('fill', 'white')
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .text(d => d.data.value > 5 ? `${d.data.value}%` : '');

    // Center text
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.1em')
      .style('font-size', '24px')
      .style('font-weight', 'bold')
      .style('fill', '#1f2937')
      .text(d3.sum(data, d => d.value).toFixed(0));

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.2em')
      .style('font-size', '14px')
      .style('fill', '#6b7280')
      .text('Total');

  }, [data, width, height]);

  return <svg ref={svgRef} width={width} height={height} />;
};

const AreaChart: React.FC<{
  data: TimeSeriesData[];
  width: number;
  height: number;
}> = ({ data, width, height }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const margin = { top: 20, right: 30, bottom: 40, left: 50 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.timestamp) as [Date, Date])
      .range([0, innerWidth]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value) as number])
      .nice()
      .range([innerHeight, 0]);

    const area = d3.area<TimeSeriesData>()
      .x(d => x(d.timestamp))
      .y0(innerHeight)
      .y1(d => y(d.value))
      .curve(d3.curveMonotoneX);

    const line = d3.line<TimeSeriesData>()
      .x(d => x(d.timestamp))
      .y(d => y(d.value))
      .curve(d3.curveMonotoneX);

    // Add gradient
    const gradient = svg.append('defs')
      .append('linearGradient')
      .attr('id', 'area-gradient')
      .attr('gradientUnits', 'userSpaceOnUse')
      .attr('x1', 0).attr('y1', y(0))
      .attr('x2', 0).attr('y2', y(d3.max(data, d => d.value) as number));

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#6366f1')
      .attr('stop-opacity', 0.3);

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#6366f1')
      .attr('stop-opacity', 0);

    // Add area
    g.append('path')
      .datum(data)
      .attr('fill', 'url(#area-gradient)')
      .attr('d', area)
      .style('opacity', 0)
      .transition()
      .duration(1000)
      .style('opacity', 1);

    // Add line
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#6366f1')
      .attr('stroke-width', 2)
      .attr('d', line);

    // Add axes
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickFormat(d3.timeFormat('%H:%M') as any));

    g.append('g')
      .call(d3.axisLeft(y));

    // Add dots
    g.selectAll('.dot')
      .data(data)
      .enter().append('circle')
      .attr('class', 'dot')
      .attr('cx', d => x(d.timestamp))
      .attr('cy', d => y(d.value))
      .attr('r', 3)
      .attr('fill', '#6366f1')
      .style('opacity', 0)
      .transition()
      .delay((d, i) => i * 20)
      .duration(500)
      .style('opacity', 1);

  }, [data, width, height]);

  return <svg ref={svgRef} width={width} height={height} />;
};

const NetworkChart: React.FC<{
  data: NetworkData;
  width: number;
  height: number;
}> = ({ data, width, height }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const simulation = d3.forceSimulation(data.nodes as any)
      .force('link', d3.forceLink(data.links).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    const link = svg.append('g')
      .selectAll('line')
      .data(data.links)
      .enter()
      .append('line')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', d => Math.sqrt(d.value));

    const node = svg.append('g')
      .selectAll('circle')
      .data(data.nodes)
      .enter()
      .append('circle')
      .attr('r', d => Math.sqrt(d.value) * 5)
      .attr('fill', d => {
        const colors: { [key: string]: string } = {
          'agent': '#6366f1',
          'task': '#10b981',
          'resource': '#f59e0b',
          'error': '#ef4444',
        };
        return colors[d.group] || '#6b7280';
      })
      .call(d3.drag<any, any>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended) as any);

    const text = svg.append('g')
      .selectAll('text')
      .data(data.nodes)
      .enter()
      .append('text')
      .text(d => d.id)
      .attr('font-size', '12px')
      .attr('dx', 15)
      .attr('dy', 4);

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node
        .attr('cx', (d: any) => d.x)
        .attr('cy', (d: any) => d.y);

      text
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y);
    });

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

  }, [data, width, height]);

  return <svg ref={svgRef} width={width} height={height} />;
};

interface HeatmapData {
  x: string;
  y: string;
  value: number;
}

const HeatmapChart: React.FC<{
  data: HeatmapData[];
  width: number;
  height: number;
}> = ({ data, width, height }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    const margin = { top: 30, right: 30, bottom: 60, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xLabels = Array.from(new Set(data.map(d => d.x)));
    const yLabels = Array.from(new Set(data.map(d => d.y)));

    const x = d3.scaleBand()
      .domain(xLabels)
      .range([0, innerWidth])
      .padding(0.05);

    const y = d3.scaleBand()
      .domain(yLabels)
      .range([0, innerHeight])
      .padding(0.05);

    const colorScale = d3.scaleSequential(d3.interpolateYlOrRd)
      .domain([0, d3.max(data, d => d.value) as number]);

    // Add cells
    g.selectAll('rect')
      .data(data)
      .enter()
      .append('rect')
      .attr('x', d => x(d.x) || 0)
      .attr('y', d => y(d.y) || 0)
      .attr('width', x.bandwidth())
      .attr('height', y.bandwidth())
      .attr('fill', d => colorScale(d.value))
      .attr('rx', 4)
      .style('opacity', 0)
      .transition()
      .duration(800)
      .style('opacity', 1);

    // Add X axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)');

    // Add Y axis
    g.append('g')
      .call(d3.axisLeft(y));

    // Add tooltip
    const tooltip = d3.select('body').append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background', 'rgba(0, 0, 0, 0.8)')
      .style('color', 'white')
      .style('padding', '8px')
      .style('border-radius', '4px')
      .style('font-size', '12px');

    g.selectAll('rect')
      .on('mouseover', function(event, d: any) {
        tooltip.transition().duration(200).style('opacity', .9);
        tooltip.html(`${d.x} - ${d.y}: ${d.value}`)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', function() {
        tooltip.transition().duration(500).style('opacity', 0);
      });

    return () => {
      d3.select('body').selectAll('.tooltip').remove();
    };
  }, [data, width, height]);

  return <svg ref={svgRef} width={width} height={height} />;
};

interface ScatterData {
  x: number;
  y: number;
  size: number;
  category: string;
}

const ScatterChart: React.FC<{
  data: ScatterData[];
  width: number;
  height: number;
}> = ({ data, width, height }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    const margin = { top: 20, right: 30, bottom: 40, left: 50 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
      .domain(d3.extent(data, d => d.x) as [number, number])
      .nice()
      .range([0, innerWidth]);

    const y = d3.scaleLinear()
      .domain(d3.extent(data, d => d.y) as [number, number])
      .nice()
      .range([innerHeight, 0]);

    const size = d3.scaleLinear()
      .domain(d3.extent(data, d => d.size) as [number, number])
      .range([4, 20]);

    const color = d3.scaleOrdinal(d3.schemeCategory10)
      .domain(Array.from(new Set(data.map(d => d.category))));

    // Add X axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x));

    // Add Y axis
    g.append('g')
      .call(d3.axisLeft(y));

    // Add dots
    g.selectAll('circle')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', d => x(d.x))
      .attr('cy', d => y(d.y))
      .attr('r', d => size(d.size))
      .attr('fill', d => color(d.category) as string)
      .attr('opacity', 0.7)
      .style('opacity', 0)
      .transition()
      .delay((d, i) => i * 10)
      .duration(500)
      .style('opacity', 0.7);

  }, [data, width, height]);

  return <svg ref={svgRef} width={width} height={height} />;
};

interface SankeyNode {
  id: string;
  name: string;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

const SankeyChart: React.FC<{
  data: SankeyData;
  width: number;
  height: number;
}> = ({ data, width, height }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data.nodes.length) return;

    const margin = { top: 10, right: 10, bottom: 10, left: 10 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Simple sankey-like visualization using force layout
    const nodes = data.nodes.map((d, i) => ({
      ...d,
      x: (i % 3) * (innerWidth / 3) + innerWidth / 6,
      y: Math.floor(i / 3) * (innerHeight / 3) + innerHeight / 6
    }));

    const links = data.links.map(l => ({
      ...l,
      source: nodes.find(n => n.id === l.source),
      target: nodes.find(n => n.id === l.target)
    }));

    // Draw links
    const linkGenerator = d3.linkHorizontal()
      .x((d: any) => d.x)
      .y((d: any) => d.y);

    g.selectAll('.link')
      .data(links)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', (d: any) => linkGenerator({ source: d.source, target: d.target }) as string)
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', (d: any) => Math.sqrt(d.value) * 2)
      .attr('fill', 'none');

    // Draw nodes
    const node = g.selectAll('.node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', (d: any) => `translate(${d.x},${d.y})`);

    node.append('rect')
      .attr('x', -30)
      .attr('y', -15)
      .attr('width', 60)
      .attr('height', 30)
      .attr('fill', '#6366f1')
      .attr('rx', 4);

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', 'white')
      .attr('font-size', '12px')
      .text((d: any) => d.name);

  }, [data, width, height]);

  return <svg ref={svgRef} width={width} height={height} />;
};

export const D3Charts: React.FC<D3ChartsProps> = ({
  type,
  data,
  width = 400,
  height = 300,
  className,
}) => {
  const chartComponents = {
    donut: DonutChart,
    area: AreaChart,
    network: NetworkChart,
    heatmap: HeatmapChart,
    scatter: ScatterChart,
    sankey: SankeyChart,
  };

  const ChartComponent = chartComponents[type];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={clsx(
        'bg-white dark:bg-gray-900 rounded-apple-lg p-4 border border-gray-200 dark:border-gray-800',
        className
      )}
    >
      <ChartComponent data={data as any} width={width} height={height} />
    </motion.div>
  );
};