import * as d3 from 'd3';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import { IVisualizationService, VisualizationConfig, ChartOutput } from './types.js';
import { cacheService } from './cacheService.js';

export class VisualizationService implements IVisualizationService {
  private dom: JSDOM;
  private document: Document;
  private window: any;

  constructor() {
    this.dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    this.document = this.dom.window.document;
    this.window = this.dom.window;
    
    // Make d3 available in the virtual DOM
    (global as any).document = this.document;
    (global as any).window = this.window;
  }

  async createChart(config: VisualizationConfig): Promise<ChartOutput> {
    const cacheKey = `viz:${JSON.stringify(config)}`;
    const cached = await cacheService.get<ChartOutput>(cacheKey);
    
    if (cached) {
      return cached;
    }

    let svg: string;
    const { width = 800, height = 600 } = config.options || {};

    switch (config.type) {
      case 'bar':
        svg = await this.createBarChart(config.data, config.options);
        break;
      case 'line':
        svg = await this.createLineChart(config.data, config.options);
        break;
      case 'pie':
      case 'donut':
        svg = await this.createPieChart(config.data, config.options, config.type === 'donut');
        break;
      case 'scatter':
        svg = await this.createScatterPlot(config.data, config.options);
        break;
      case 'heatmap':
        svg = await this.createHeatmap(config.data, config.options);
        break;
      case 'treemap':
        svg = await this.createTreemap(config.data, config.options);
        break;
      default:
        throw new Error(`Unsupported chart type: ${config.type}`);
    }

    const optimizedSvg = await this.optimizeSVG(svg);
    const pngBuffer = await this.convertSVGToPNG(optimizedSvg, width, height);

    const output: ChartOutput = {
      svg: optimizedSvg,
      png: pngBuffer,
      metadata: {
        width,
        height,
        type: config.type
      }
    };

    await cacheService.set(cacheKey, output, { ttl: 3600 });
    
    return output;
  }

  private async createBarChart(data: any, options?: any): Promise<string> {
    const { width = 800, height = 600, title = '', colors = ['#4287f5'] } = options || {};
    const margin = { top: 60, right: 30, bottom: 40, left: 90 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const container = this.document.createElement('div');
    this.document.body.appendChild(container);

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('xmlns', 'http://www.w3.org/2000/svg');

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    const x = d3.scaleBand()
      .range([0, innerWidth])
      .domain(data.map((d: any) => d.label))
      .padding(0.1);

    const y = d3.scaleLinear()
      .range([innerHeight, 0])
      .domain([0, d3.max(data, (d: any) => d.value) as number]);

    // Add bars
    g.selectAll('.bar')
      .data(data)
      .enter().append('rect')
      .attr('class', 'bar')
      .attr('x', (d: any) => x(d.label) || 0)
      .attr('width', x.bandwidth())
      .attr('y', (d: any) => y(d.value))
      .attr('height', (d: any) => innerHeight - y(d.value))
      .attr('fill', colors[0]);

    // Add axes
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x));

    g.append('g')
      .call(d3.axisLeft(y));

    // Add title
    if (title) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', 30)
        .attr('text-anchor', 'middle')
        .style('font-size', '20px')
        .style('font-weight', 'bold')
        .text(title);
    }

    const svgString = container.innerHTML;
    this.document.body.removeChild(container);
    
    return svgString;
  }

  private async createLineChart(data: any, options?: any): Promise<string> {
    const { width = 800, height = 600, title = '', colors = ['#4287f5'] } = options || {};
    const margin = { top: 60, right: 30, bottom: 40, left: 90 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const container = this.document.createElement('div');
    this.document.body.appendChild(container);

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('xmlns', 'http://www.w3.org/2000/svg');

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    const x = d3.scaleLinear()
      .range([0, innerWidth])
      .domain(d3.extent(data, (d: any, i: number) => i) as [number, number]);

    const y = d3.scaleLinear()
      .range([innerHeight, 0])
      .domain(d3.extent(data, (d: any) => d.value) as [number, number]);

    // Create line generator
    const line = d3.line<any>()
      .x((d, i) => x(i))
      .y(d => y(d.value));

    // Add line
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', colors[0])
      .attr('stroke-width', 2)
      .attr('d', line);

    // Add dots
    g.selectAll('.dot')
      .data(data)
      .enter().append('circle')
      .attr('class', 'dot')
      .attr('cx', (d: any, i: number) => x(i))
      .attr('cy', (d: any) => y(d.value))
      .attr('r', 4)
      .attr('fill', colors[0]);

    // Add axes
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x));

    g.append('g')
      .call(d3.axisLeft(y));

    // Add title
    if (title) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', 30)
        .attr('text-anchor', 'middle')
        .style('font-size', '20px')
        .style('font-weight', 'bold')
        .text(title);
    }

    const svgString = container.innerHTML;
    this.document.body.removeChild(container);
    
    return svgString;
  }

  private async createPieChart(data: any, options?: any, isDonut: boolean = false): Promise<string> {
    const { width = 600, height = 600, title = '', colors = d3.schemeCategory10 } = options || {};
    const radius = Math.min(width, height) / 2 - 40;
    const innerRadius = isDonut ? radius * 0.6 : 0;

    const container = this.document.createElement('div');
    this.document.body.appendChild(container);

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('xmlns', 'http://www.w3.org/2000/svg');

    const g = svg.append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    const color = d3.scaleOrdinal(colors);

    const pie = d3.pie<any>()
      .value(d => d.value);

    const arc = d3.arc<any>()
      .innerRadius(innerRadius)
      .outerRadius(radius);

    const arcs = g.selectAll('.arc')
      .data(pie(data))
      .enter().append('g')
      .attr('class', 'arc');

    arcs.append('path')
      .attr('d', arc)
      .attr('fill', (d: any) => color(d.data.label));

    // Add labels
    arcs.append('text')
      .attr('transform', (d: any) => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .text((d: any) => d.data.label);

    // Add title
    if (title) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', 30)
        .attr('text-anchor', 'middle')
        .style('font-size', '20px')
        .style('font-weight', 'bold')
        .text(title);
    }

    const svgString = container.innerHTML;
    this.document.body.removeChild(container);
    
    return svgString;
  }

  private async createScatterPlot(data: any, options?: any): Promise<string> {
    const { width = 800, height = 600, title = '', colors = ['#4287f5'] } = options || {};
    const margin = { top: 60, right: 30, bottom: 40, left: 90 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const container = this.document.createElement('div');
    this.document.body.appendChild(container);

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('xmlns', 'http://www.w3.org/2000/svg');

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    const x = d3.scaleLinear()
      .range([0, innerWidth])
      .domain(d3.extent(data, (d: any) => d.x) as [number, number]);

    const y = d3.scaleLinear()
      .range([innerHeight, 0])
      .domain(d3.extent(data, (d: any) => d.y) as [number, number]);

    // Add dots
    g.selectAll('.dot')
      .data(data)
      .enter().append('circle')
      .attr('class', 'dot')
      .attr('cx', (d: any) => x(d.x))
      .attr('cy', (d: any) => y(d.y))
      .attr('r', 5)
      .attr('fill', colors[0])
      .attr('opacity', 0.7);

    // Add axes
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x));

    g.append('g')
      .call(d3.axisLeft(y));

    // Add title
    if (title) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', 30)
        .attr('text-anchor', 'middle')
        .style('font-size', '20px')
        .style('font-weight', 'bold')
        .text(title);
    }

    const svgString = container.innerHTML;
    this.document.body.removeChild(container);
    
    return svgString;
  }

  private async createHeatmap(data: any, options?: any): Promise<string> {
    // Simplified heatmap implementation
    return this.createBarChart(data, options); // Fallback for now
  }

  private async createTreemap(data: any, options?: any): Promise<string> {
    // Simplified treemap implementation
    return this.createBarChart(data, options); // Fallback for now
  }

  async generateInfographicLayout(data: any): Promise<string> {
    const { width = 1920, height = 1080 } = data.options || {};
    
    const container = this.document.createElement('div');
    this.document.body.appendChild(container);

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('xmlns', 'http://www.w3.org/2000/svg')
      .attr('viewBox', `0 0 ${width} ${height}`);

    // Background
    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#f8f9fa');

    // Title section
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 80)
      .attr('text-anchor', 'middle')
      .style('font-size', '48px')
      .style('font-weight', 'bold')
      .style('fill', '#1a1a1a')
      .text(data.title || 'Trump News Analysis');

    // Main content areas
    const contentAreas = [
      { x: 50, y: 150, width: width / 2 - 100, height: 400, id: 'sentiment' },
      { x: width / 2 + 50, y: 150, width: width / 2 - 100, height: 400, id: 'themes' },
      { x: 50, y: 600, width: width - 100, height: 400, id: 'timeline' }
    ];

    contentAreas.forEach(area => {
      const g = svg.append('g')
        .attr('transform', `translate(${area.x},${area.y})`)
        .attr('id', area.id);

      g.append('rect')
        .attr('width', area.width)
        .attr('height', area.height)
        .attr('fill', 'white')
        .attr('stroke', '#e0e0e0')
        .attr('stroke-width', 2)
        .attr('rx', 10);
    });

    const svgString = container.innerHTML;
    this.document.body.removeChild(container);
    
    return svgString;
  }

  async optimizeSVG(svg: string): Promise<string> {
    // Remove unnecessary whitespace
    let optimized = svg.replace(/>\s+</g, '><');
    
    // Add proper XML declaration
    if (!optimized.startsWith('<?xml')) {
      optimized = '<?xml version="1.0" encoding="UTF-8"?>' + optimized;
    }
    
    return optimized;
  }

  validateVisualization(output: ChartOutput): boolean {
    if (!output.svg || output.svg.length < 100) {
      return false;
    }

    if (!output.svg.includes('svg') || !output.svg.includes('xmlns')) {
      return false;
    }

    if (output.png && output.png.length < 100) {
      return false;
    }

    return true;
  }

  private async convertSVGToPNG(svg: string, width: number, height: number): Promise<Buffer> {
    try {
      const buffer = Buffer.from(svg);
      const png = await sharp(buffer)
        .resize(width, height)
        .png()
        .toBuffer();
      
      return png;
    } catch (error) {
      console.error('Error converting SVG to PNG:', error);
      // Return empty buffer on error
      return Buffer.from([]);
    }
  }
}

export const visualizationService = new VisualizationService();