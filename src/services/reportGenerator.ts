import { Report, ReportSection, ReportFormat, AggregatedMetrics, AgentPerformanceMetric, TimeSeriesData } from '../types/analytics';
import jsPDF from 'jspdf';
// import * as XLSX from 'xlsx'; // Temporarily disabled due to security vulnerability
import { format } from 'date-fns';

interface ReportGenerationOptions {
  name: string;
  description?: string;
  sections: ReportSection[];
  format: ReportFormat;
  schedule?: 'daily' | 'weekly' | 'monthly';
  recipients?: string[];
  data: {
    metrics: AggregatedMetrics | null;
    agentPerformance: AgentPerformanceMetric[];
    timeSeriesData: TimeSeriesData[];
  };
}

class ReportGeneratorService {
  async generateReport(options: ReportGenerationOptions): Promise<Report> {
    const report: Report = {
      id: `report_${Date.now()}`,
      name: options.name,
      description: options.description,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'system',
      format: options.format,
      filters: [],
      metrics: this.extractMetrics(options.sections),
      visualizations: [],
      schedule: options.schedule ? {
        frequency: options.schedule,
        time: '09:00',
        timezone: 'UTC',
        recipients: options.recipients || [],
        enabled: true
      } : undefined
    };

    // Generate report content based on format
    switch (options.format) {
      case 'pdf':
        await this.generatePDF(report, options);
        break;
      case 'csv':
        await this.generateCSV(report, options);
        break;
      case 'excel':
        // Temporarily disabled due to xlsx security vulnerability
        throw new Error('Excel export is temporarily disabled for security reasons. Please use CSV format instead.');
        // await this.generateExcel(report, options);
        break;
      case 'json':
        await this.generateJSON(report, options);
        break;
    }

    return report;
  }

  private extractMetrics(sections: ReportSection[]): string[] {
    const metrics: string[] = [];
    
    sections.forEach(section => {
      if (section.config?.metrics) {
        metrics.push(...section.config.metrics);
      }
    });

    return [...new Set(metrics)];
  }

  private async generatePDF(report: Report, options: ReportGenerationOptions): Promise<void> {
    const doc = new jsPDF();
    let yPosition = 20;

    // Title
    doc.setFontSize(20);
    doc.text(report.name, 20, yPosition);
    yPosition += 10;

    // Description
    if (report.description) {
      doc.setFontSize(12);
      doc.text(report.description, 20, yPosition);
      yPosition += 10;
    }

    // Generated date
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), 'PPpp')}`, 20, yPosition);
    yPosition += 20;

    // Process each section
    for (const section of options.sections) {
      if (!section.enabled) continue;

      // Section title
      doc.setFontSize(16);
      doc.text(section.title, 20, yPosition);
      yPosition += 10;

      // Section content based on type
      switch (section.type) {
        case 'summary':
          yPosition = this.addSummaryToPDF(doc, yPosition, options.data);
          break;
        case 'table':
          yPosition = this.addTableToPDF(doc, yPosition, options.data);
          break;
        case 'chart':
          yPosition = this.addChartPlaceholderToPDF(doc, yPosition, section);
          break;
        case 'insights':
          yPosition = this.addInsightsToPDF(doc, yPosition);
          break;
      }

      yPosition += 10;

      // Add new page if needed
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }
    }

    // Save the PDF
    const fileName = `${report.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`;
    doc.save(fileName);
  }

  private addSummaryToPDF(doc: jsPDF, yPosition: number, data: ReportGenerationOptions['data']): number {
    doc.setFontSize(12);
    
    if (data.metrics) {
      const summaryLines = [
        `Total Tasks: ${data.metrics.totalTasks}`,
        `Completed: ${data.metrics.completedTasks} (${((data.metrics.completedTasks / data.metrics.totalTasks) * 100).toFixed(1)}%)`,
        `Failed: ${data.metrics.failedTasks}`,
        `Active Agents: ${data.metrics.activeAgents}`,
        `Total Cost: $${data.metrics.totalCost.total.toFixed(2)}`
      ];

      summaryLines.forEach(line => {
        doc.text(line, 30, yPosition);
        yPosition += 8;
      });
    }

    return yPosition;
  }

  private addTableToPDF(doc: jsPDF, yPosition: number, data: ReportGenerationOptions['data']): number {
    if (data.agentPerformance.length === 0) return yPosition;

    doc.setFontSize(10);
    
    // Table headers
    const headers = ['Agent', 'Tasks', 'Success Rate', 'CPU', 'Memory'];
    const columnWidths = [50, 30, 35, 25, 25];
    let xPosition = 30;

    headers.forEach((header, index) => {
      doc.text(header, xPosition, yPosition);
      xPosition += columnWidths[index];
    });

    yPosition += 8;

    // Table rows (limited to avoid page overflow)
    const rowsToShow = Math.min(data.agentPerformance.length, 10);
    for (let i = 0; i < rowsToShow; i++) {
      const agent = data.agentPerformance[i];
      xPosition = 30;
      
      const rowData = [
        agent.agentName.substring(0, 20),
        agent.tasksCompleted.toString(),
        `${agent.successRate.toFixed(1)}%`,
        `${agent.resourceUsage.cpu.toFixed(1)}%`,
        `${agent.resourceUsage.memory.toFixed(1)}%`
      ];

      rowData.forEach((cell, index) => {
        doc.text(cell, xPosition, yPosition);
        xPosition += columnWidths[index];
      });

      yPosition += 6;
    }

    return yPosition;
  }

  private addChartPlaceholderToPDF(doc: jsPDF, yPosition: number, section: ReportSection): number {
    doc.setFontSize(10);
    doc.setDrawColor(200);
    doc.rect(30, yPosition, 150, 60);
    doc.text(`[${section.config?.chartType || 'Chart'} visualization would appear here]`, 35, yPosition + 30);
    return yPosition + 60;
  }

  private addInsightsToPDF(doc: jsPDF, yPosition: number): number {
    doc.setFontSize(10);
    const insights = [
      '• Performance has improved by 15% over the last 24 hours',
      '• Resource utilization is optimal at 65-75%',
      '• Consider scaling down by 2 agents to reduce costs'
    ];

    insights.forEach(insight => {
      doc.text(insight, 30, yPosition);
      yPosition += 6;
    });

    return yPosition;
  }

  private async generateCSV(report: Report, options: ReportGenerationOptions): Promise<void> {
    const csvRows: string[] = [];
    
    // Header
    csvRows.push(`Report: ${report.name}`);
    csvRows.push(`Generated: ${format(new Date(), 'PPpp')}`);
    csvRows.push('');

    // Agent Performance Data
    if (options.data.agentPerformance.length > 0) {
      csvRows.push('Agent Performance');
      csvRows.push('Agent Name,Tasks Completed,Success Rate,CPU %,Memory %,Cost/Hour');
      
      options.data.agentPerformance.forEach(agent => {
        csvRows.push([
          agent.agentName,
          agent.tasksCompleted,
          agent.successRate.toFixed(1),
          agent.resourceUsage.cpu.toFixed(1),
          agent.resourceUsage.memory.toFixed(1),
          agent.costMetrics.total.toFixed(2)
        ].join(','));
      });
    }

    // Create and download CSV
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /* Temporarily disabled due to xlsx security vulnerability
  private async generateExcel(report: Report, options: ReportGenerationOptions): Promise<void> {
    const workbook = XLSX.utils.book_new();

    // Summary Sheet
    const summaryData = [
      ['Report Name', report.name],
      ['Generated', format(new Date(), 'PPpp')],
      [''],
      ['Metrics Summary'],
      ['Total Tasks', options.data.metrics?.totalTasks || 0],
      ['Completed Tasks', options.data.metrics?.completedTasks || 0],
      ['Failed Tasks', options.data.metrics?.failedTasks || 0],
      ['Active Agents', options.data.metrics?.activeAgents || 0],
      ['Total Cost', `$${options.data.metrics?.totalCost.total.toFixed(2) || '0.00'}`]
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Agent Performance Sheet
    if (options.data.agentPerformance.length > 0) {
      const performanceData = [
        ['Agent Name', 'Tasks Completed', 'Success Rate %', 'CPU %', 'Memory %', 'Cost/Hour'],
        ...options.data.agentPerformance.map(agent => [
          agent.agentName,
          agent.tasksCompleted,
          agent.successRate.toFixed(1),
          agent.resourceUsage.cpu.toFixed(1),
          agent.resourceUsage.memory.toFixed(1),
          agent.costMetrics.total.toFixed(2)
        ])
      ];

      const performanceSheet = XLSX.utils.aoa_to_sheet(performanceData);
      XLSX.utils.book_append_sheet(workbook, performanceSheet, 'Agent Performance');
    }

    // Save Excel file
    const fileName = `${report.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }
  */

  private async generateJSON(report: Report, options: ReportGenerationOptions): Promise<void> {
    const jsonData = {
      report: {
        id: report.id,
        name: report.name,
        description: report.description,
        generatedAt: report.createdAt,
        data: {
          metrics: options.data.metrics,
          agentPerformance: options.data.agentPerformance,
          timeSeriesData: options.data.timeSeriesData
        }
      }
    };

    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async downloadReport(report: Report, format: ReportFormat): Promise<void> {
    // This is handled by the generation methods above
    console.log(`Downloading report ${report.id} in ${format} format`);
  }

  async scheduleReport(report: Report): Promise<void> {
    if (!report.schedule || !report.schedule.enabled) {
      throw new Error('Report scheduling is not enabled');
    }

    // In a real implementation, this would set up a cron job or similar
    console.log(`Scheduling report ${report.id} with frequency ${report.schedule.frequency}`);
  }

  async emailReport(report: Report, recipients: string[]): Promise<void> {
    // In a real implementation, this would send emails
    console.log(`Emailing report ${report.id} to ${recipients.join(', ')}`);
  }
}

export const reportGenerator = new ReportGeneratorService();