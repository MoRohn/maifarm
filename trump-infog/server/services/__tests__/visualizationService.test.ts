import { VisualizationService } from '../visualizationService';
import { cacheService } from '../cacheService';
import { VisualizationConfig, ChartOutput } from '../types';
import * as d3 from 'd3';
import sharp from 'sharp';

jest.mock('../cacheService');
jest.mock('sharp');

describe('VisualizationService', () => {
  let visualizationService: VisualizationService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    visualizationService = new VisualizationService();
    
    // Mock sharp to return a buffer
    const sharpInstance = {
      png: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-png-data'))
    };
    (sharp as unknown as jest.Mock).mockReturnValue(sharpInstance);
  });

  describe('createChart', () => {
    const mockChartData = [
      { label: 'Category A', value: 100 },
      { label: 'Category B', value: 200 },
      { label: 'Category C', value: 150 },
      { label: 'Category D', value: 300 }
    ];

    it('should return cached chart if available', async () => {
      const cachedOutput: ChartOutput = {
        svg: '<svg>cached</svg>',
        png: Buffer.from('cached-png'),
        metadata: {
          width: 800,
          height: 600,
          type: 'bar'
        }
      };

      (cacheService.get as jest.Mock).mockResolvedValue(cachedOutput);

      const config: VisualizationConfig = {
        type: 'bar',
        data: mockChartData,
        options: { width: 800, height: 600 }
      };

      const result = await visualizationService.createChart(config);

      expect(cacheService.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(cachedOutput);
    });

    it('should create bar chart when not cached', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      (cacheService.set as jest.Mock).mockResolvedValue(undefined);

      const config: VisualizationConfig = {
        type: 'bar',
        data: mockChartData,
        options: { 
          width: 800, 
          height: 600,
          title: 'Test Bar Chart',
          colors: ['#ff0000', '#00ff00', '#0000ff']
        }
      };

      const result = await visualizationService.createChart(config);

      expect(cacheService.get).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty('svg');
      expect(result).toHaveProperty('png');
      expect(result.metadata).toEqual({
        width: 800,
        height: 600,
        type: 'bar'
      });
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should create line chart', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);

      const lineData = [
        { date: '2024-01-01', value: 100 },
        { date: '2024-01-02', value: 120 },
        { date: '2024-01-03', value: 110 },
        { date: '2024-01-04', value: 140 }
      ];

      const config: VisualizationConfig = {
        type: 'line',
        data: lineData,
        options: { width: 800, height: 400 }
      };

      const result = await visualizationService.createChart(config);

      expect(result.metadata.type).toBe('line');
      expect(result.svg).toBeTruthy();
      expect(result.png).toBeInstanceOf(Buffer);
    });

    it('should create pie chart', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);

      const config: VisualizationConfig = {
        type: 'pie',
        data: mockChartData,
        options: { width: 600, height: 600 }
      };

      const result = await visualizationService.createChart(config);

      expect(result.metadata.type).toBe('pie');
      expect(result.svg).toBeTruthy();
    });

    it('should create donut chart', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);

      const config: VisualizationConfig = {
        type: 'donut',
        data: mockChartData,
        options: { width: 600, height: 600 }
      };

      const result = await visualizationService.createChart(config);

      expect(result.metadata.type).toBe('donut');
      expect(result.svg).toBeTruthy();
    });

    it('should throw error for unsupported chart type', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);

      const config: VisualizationConfig = {
        type: 'invalid-type' as any,
        data: mockChartData,
        options: {}
      };

      await expect(visualizationService.createChart(config)).rejects.toThrow(
        'Unsupported chart type: invalid-type'
      );
    });

    it('should handle empty data gracefully', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);

      const config: VisualizationConfig = {
        type: 'bar',
        data: [],
        options: { width: 800, height: 600 }
      };

      const result = await visualizationService.createChart(config);

      expect(result.svg).toBeTruthy();
      expect(result.metadata.type).toBe('bar');
    });
  });

  describe('createInfographic', () => {
    it('should create comprehensive infographic', async () => {
      const sections = [
        {
          type: 'header' as const,
          content: {
            title: 'Trump Policy Update',
            subtitle: 'Key Statistics and Trends'
          }
        },
        {
          type: 'chart' as const,
          content: {
            type: 'bar' as const,
            data: [
              { label: 'Approval', value: 45 },
              { label: 'Disapproval', value: 50 },
              { label: 'Undecided', value: 5 }
            ]
          }
        },
        {
          type: 'text' as const,
          content: {
            text: 'Latest polling data shows mixed reactions to recent policy announcements.'
          }
        }
      ];

      const result = await visualizationService.createInfographic(sections, {
        width: 1200,
        height: 800,
        theme: 'modern'
      });

      expect(result).toHaveProperty('svg');
      expect(result).toHaveProperty('png');
      expect(result.metadata.sections).toBe(3);
    });

    it('should handle invalid section types', async () => {
      const sections = [
        {
          type: 'invalid' as any,
          content: { data: 'test' }
        }
      ];

      await expect(
        visualizationService.createInfographic(sections, {})
      ).rejects.toThrow();
    });
  });

  describe('data processing', () => {
    it('should aggregate data correctly', () => {
      const data = [
        { category: 'A', value: 10 },
        { category: 'A', value: 20 },
        { category: 'B', value: 15 },
        { category: 'B', value: 25 },
        { category: 'C', value: 30 }
      ];

      const aggregated = visualizationService.aggregateData(data, 'category', 'sum');

      expect(aggregated).toEqual([
        { category: 'A', value: 30 },
        { category: 'B', value: 40 },
        { category: 'C', value: 30 }
      ]);
    });

    it('should calculate averages correctly', () => {
      const data = [
        { category: 'A', value: 10 },
        { category: 'A', value: 20 },
        { category: 'A', value: 30 }
      ];

      const averaged = visualizationService.aggregateData(data, 'category', 'average');

      expect(averaged).toEqual([
        { category: 'A', value: 20 }
      ]);
    });

    it('should format data for timeline visualization', () => {
      const events = [
        { date: '2024-01-01', event: 'Policy Announcement' },
        { date: '2024-02-15', event: 'Press Conference' },
        { date: '2024-03-30', event: 'Rally' }
      ];

      const formatted = visualizationService.formatTimelineData(events);

      expect(formatted).toHaveLength(3);
      expect(formatted[0]).toHaveProperty('date');
      expect(formatted[0]).toHaveProperty('event');
    });
  });

  describe('export functionality', () => {
    it('should export chart as SVG string', async () => {
      const config: VisualizationConfig = {
        type: 'bar',
        data: [
          { label: 'Test', value: 100 }
        ],
        options: { width: 400, height: 300 }
      };

      (cacheService.get as jest.Mock).mockResolvedValue(null);

      const result = await visualizationService.createChart(config);
      const svgExport = await visualizationService.exportAsSVG(result);

      expect(svgExport).toContain('<svg');
      expect(svgExport).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it('should export chart as PNG buffer', async () => {
      const config: VisualizationConfig = {
        type: 'bar',
        data: [
          { label: 'Test', value: 100 }
        ],
        options: { width: 400, height: 300 }
      };

      (cacheService.get as jest.Mock).mockResolvedValue(null);

      const result = await visualizationService.createChart(config);
      const pngExport = await visualizationService.exportAsPNG(result);

      expect(pngExport).toBeInstanceOf(Buffer);
      expect(pngExport.length).toBeGreaterThan(0);
    });

    it('should export chart with custom dimensions', async () => {
      const config: VisualizationConfig = {
        type: 'bar',
        data: [
          { label: 'Test', value: 100 }
        ],
        options: { width: 400, height: 300 }
      };

      (cacheService.get as jest.Mock).mockResolvedValue(null);

      const result = await visualizationService.createChart(config);
      const customExport = await visualizationService.exportWithDimensions(
        result,
        1920,
        1080
      );

      expect(customExport.metadata.width).toBe(1920);
      expect(customExport.metadata.height).toBe(1080);
    });
  });

  describe('theme support', () => {
    it('should apply dark theme', async () => {
      const config: VisualizationConfig = {
        type: 'bar',
        data: [
          { label: 'Test', value: 100 }
        ],
        options: { 
          width: 400, 
          height: 300,
          theme: 'dark'
        }
      };

      (cacheService.get as jest.Mock).mockResolvedValue(null);

      const result = await visualizationService.createChart(config);

      expect(result.svg).toContain('fill="#');
      expect(result.metadata).toHaveProperty('type', 'bar');
    });

    it('should apply custom color palette', async () => {
      const config: VisualizationConfig = {
        type: 'pie',
        data: [
          { label: 'A', value: 30 },
          { label: 'B', value: 70 }
        ],
        options: { 
          width: 400, 
          height: 400,
          colors: ['#ff0000', '#00ff00']
        }
      };

      (cacheService.get as jest.Mock).mockResolvedValue(null);

      const result = await visualizationService.createChart(config);

      expect(result.svg).toBeTruthy();
      expect(result.metadata.type).toBe('pie');
    });
  });

  describe('error handling', () => {
    it('should handle invalid data structure', async () => {
      const config: VisualizationConfig = {
        type: 'bar',
        data: 'invalid-data' as any,
        options: {}
      };

      (cacheService.get as jest.Mock).mockResolvedValue(null);

      await expect(visualizationService.createChart(config)).rejects.toThrow();
    });

    it('should handle sharp conversion errors', async () => {
      (cacheService.get as jest.Mock).mockResolvedValue(null);
      
      const sharpInstance = {
        png: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Sharp error'))
      };
      (sharp as unknown as jest.Mock).mockReturnValue(sharpInstance);

      const config: VisualizationConfig = {
        type: 'bar',
        data: [{ label: 'Test', value: 100 }],
        options: {}
      };

      await expect(visualizationService.createChart(config)).rejects.toThrow();
    });
  });
});