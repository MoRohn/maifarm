import React, { useState } from 'react';
import {
  FileText,
  Plus,
  Download,
  Send,
  Calendar,
  Clock,
  Filter,
  Layout,
  PieChart,
  BarChart3,
  LineChart as LineChartIcon,
  Table,
  Save,
  X,
  Move
} from 'lucide-react';
import { useAnalyticsStore } from '../../store/analyticsStore';
import { reportGenerator } from '../../services/reportGenerator';
import { Report, ReportSection, ReportFormat } from '../../types/analytics';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface ReportBuilderProps {
  onClose?: () => void;
  onReportCreated?: (report: Report) => void;
}

export const ReportBuilder: React.FC<ReportBuilderProps> = ({
  onClose,
  onReportCreated
}) => {
  const [reportName, setReportName] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [selectedSections, setSelectedSections] = useState<ReportSection[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>('pdf');
  const [schedule, setSchedule] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
  const [emailRecipients, setEmailRecipients] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const { agentPerformance, metrics, timeSeriesData, addReport } = useAnalyticsStore();

  const availableSections: ReportSection[] = [
    {
      id: 'executive-summary',
      type: 'summary',
      title: 'Executive Summary',
      enabled: true,
      order: 0,
      config: {
        includeKeyMetrics: true,
        includeTrends: true,
        includeRecommendations: true
      }
    },
    {
      id: 'performance-metrics',
      type: 'chart',
      title: 'Performance Metrics',
      enabled: true,
      order: 1,
      config: {
        chartType: 'line',
        metrics: ['Task Completion Rate', 'Success Rate'],
        timeRange: 'last-7-days'
      }
    },
    {
      id: 'agent-performance',
      type: 'table',
      title: 'Agent Performance Table',
      enabled: true,
      order: 2,
      config: {
        columns: ['Agent Name', 'Tasks Completed', 'Success Rate', 'Avg Response Time'],
        sortBy: 'tasksCompleted',
        limit: 20
      }
    },
    {
      id: 'resource-utilization',
      type: 'chart',
      title: 'Resource Utilization',
      enabled: true,
      order: 3,
      config: {
        chartType: 'bar',
        metrics: ['CPU Usage', 'Memory Usage'],
        groupBy: 'agent'
      }
    },
    {
      id: 'cost-analysis',
      type: 'chart',
      title: 'Cost Analysis',
      enabled: true,
      order: 4,
      config: {
        chartType: 'pie',
        breakdown: ['compute', 'storage', 'network', 'api']
      }
    },
    {
      id: 'insights',
      type: 'insights',
      title: 'AI-Generated Insights',
      enabled: true,
      order: 5,
      config: {
        maxInsights: 5,
        categories: ['performance', 'cost', 'optimization']
      }
    }
  ];

  const handleSectionToggle = (sectionId: string) => {
    const section = availableSections.find(s => s.id === sectionId);
    if (!section) return;

    if (selectedSections.find(s => s.id === sectionId)) {
      setSelectedSections(selectedSections.filter(s => s.id !== sectionId));
    } else {
      setSelectedSections([...selectedSections, section]);
    }
  };

  const handleSectionReorder = (sectionId: string, direction: 'up' | 'down') => {
    const index = selectedSections.findIndex(s => s.id === sectionId);
    if (index === -1) return;

    const newSections = [...selectedSections];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex >= 0 && targetIndex < newSections.length) {
      [newSections[index], newSections[targetIndex]] = [newSections[targetIndex], newSections[index]];
      setSelectedSections(newSections);
    }
  };

  const handleGenerateReport = async () => {
    if (!reportName.trim()) {
      toast.error('Please enter a report name');
      return;
    }

    if (selectedSections.length === 0) {
      toast.error('Please select at least one section');
      return;
    }

    setIsGenerating(true);
    try {
      const report = await reportGenerator.generateReport({
        name: reportName,
        description: reportDescription,
        sections: selectedSections,
        format: selectedFormat,
        schedule: schedule !== 'none' ? schedule : undefined,
        recipients: emailRecipients ? emailRecipients.split(',').map(e => e.trim()) : undefined,
        data: {
          metrics,
          agentPerformance,
          timeSeriesData
        }
      });

      addReport(report);
      toast.success('Report generated successfully');
      
      if (onReportCreated) {
        onReportCreated(report);
      }

      // Download the report
      await reportGenerator.downloadReport(report, selectedFormat);
    } catch (error) {
      console.error('Failed to generate report:', error);
      toast.error('Failed to generate report');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-500" />
            <h2 className="text-xl font-bold">Report Builder</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Report Configuration */}
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Report Name</label>
                <input
                  type="text"
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  placeholder="e.g., Weekly Performance Report"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="Brief description of the report..."
                  rows={3}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Output Format</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['pdf', 'csv', 'json', 'excel'] as ReportFormat[]).map((format) => (
                    <button
                      key={format}
                      onClick={() => setSelectedFormat(format)}
                      className={`px-3 py-2 rounded-lg border transition-colors uppercase text-sm ${
                        selectedFormat === format
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600'
                          : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {format}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Schedule</label>
                <select
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value as any)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                >
                  <option value="none">One-time Report</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              {schedule !== 'none' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Email Recipients</label>
                  <input
                    type="text"
                    value={emailRecipients}
                    onChange={(e) => setEmailRecipients(e.target.value)}
                    placeholder="email1@example.com, email2@example.com"
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Separate multiple emails with commas
                  </p>
                </div>
              )}
            </div>

            {/* Right Column - Section Selection */}
            <div>
              <h3 className="text-sm font-medium mb-3">Report Sections</h3>
              <div className="space-y-2">
                {availableSections.map((section) => {
                  const isSelected = selectedSections.find(s => s.id === section.id);
                  const sectionIndex = selectedSections.findIndex(s => s.id === section.id);
                  
                  return (
                    <div
                      key={section.id}
                      className={`p-4 rounded-lg border transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-3 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={!!isSelected}
                            onChange={() => handleSectionToggle(section.id)}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          <div className="flex items-center gap-2">
                            {section.type === 'chart' && <BarChart3 className="w-4 h-4 text-gray-500" />}
                            {section.type === 'table' && <Table className="w-4 h-4 text-gray-500" />}
                            {section.type === 'summary' && <FileText className="w-4 h-4 text-gray-500" />}
                            {section.type === 'insights' && <LineChartIcon className="w-4 h-4 text-gray-500" />}
                            <span className="font-medium">{section.title}</span>
                          </div>
                        </label>
                        
                        {isSelected && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleSectionReorder(section.id, 'up')}
                              disabled={sectionIndex === 0}
                              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Move className="w-3 h-3 rotate-180" />
                            </button>
                            <button
                              onClick={() => handleSectionReorder(section.id, 'down')}
                              disabled={sectionIndex === selectedSections.length - 1}
                              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Move className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Clock className="w-4 h-4" />
            <span>{selectedSections.length} sections selected</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Preview
            </button>
            <button
              onClick={handleGenerateReport}
              disabled={isGenerating || !reportName || selectedSections.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Generate Report
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};