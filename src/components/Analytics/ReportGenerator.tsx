import { useState } from 'react';
import { 
  FileText, 
  Download, 
  Calendar, 
  Clock, 
  CheckCircle, 
  XCircle,
  RefreshCw,
  Filter,
  Settings
} from 'lucide-react';
import { reportingService } from '../../services/reportingService';
import { Report, ReportConfig } from '../../types/reporting';
import { format } from 'date-fns';

export function ReportGenerator() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportType, setReportType] = useState<Report['type']>('performance');
  const [reportFormat, setReportFormat] = useState<Report['format']>('pdf');
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'custom'>('7d');
  const [customDateRange, setCustomDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    end: new Date()
  });
  const [selectedSections, setSelectedSections] = useState<string[]>(['summary', 'metrics', 'charts', 'insights']);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleCron, setScheduleCron] = useState('0 9 * * 1'); // Every Monday at 9 AM

  const loadReports = async () => {
    const existingReports = await reportingService.getReports();
    setReports(existingReports);
  };

  useState(() => {
    loadReports();
  });

  const generateReport = async () => {
    setIsGenerating(true);
    
    try {
      const timeframe = timeRange === 'custom' 
        ? { start: customDateRange.start, end: customDateRange.end }
        : calculateTimeframe(timeRange);

      const config: ReportConfig = {
        timeframe,
        sections: selectedSections.map(type => ({ 
          type: type as any, 
          title: type.charAt(0).toUpperCase() + type.slice(1) 
        })),
        schedule: scheduleEnabled ? {
          enabled: true,
          cron: scheduleCron,
          recipients: [] // Would be configured in a real app
        } : undefined
      };

      const report = await reportingService.generateReport(
        `${reportType} Report - ${format(new Date(), 'yyyy-MM-dd HH:mm')}`,
        reportType,
        reportFormat,
        config
      );

      setReports([report, ...reports]);
      
      // Wait for report to be ready
      const checkReportStatus = setInterval(async () => {
        const updatedReport = await reportingService.getReport(report.id);
        if (updatedReport && updatedReport.status !== 'generating') {
          clearInterval(checkReportStatus);
          setReports(prev => prev.map(r => r.id === report.id ? updatedReport : r));
        }
      }, 1000);
    } catch (error) {
      console.error('Failed to generate report:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const calculateTimeframe = (range: string) => {
    const end = new Date();
    const start = new Date();
    
    switch (range) {
      case '24h':
        start.setDate(start.getDate() - 1);
        break;
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
    }
    
    return { start, end };
  };

  const downloadReport = (report: Report) => {
    if (report.url) {
      const link = document.createElement('a');
      link.href = report.url;
      link.download = `${report.name}.${report.format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const getStatusIcon = (status: Report['status']) => {
    switch (status) {
      case 'ready':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
    }
  };

  const sectionOptions = [
    { value: 'summary', label: 'Executive Summary' },
    { value: 'metrics', label: 'Key Metrics' },
    { value: 'charts', label: 'Visual Charts' },
    { value: 'table', label: 'Detailed Tables' },
    { value: 'insights', label: 'AI Insights' }
  ];

  return (
    <div className="space-y-6">
      {/* Report Configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-medium mb-4">Generate New Report</h3>
        
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Report Type
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as Report['type'])}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
            >
              <option value="performance">Performance Report</option>
              <option value="analytics">Analytics Report</option>
              <option value="audit">Audit Report</option>
              <option value="custom">Custom Report</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Format
            </label>
            <select
              value={reportFormat}
              onChange={(e) => setReportFormat(e.target.value as Report['format'])}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
            >
              <option value="pdf">PDF</option>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
              <option value="excel">Excel</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Time Range
            </label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          
          {timeRange === 'custom' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={format(customDateRange.start, 'yyyy-MM-dd')}
                  onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: new Date(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={format(customDateRange.end, 'yyyy-MM-dd')}
                  onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: new Date(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                />
              </div>
            </div>
          )}
        </div>
        
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Report Sections
          </label>
          <div className="space-y-2">
            {sectionOptions.map(option => (
              <label key={option.value} className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedSections.includes(option.value)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedSections([...selectedSections, option.value]);
                    } else {
                      setSelectedSections(selectedSections.filter(s => s !== option.value));
                    }
                  }}
                  className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
        
        <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium">Schedule Report</h4>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 dark:peer-focus:ring-emerald-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-600"></div>
            </label>
          </div>
          
          {scheduleEnabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Schedule (Cron Expression)
              </label>
              <input
                type="text"
                value={scheduleCron}
                onChange={(e) => setScheduleCron(e.target.value)}
                placeholder="0 9 * * 1"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Current: Every Monday at 9:00 AM
              </p>
            </div>
          )}
        </div>
        
        <div className="mt-6 flex justify-end">
          <button
            onClick={generateReport}
            disabled={isGenerating || selectedSections.length === 0}
            className="px-6 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                Generate Report
              </>
            )}
          </button>
        </div>
      </div>

      {/* Generated Reports */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium">Generated Reports</h3>
        </div>
        
        {reports.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No reports generated yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Generate your first report using the form above
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {reports.map((report) => (
              <div key={report.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(report.status)}
                      <div>
                        <h4 className="font-medium">{report.name}</h4>
                        <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                          <span className="flex items-center">
                            <Filter className="h-3 w-3 mr-1" />
                            {report.type}
                          </span>
                          <span className="flex items-center">
                            <FileText className="h-3 w-3 mr-1" />
                            {report.format.toUpperCase()}
                          </span>
                          <span className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {format(new Date(report.generatedAt || ''), 'MMM dd, yyyy')}
                          </span>
                          <span className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {format(new Date(report.generatedAt || ''), 'HH:mm')}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {report.error && (
                      <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <p className="text-sm text-red-800 dark:text-red-400">
                          Error: {report.error}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="ml-4">
                    {report.status === 'ready' && (
                      <button
                        onClick={() => downloadReport(report)}
                        className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors flex items-center"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}