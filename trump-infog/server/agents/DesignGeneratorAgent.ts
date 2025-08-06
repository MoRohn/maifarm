import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseAgent } from './BaseAgent.js';
import {
  IDesignGeneratorAgent,
  AgentConfig,
  AgentMessage,
  ContentAnalysisResult,
  DesignAssets,
  DesignTemplate,
  VisualElement,
  ColorScheme,
  Typography,
  LayoutSpecification,
  GridSpecification,
  LayoutSection,
  AgentRole
} from './types.js';

export class DesignGeneratorAgent extends BaseAgent implements IDesignGeneratorAgent {
  private colorSchemes: Record<string, ColorScheme> = {
    professional: {
      primary: '#1a237e',
      secondary: '#283593',
      accent: '#e53935',
      background: '#ffffff',
      text: '#212121',
      additional: ['#757575', '#bdbdbd', '#f5f5f5']
    },
    patriotic: {
      primary: '#b71c1c',
      secondary: '#1565c0',
      accent: '#ffd600',
      background: '#f5f5f5',
      text: '#212121',
      additional: ['#ffffff', '#37474f', '#90a4ae']
    },
    modern: {
      primary: '#6200ea',
      secondary: '#00bfa5',
      accent: '#ff6d00',
      background: '#fafafa',
      text: '#424242',
      additional: ['#e0e0e0', '#9e9e9e', '#616161']
    }
  };

  private typographyOptions: Record<string, Typography> = {
    classic: {
      headingFont: 'Georgia, serif',
      bodyFont: 'Arial, sans-serif',
      sizes: {
        h1: '48px',
        h2: '36px',
        h3: '24px',
        body: '16px',
        small: '14px'
      }
    },
    modern: {
      headingFont: 'Helvetica Neue, sans-serif',
      bodyFont: 'Roboto, sans-serif',
      sizes: {
        h1: '56px',
        h2: '40px',
        h3: '28px',
        body: '18px',
        small: '14px'
      }
    }
  };

  constructor(config: AgentConfig) {
    super({
      ...config,
      role: AgentRole.DESIGN_GENERATOR
    });
  }

  async initializeAgent(): Promise<void> {
    console.log('Design Generator Agent initialized with visual design capabilities');
    
    // Ensure design assets directory exists
    await fs.mkdir(path.join(this.config.workingDirectory, 'design_assets'), { recursive: true });
  }

  async startAgent(): Promise<void> {
    console.log('Design Generator Agent started, waiting for analysis data...');
    
    // Wait for content analysis to complete
    await this.waitForStage('content_analysis');
    
    // Load and generate design for the analyzed content
    const analysisPath = path.join(this.coordinationPath, 'trump_infog', 'data_pipeline', 'analysis_results.json');
    try {
      const content = await fs.readFile(analysisPath, 'utf-8');
      const analysis: ContentAnalysisResult = JSON.parse(content);
      await this.generateDesign(analysis);
    } catch (error) {
      console.error('Failed to load analysis for design generation:', error);
      this.handleError(error as Error);
    }
  }

  async stopAgent(): Promise<void> {
    console.log('Design Generator Agent stopping...');
  }

  async processTask(task: any): Promise<any> {
    this.updateProgress(0, 'Processing design generation task');
    
    try {
      const { analysis } = task;
      const result = await this.generateDesign(analysis);
      
      this.notifyComplete(result);
      return result;
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  protected async handleAgentMessage(message: AgentMessage): Promise<void> {
    switch (message.type) {
      case 'design:generate':
        await this.generateDesign(message.payload.analysis);
        break;
      case 'visualize:data':
        await this.createVisualizations(message.payload.data);
        break;
      default:
        console.log(`Unknown message type: ${message.type}`);
    }
  }

  async generateDesign(analysis: ContentAnalysisResult): Promise<DesignAssets> {
    try {
      this.updateProgress(10, 'Selecting design template');
      
      // Select appropriate template based on content
      const template = this.selectTemplate(analysis);
      
      this.updateProgress(25, 'Creating color scheme');
      
      // Choose color scheme based on sentiment
      const colorScheme = this.selectColorScheme(analysis.sentiment.overall);
      
      this.updateProgress(40, 'Defining typography');
      
      // Define typography
      const typography = this.typographyOptions.modern;
      
      this.updateProgress(55, 'Creating layout specification');
      
      // Create layout
      const layout = this.createLayout(analysis);
      
      this.updateProgress(70, 'Generating visual elements');
      
      // Generate visual elements
      const visualElements = await this.createVisualizations(analysis);
      
      this.updateProgress(85, 'Applying branding');
      
      // Create design assets
      let designAssets: DesignAssets = {
        templates: [template],
        visualElements,
        colorScheme,
        typography,
        layout
      };

      // Apply branding
      designAssets = await this.applyBranding(designAssets);
      
      // Save design assets
      await this.saveDesignAssets(designAssets);
      
      this.updateProgress(100, 'Design generation complete');
      this.addOutput(path.join(this.config.workingDirectory, 'outputs', 'design_assets.json'));
      
      // Mark design generation stage as complete
      await this.completeStage('design_generation', {
        templateCount: designAssets.templates.length,
        visualElementCount: designAssets.visualElements.length
      });
      
      return designAssets;
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  private selectTemplate(analysis: ContentAnalysisResult): DesignTemplate {
    // Select template based on content complexity and theme count
    const complexity = analysis.themes.length > 5 ? 'complex' : 'simple';
    
    const templates: Record<string, DesignTemplate> = {
      simple: {
        id: 'simple-infographic',
        name: 'Simple Infographic',
        type: 'vertical',
        structure: {
          sections: ['header', 'summary', 'main-themes', 'sentiment', 'footer']
        },
        styles: {
          padding: '40px',
          maxWidth: '1200px',
          margin: '0 auto'
        }
      },
      complex: {
        id: 'complex-infographic',
        name: 'Complex Dashboard',
        type: 'grid',
        structure: {
          sections: ['header', 'summary', 'themes-grid', 'entities', 'sentiment-charts', 'insights', 'footer']
        },
        styles: {
          padding: '60px',
          maxWidth: '1920px',
          margin: '0 auto'
        }
      }
    };

    return templates[complexity];
  }

  private selectColorScheme(sentiment: number): ColorScheme {
    // Select color scheme based on overall sentiment
    if (sentiment > 0.2) {
      return this.colorSchemes.modern; // Positive - bright, modern colors
    } else if (sentiment < -0.2) {
      return this.colorSchemes.professional; // Negative - serious, professional colors
    } else {
      return this.colorSchemes.patriotic; // Neutral - patriotic theme
    }
  }

  private createLayout(analysis: ContentAnalysisResult): LayoutSpecification {
    const hasMany = analysis.themes.length > 5 || analysis.entities.length > 10;
    
    const grid: GridSpecification = {
      columns: hasMany ? 12 : 8,
      rows: hasMany ? 16 : 12,
      gap: 20
    };

    const sections: LayoutSection[] = [
      {
        id: 'header',
        type: 'header',
        position: { x: 0, y: 0, width: grid.columns, height: 2 }
      },
      {
        id: 'summary',
        type: 'summary',
        position: { x: 0, y: 2, width: grid.columns, height: 2 }
      },
      {
        id: 'themes',
        type: 'themes',
        position: { x: 0, y: 4, width: hasMany ? 8 : grid.columns, height: 4 }
      },
      {
        id: 'sentiment',
        type: 'sentiment',
        position: { x: hasMany ? 8 : 0, y: hasMany ? 4 : 8, width: hasMany ? 4 : grid.columns, height: 4 }
      },
      {
        id: 'entities',
        type: 'entities',
        position: { x: 0, y: hasMany ? 8 : 12, width: grid.columns / 2, height: 3 }
      },
      {
        id: 'insights',
        type: 'insights',
        position: { x: grid.columns / 2, y: hasMany ? 8 : 12, width: grid.columns / 2, height: 3 }
      },
      {
        id: 'footer',
        type: 'footer',
        position: { x: 0, y: grid.rows - 1, width: grid.columns, height: 1 }
      }
    ];

    return {
      width: 1920,
      height: 1080,
      grid,
      sections
    };
  }

  async createVisualizations(data: any): Promise<VisualElement[]> {
    const visualElements: VisualElement[] = [];

    // Theme visualization - bar chart
    if (data.themes) {
      visualElements.push({
        id: 'themes-chart',
        type: 'chart',
        data: {
          type: 'bar',
          data: data.themes.slice(0, 8).map((theme: any) => ({
            label: theme.name,
            value: theme.frequency,
            sentiment: theme.sentiment
          }))
        },
        styles: {
          width: '100%',
          height: '300px'
        }
      });
    }

    // Sentiment visualization - pie chart
    if (data.sentiment) {
      const sentimentData = [
        { label: 'Positive', value: Math.max(0, data.sentiment.overall), color: '#4caf50' },
        { label: 'Negative', value: Math.abs(Math.min(0, data.sentiment.overall)), color: '#f44336' },
        { label: 'Neutral', value: 1 - Math.abs(data.sentiment.overall), color: '#9e9e9e' }
      ];

      visualElements.push({
        id: 'sentiment-pie',
        type: 'chart',
        data: {
          type: 'pie',
          data: sentimentData
        },
        styles: {
          width: '300px',
          height: '300px'
        }
      });
    }

    // Entity cloud
    if (data.entities) {
      visualElements.push({
        id: 'entity-cloud',
        type: 'graphic',
        data: {
          type: 'wordcloud',
          words: data.entities.slice(0, 20).map((entity: any) => ({
            text: entity.name,
            size: entity.frequency * 10
          }))
        },
        styles: {
          width: '100%',
          height: '250px'
        }
      });
    }

    // Icons
    visualElements.push(
      {
        id: 'news-icon',
        type: 'icon',
        svg: this.generateIcon('news'),
        styles: { width: '48px', height: '48px' }
      },
      {
        id: 'analysis-icon',
        type: 'icon',
        svg: this.generateIcon('analysis'),
        styles: { width: '48px', height: '48px' }
      },
      {
        id: 'trend-icon',
        type: 'icon',
        svg: this.generateIcon('trend'),
        styles: { width: '48px', height: '48px' }
      }
    );

    // Background pattern
    visualElements.push({
      id: 'background-pattern',
      type: 'background',
      svg: this.generateBackgroundPattern(),
      styles: {
        opacity: 0.05,
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%'
      }
    });

    return visualElements;
  }

  private generateIcon(type: string): string {
    const icons: Record<string, string> = {
      news: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4zm0-10h16v2H4z"/>
      </svg>`,
      analysis: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
      </svg>`,
      trend: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>
      </svg>`
    };

    return icons[type] || icons.news;
  }

  private generateBackgroundPattern(): string {
    return `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" stroke-width="0.5"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>`;
  }

  async applyBranding(assets: DesignAssets): Promise<DesignAssets> {
    // Add branding elements
    const brandedAssets = { ...assets };
    
    // Add title styling
    brandedAssets.templates[0].styles.title = {
      fontSize: assets.typography.sizes.h1,
      fontFamily: assets.typography.headingFont,
      color: assets.colorScheme.primary,
      textAlign: 'center',
      marginBottom: '40px'
    };

    // Add section styling
    brandedAssets.templates[0].styles.section = {
      backgroundColor: assets.colorScheme.background,
      padding: '30px',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      marginBottom: '30px'
    };

    // Add accent elements
    brandedAssets.visualElements.push({
      id: 'brand-accent',
      type: 'graphic',
      svg: `<svg width="100%" height="4">
        <rect width="100%" height="4" fill="${assets.colorScheme.accent}"/>
      </svg>`,
      styles: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%'
      }
    });

    return brandedAssets;
  }

  private async saveDesignAssets(assets: DesignAssets): Promise<void> {
    const outputPath = path.join(this.config.workingDirectory, 'outputs', 'design_assets.json');
    const pipelinePath = path.join(this.coordinationPath, 'trump_infog', 'data_pipeline', 'design_assets.json');
    const assetsPath = path.join(this.config.workingDirectory, 'design_assets');
    
    // Save main design file
    await Promise.all([
      fs.writeFile(outputPath, JSON.stringify(assets, null, 2)),
      fs.writeFile(pipelinePath, JSON.stringify(assets, null, 2))
    ]);

    // Save individual visual elements as files
    for (const element of assets.visualElements) {
      if (element.svg) {
        const svgPath = path.join(assetsPath, `${element.id}.svg`);
        await fs.writeFile(svgPath, element.svg);
      }
    }

    // Save design summary
    const summaryPath = path.join(this.config.workingDirectory, 'outputs', 'design_summary.json');
    const summary = {
      timestamp: new Date(),
      template: assets.templates[0].name,
      colorScheme: Object.keys(this.colorSchemes).find(
        key => JSON.stringify(this.colorSchemes[key]) === JSON.stringify(assets.colorScheme)
      ),
      visualElementCount: assets.visualElements.length,
      layoutDimensions: `${assets.layout.width}x${assets.layout.height}`,
      sections: assets.layout.sections.map(s => s.type)
    };
    
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  }
}