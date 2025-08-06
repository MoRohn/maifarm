import React, { useState, useRef, useEffect } from 'react';
import { useInfogWebSocket } from '../../hooks/useInfogWebSocket';
import { LogEntry } from '../../types/monitoring';
import { Search, Filter, Download, Trash2, AlertCircle, Info, AlertTriangle, XCircle } from 'lucide-react';
import { format } from 'date-fns';

interface LogRowProps {
  log: LogEntry;
}

const LogRow: React.FC<LogRowProps> = ({ log }) => {
  const getLevelIcon = () => {
    switch (log.level) {
      case 'debug': return <Info className="w-4 h-4 text-gray-500" />;
      case 'info': return <Info className="w-4 h-4 text-blue-500" />;
      case 'warn': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getLevelColor = () => {
    switch (log.level) {
      case 'debug': return 'text-gray-600';
      case 'info': return 'text-blue-600';
      case 'warn': return 'text-yellow-600';
      case 'error': return 'text-red-600';
    }
  };

  return (
    <div className="flex items-start space-x-3 p-2 hover:bg-gray-50 border-b border-gray-100">
      <div className="flex-shrink-0 mt-0.5">{getLevelIcon()}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2 text-xs text-gray-500">
          <span>{format(new Date(log.timestamp), 'HH:mm:ss.SSS')}</span>
          <span>•</span>
          <span className="font-medium">{log.source}</span>
          <span>•</span>
          <span className={`font-medium uppercase ${getLevelColor()}`}>{log.level}</span>
        </div>
        <p className="text-sm text-gray-800 mt-0.5 break-words">{log.message}</p>
        {log.metadata && (
          <pre className="text-xs text-gray-600 mt-1 p-2 bg-gray-100 rounded overflow-x-auto">
            {JSON.stringify(log.metadata, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};

export const LogViewer: React.FC = () => {
  const { logs, clearLogs } = useInfogWebSocket();
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogEntry['level'] | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Get unique sources from logs
  const uniqueSources = Array.from(new Set(logs.map(log => log.source)));

  // Filter logs
  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.source.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
    const matchesSource = sourceFilter === 'all' || log.source === sourceFilter;
    
    return matchesSearch && matchesLevel && matchesSource;
  });

  // Export logs
  const exportLogs = () => {
    const logsData = JSON.stringify(filteredLogs, null, 2);
    const blob = new Blob([logsData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `infograph-logs-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const isScrolledToBottom = scrollHeight - scrollTop - clientHeight < 10;
      setAutoScroll(isScrolledToBottom);
    }
  };

  const logStats = {
    total: logs.length,
    debug: logs.filter(l => l.level === 'debug').length,
    info: logs.filter(l => l.level === 'info').length,
    warn: logs.filter(l => l.level === 'warn').length,
    error: logs.filter(l => l.level === 'error').length
  };

  return (
    <div className="bg-gray-50 rounded-lg p-6 flex flex-col h-[600px]">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Log Viewer</h2>
            <p className="text-sm text-gray-600 mt-1">
              System and agent logs ({filteredLogs.length} of {logs.length} logs)
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={exportLogs}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-1"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
            <button
              onClick={clearLogs}
              className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center space-x-1"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Level filter */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Levels</option>
            <option value="debug">Debug ({logStats.debug})</option>
            <option value="info">Info ({logStats.info})</option>
            <option value="warn">Warning ({logStats.warn})</option>
            <option value="error">Error ({logStats.error})</option>
          </select>

          {/* Source filter */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Sources</option>
            {uniqueSources.map(source => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>

          {/* Auto-scroll toggle */}
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span>Auto-scroll</span>
          </label>
        </div>
      </div>

      {/* Logs container */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 bg-white rounded-lg shadow-sm overflow-y-auto"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <AlertCircle className="w-12 h-12 mb-2" />
            <p>No logs match your filters</p>
          </div>
        ) : (
          <>
            {filteredLogs.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
            <div ref={logsEndRef} />
          </>
        )}
      </div>

      {/* Status bar */}
      <div className="mt-4 flex items-center justify-between text-xs text-gray-600">
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1">
            <Info className="w-3 h-3 text-blue-500" />
            <span>{logStats.info}</span>
          </span>
          <span className="flex items-center space-x-1">
            <AlertTriangle className="w-3 h-3 text-yellow-500" />
            <span>{logStats.warn}</span>
          </span>
          <span className="flex items-center space-x-1">
            <XCircle className="w-3 h-3 text-red-500" />
            <span>{logStats.error}</span>
          </span>
        </div>
        
        {!autoScroll && (
          <button
            onClick={() => {
              setAutoScroll(true);
              logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
          >
            Resume auto-scroll
          </button>
        )}
      </div>
    </div>
  );
};