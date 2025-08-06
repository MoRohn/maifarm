import * as fs from 'fs/promises';
import * as path from 'path';
import { createCanvas, registerFont, Canvas, CanvasRenderingContext2D } from 'canvas';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { BaseAgent } from './BaseAgent.js';
import {
  IOutputAssemblerAgent,
  AgentConfig,
  AgentMessage,
  ContentAnalysisResult,
  DesignAssets,
  InfographicOutput,
  OutputFormats,
  OutputConfig,
  VisualElement,
  LayoutSection,
  AgentRole
} from './types.js';

export class OutputAssemblerAgent extends BaseAgent implements IOutputAssemblerAgent {
  private canvas: Canvas | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private outputFormats: OutputFormats = {
    png: { enabled: true, quality: 95, resolution: '1920x1080', optimization: true },
    pdf: { enabled: true, metadata: { producer: 'Trump Infographic Generator' } },
    svg: { enabled: true, optimization: true }
  };

  constructor(config: AgentConfig) {
    super({
      ...config,
      role: AgentRole.OUTPUT_ASSEMBLER
    });
  }

  async initializeAgent(): Promise<void> {
    console.log('Output Assembler Agent initialized with export capabilities');
    
    // Ensure output directories exist
    await fs.mkdir(path.join(this.config.workingDirectory, 'final_output'), { recursive: true });
  }

  async startAgent(): Promise<void> {
    console.log('Output Assembler Agent started, waiting for content and design...');
    
    // Wait for both content analysis and design generation to complete
    await Promise.all([
      this.waitForStage('content_analysis'),
      this.waitForStage('design_generation')
    ]);
    
    // Load content and design, then assemble
    try {
      const [contentStr, designStr] = await Promise.all([
        fs.readFile(path.join(this.coordinationPath, 'trump_infog', 'data_pipeline', 'analysis_results.json'), 'utf-8'),
        fs.readFile(path.join(this.coordinationPath, 'trump_infog', 'data_pipeline', 'design_assets.json'), 'utf-8')
      ]);
      
      const content: ContentAnalysisResult = JSON.parse(contentStr);
      const design: DesignAssets = JSON.parse(designStr);
      
      await this.assembleInfographic(content, design);
    } catch (error) {
      console.error('Failed to load data for assembly:', error);
      this.handleError(error as Error);
    }
  }

  async stopAgent(): Promise<void> {
    console.log('Output Assembler Agent stopping...');
  }

  async processTask(task: any): Promise<any> {
    this.updateProgress(0, 'Processing output assembly task');
    
    try {
      const { content, design } = task;
      const result = await this.assembleInfographic(content, design);
      
      this.notifyComplete(result);
      return result;
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  protected async handleAgentMessage(message: AgentMessage): Promise<void> {
    switch (message.type) {
      case 'assemble:start':
        await this.assembleInfographic(message.payload.content, message.payload.design);
        break;
      case 'export:formats':
        await this.exportFormats(message.payload.infographic, message.payload.formats);
        break;
      default:
        console.log(`Unknown message type: ${message.type}`);
    }
  }

  async assembleInfographic(
    content: ContentAnalysisResult,
    design: DesignAssets
  ): Promise<InfographicOutput> {
    try {
      this.updateProgress(10, 'Setting up canvas');
      
      // Create canvas with specified dimensions
      const { width, height } = design.layout;
      this.canvas = createCanvas(width, height);
      this.ctx = this.canvas.getContext('2d');
      
      this.updateProgress(20, 'Applying background and layout');
      
      // Apply background
      this.applyBackground(design);
      
      this.updateProgress(30, 'Rendering header section');
      
      // Render each layout section
      for (const section of design.layout.sections) {
        await this.renderSection(section, content, design);
        this.updateProgress(30 + (section.position.y / design.layout.grid.rows) * 50, `Rendering ${section.type} section`);
      }
      
      this.updateProgress(80, 'Exporting formats');
      
      // Create infographic output object
      const infographic = {
        canvas: this.canvas,
        content,
        design,
        metadata: {
          title: 'Trump News Analysis Infographic',
          created: new Date(),
          dimensions: { width, height }
        }
      };
      
      // Export to multiple formats
      const output = await this.exportFormats(infographic, this.outputFormats);
      
      this.updateProgress(95, 'Validating output');
      
      // Validate output
      const isValid = await this.validateOutput(output);
      if (!isValid) {
        throw new Error('Output validation failed');
      }
      
      this.updateProgress(100, 'Assembly complete');
      this.addOutput(path.join(this.config.workingDirectory, 'final_output', 'infographic.png'));
      
      // Mark output assembly stage as complete
      await this.completeStage('output_assembly', {
        formats: Object.keys(output.formats),
        quality: output.metadata.quality
      });
      
      return output;
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  private applyBackground(design: DesignAssets): void {
    if (!this.ctx) return;
    
    // Fill background color
    this.ctx.fillStyle = design.colorScheme.background;
    this.ctx.fillRect(0, 0, design.layout.width, design.layout.height);
    
    // Apply background pattern if exists
    const bgPattern = design.visualElements.find(el => el.type === 'background');
    if (bgPattern && bgPattern.svg) {
      // Note: In production, would convert SVG to pattern
      this.ctx.globalAlpha = 0.05;
      // Apply pattern (simplified for example)
      this.ctx.globalAlpha = 1;
    }
  }

  private async renderSection(
    section: LayoutSection,
    content: ContentAnalysisResult,
    design: DesignAssets
  ): Promise<void> {
    if (!this.ctx) return;
    
    const { grid } = design.layout;
    const x = (section.position.x / grid.columns) * design.layout.width;
    const y = (section.position.y / grid.rows) * design.layout.height;
    const width = (section.position.width / grid.columns) * design.layout.width - grid.gap;
    const height = (section.position.height / grid.rows) * design.layout.height - grid.gap;
    
    // Save context state
    this.ctx.save();
    
    // Clip to section bounds
    this.ctx.beginPath();
    this.ctx.rect(x, y, width, height);
    this.ctx.clip();
    
    // Render based on section type
    switch (section.type) {
      case 'header':
        this.renderHeader(x, y, width, height, content, design);
        break;
      case 'summary':
        this.renderSummary(x, y, width, height, content, design);
        break;
      case 'themes':
        this.renderThemes(x, y, width, height, content, design);
        break;
      case 'sentiment':
        this.renderSentiment(x, y, width, height, content, design);
        break;
      case 'entities':
        this.renderEntities(x, y, width, height, content, design);
        break;
      case 'insights':
        this.renderInsights(x, y, width, height, content, design);
        break;
      case 'footer':
        this.renderFooter(x, y, width, height, content, design);
        break;
    }
    
    // Restore context state
    this.ctx.restore();
  }

  private renderHeader(x: number, y: number, width: number, height: number, content: ContentAnalysisResult, design: DesignAssets): void {
    if (!this.ctx) return;
    
    // Background accent
    this.ctx.fillStyle = design.colorScheme.primary;
    this.ctx.fillRect(x, y, width, 4);
    
    // Title
    this.ctx.fillStyle = design.colorScheme.primary;
    this.ctx.font = `bold ${design.typography.sizes.h1} ${design.typography.headingFont}`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('Trump News Analysis', x + width / 2, y + height / 2);
    
    // Date
    this.ctx.font = `${design.typography.sizes.body} ${design.typography.bodyFont}`;
    this.ctx.fillStyle = design.colorScheme.text;
    this.ctx.fillText(new Date().toLocaleDateString(), x + width / 2, y + height / 2 + 40);
  }

  private renderSummary(x: number, y: number, width: number, height: number, content: ContentAnalysisResult, design: DesignAssets): void {
    if (!this.ctx) return;
    
    const padding = 20;
    
    // Background
    this.ctx.fillStyle = design.colorScheme.additional[2];
    this.ctx.fillRect(x, y, width, height);
    
    // Summary text
    this.ctx.fillStyle = design.colorScheme.text;
    this.ctx.font = `${design.typography.sizes.body} ${design.typography.bodyFont}`;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    
    // Wrap text (simplified)
    const words = content.summary.split(' ');
    let line = '';
    let yPos = y + padding;
    
    for (const word of words) {
      const testLine = line + word + ' ';
      const metrics = this.ctx.measureText(testLine);
      
      if (metrics.width > width - 2 * padding && line.length > 0) {
        this.ctx.fillText(line, x + padding, yPos);
        line = word + ' ';
        yPos += 25;
      } else {
        line = testLine;
      }
    }
    
    if (line.length > 0) {
      this.ctx.fillText(line, x + padding, yPos);
    }
  }

  private renderThemes(x: number, y: number, width: number, height: number, content: ContentAnalysisResult, design: DesignAssets): void {
    if (!this.ctx) return;
    
    const padding = 20;
    const barHeight = 30;
    const maxThemes = Math.floor((height - 2 * padding - 40) / (barHeight + 10));
    const themes = content.themes.slice(0, maxThemes);
    
    // Title
    this.ctx.fillStyle = design.colorScheme.primary;
    this.ctx.font = `bold ${design.typography.sizes.h3} ${design.typography.headingFont}`;
    this.ctx.textAlign = 'left';
    this.ctx.fillText('Key Themes', x + padding, y + padding);
    
    // Find max frequency for scaling
    const maxFreq = Math.max(...themes.map(t => t.frequency));
    
    // Render bars
    themes.forEach((theme, index) => {
      const barY = y + padding + 40 + index * (barHeight + 10);
      const barWidth = (theme.frequency / maxFreq) * (width - 2 * padding - 150);
      
      // Bar
      this.ctx!.fillStyle = theme.sentiment > 0 ? '#4caf50' : theme.sentiment < 0 ? '#f44336' : '#9e9e9e';
      this.ctx!.fillRect(x + padding, barY, barWidth, barHeight);
      
      // Label
      this.ctx!.fillStyle = design.colorScheme.text;
      this.ctx!.font = `${design.typography.sizes.small} ${design.typography.bodyFont}`;
      this.ctx!.textAlign = 'left';
      this.ctx!.textBaseline = 'middle';
      this.ctx!.fillText(theme.name, x + padding + barWidth + 10, barY + barHeight / 2);
    });
  }

  private renderSentiment(x: number, y: number, width: number, height: number, content: ContentAnalysisResult, design: DesignAssets): void {
    if (!this.ctx) return;
    
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const radius = Math.min(width, height) / 3;
    
    // Title
    this.ctx.fillStyle = design.colorScheme.primary;
    this.ctx.font = `bold ${design.typography.sizes.h3} ${design.typography.headingFont}`;
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Overall Sentiment', centerX, y + 30);
    
    // Sentiment gauge
    const sentiment = content.sentiment.overall;
    const angle = (sentiment + 1) * Math.PI / 2; // Convert -1 to 1 range to 0 to PI
    
    // Background arc
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, Math.PI, 0);
    this.ctx.strokeStyle = design.colorScheme.additional[0];
    this.ctx.lineWidth = 20;
    this.ctx.stroke();
    
    // Sentiment arc
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, Math.PI, Math.PI + angle);
    this.ctx.strokeStyle = sentiment > 0.1 ? '#4caf50' : sentiment < -0.1 ? '#f44336' : '#9e9e9e';
    this.ctx.lineWidth = 20;
    this.ctx.stroke();
    
    // Value text
    this.ctx.fillStyle = design.colorScheme.text;
    this.ctx.font = `bold ${design.typography.sizes.h2} ${design.typography.headingFont}`;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(sentiment.toFixed(2), centerX, centerY + 20);
  }

  private renderEntities(x: number, y: number, width: number, height: number, content: ContentAnalysisResult, design: DesignAssets): void {
    if (!this.ctx) return;
    
    const padding = 20;
    
    // Title
    this.ctx.fillStyle = design.colorScheme.primary;
    this.ctx.font = `bold ${design.typography.sizes.h3} ${design.typography.headingFont}`;
    this.ctx.textAlign = 'left';
    this.ctx.fillText('Key People & Organizations', x + padding, y + padding);
    
    // Entity list
    const entities = content.entities.slice(0, 8);
    entities.forEach((entity, index) => {
      const yPos = y + padding + 40 + index * 25;
      
      // Entity type icon
      this.ctx!.fillStyle = entity.type === 'person' ? design.colorScheme.secondary : design.colorScheme.accent;
      this.ctx!.fillRect(x + padding, yPos - 8, 16, 16);
      
      // Entity name
      this.ctx!.fillStyle = design.colorScheme.text;
      this.ctx!.font = `${design.typography.sizes.small} ${design.typography.bodyFont}`;
      this.ctx!.fillText(`${entity.name} (${entity.frequency})`, x + padding + 25, yPos);
    });
  }

  private renderInsights(x: number, y: number, width: number, height: number, content: ContentAnalysisResult, design: DesignAssets): void {
    if (!this.ctx) return;
    
    const padding = 20;
    
    // Title
    this.ctx.fillStyle = design.colorScheme.primary;
    this.ctx.font = `bold ${design.typography.sizes.h3} ${design.typography.headingFont}`;
    this.ctx.textAlign = 'left';
    this.ctx.fillText('Key Insights', x + padding, y + padding);
    
    // Insights
    const insights = content.insights.slice(0, 4);
    insights.forEach((insight, index) => {
      const yPos = y + padding + 40 + index * 40;
      
      // Bullet
      this.ctx!.fillStyle = design.colorScheme.accent;
      this.ctx!.beginPath();
      this.ctx!.arc(x + padding + 8, yPos, 4, 0, Math.PI * 2);
      this.ctx!.fill();
      
      // Text
      this.ctx!.fillStyle = design.colorScheme.text;
      this.ctx!.font = `${design.typography.sizes.small} ${design.typography.bodyFont}`;
      
      // Simple text wrapping
      const maxWidth = width - 2 * padding - 20;
      const words = insight.split(' ');
      let line = '';
      let lineY = yPos;
      
      for (const word of words) {
        const testLine = line + word + ' ';
        const metrics = this.ctx!.measureText(testLine);
        
        if (metrics.width > maxWidth && line.length > 0) {
          this.ctx!.fillText(line, x + padding + 20, lineY);
          line = word + ' ';
          lineY += 18;
        } else {
          line = testLine;
        }
      }
      
      if (line.length > 0) {
        this.ctx!.fillText(line, x + padding + 20, lineY);
      }
    });
  }

  private renderFooter(x: number, y: number, width: number, height: number, content: ContentAnalysisResult, design: DesignAssets): void {
    if (!this.ctx) return;
    
    // Footer background
    this.ctx.fillStyle = design.colorScheme.primary;
    this.ctx.fillRect(x, y, width, height);
    
    // Footer text
    this.ctx.fillStyle = design.colorScheme.background;
    this.ctx.font = `${design.typography.sizes.small} ${design.typography.bodyFont}`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(
      `Generated by Trump Infographic System | ${content.themes.length} themes analyzed | ${content.entities.length} entities identified`,
      x + width / 2,
      y + height / 2
    );
  }

  async exportFormats(infographic: any, formats: OutputFormats): Promise<InfographicOutput> {
    const outputDir = path.join(this.config.workingDirectory, 'final_output');
    const pipelineDir = path.join(this.coordinationPath, 'trump_infog', 'final_output');
    
    await fs.mkdir(pipelineDir, { recursive: true });
    
    const output: InfographicOutput = {
      id: `infographic_${Date.now()}`,
      title: infographic.metadata.title,
      formats: {},
      metadata: {
        created: infographic.metadata.created,
        sources: infographic.content.entities.map((e: any) => e.name).slice(0, 5),
        themes: infographic.content.themes.map((t: any) => t.name).slice(0, 5),
        quality: 0.95
      }
    };

    // Export PNG
    if (formats.png?.enabled && this.canvas) {
      const pngBuffer = this.canvas.toBuffer('image/png', { quality: formats.png.quality || 0.95 });
      const pngPath = path.join(outputDir, 'infographic.png');
      await fs.writeFile(pngPath, pngBuffer);
      await fs.writeFile(path.join(pipelineDir, 'infographic.png'), pngBuffer);
      output.formats.png = pngPath;
      
      // Create optimized version
      if (formats.png.optimization) {
        const optimizedPath = path.join(outputDir, 'infographic_optimized.png');
        await sharp(pngBuffer)
          .png({ quality: 85, compressionLevel: 9 })
          .toFile(optimizedPath);
      }
    }

    // Export PDF
    if (formats.pdf?.enabled) {
      const pdfPath = path.join(outputDir, 'infographic.pdf');
      await this.createPDF(infographic, pdfPath);
      await fs.copyFile(pdfPath, path.join(pipelineDir, 'infographic.pdf'));
      output.formats.pdf = pdfPath;
    }

    // Export SVG
    if (formats.svg?.enabled) {
      const svgPath = path.join(outputDir, 'infographic.svg');
      const svgContent = this.createSVG(infographic);
      await fs.writeFile(svgPath, svgContent);
      await fs.writeFile(path.join(pipelineDir, 'infographic.svg'), svgContent);
      output.formats.svg = svgPath;
    }

    // Save metadata
    const metadataPath = path.join(outputDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(output, null, 2));
    
    return output;
  }

  private async createPDF(infographic: any, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        info: {
          Title: infographic.metadata.title,
          Author: 'Trump Infographic System',
          Subject: 'News Analysis',
          Keywords: infographic.content.themes.map((t: any) => t.name).join(', ')
        }
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Add content to PDF
      if (this.canvas) {
        const pngBuffer = this.canvas.toBuffer('image/png');
        doc.image(pngBuffer, 0, 0, { 
          fit: [doc.page.width, doc.page.height],
          align: 'center',
          valign: 'center'
        });
      }

      doc.end();
      
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });
  }

  private createSVG(infographic: any): string {
    const { width, height } = infographic.design.layout;
    
    // Simplified SVG generation
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${infographic.design.colorScheme.background}"/>
  <text x="${width/2}" y="60" text-anchor="middle" font-size="48" fill="${infographic.design.colorScheme.primary}">
    Trump News Analysis
  </text>
  <text x="${width/2}" y="100" text-anchor="middle" font-size="18" fill="${infographic.design.colorScheme.text}">
    ${new Date().toLocaleDateString()}
  </text>
  <!-- Additional SVG content would be generated here -->
</svg>`;
  }

  async validateOutput(output: InfographicOutput): Promise<boolean> {
    try {
      // Check that all expected formats were created
      const expectedFormats = Object.entries(this.outputFormats)
        .filter(([_, config]) => config.enabled)
        .map(([format]) => format);
      
      for (const format of expectedFormats) {
        if (!output.formats[format as keyof typeof output.formats]) {
          console.error(`Missing expected format: ${format}`);
          return false;
        }
        
        // Verify file exists
        const filePath = output.formats[format as keyof typeof output.formats];
        if (filePath) {
          const stats = await fs.stat(filePath);
          if (stats.size === 0) {
            console.error(`Empty file for format: ${format}`);
            return false;
          }
        }
      }
      
      // Validate metadata
      if (!output.metadata.created || !output.metadata.sources || !output.metadata.themes) {
        console.error('Invalid metadata');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Validation error:', error);
      return false;
    }
  }
}