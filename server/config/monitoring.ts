export const monitoringConfig = {
  // Metrics configuration
  metrics: {
    // Prometheus scrape interval
    scrapeInterval: 15000, // 15 seconds
    
    // Metric retention period
    retentionPeriod: 86400000, // 24 hours
    
    // Default labels for all metrics
    defaultLabels: {
      app: 'maifarm',
      env: process.env.NODE_ENV || 'development',
      version: process.env.APP_VERSION || '2.0.0'
    },
    
    // Histogram buckets for request duration
    httpDurationBuckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    
    // Resource utilization thresholds
    thresholds: {
      cpu: {
        warning: 70,
        critical: 90
      },
      memory: {
        warning: 80,
        critical: 95
      },
      disk: {
        warning: 85,
        critical: 95
      }
    }
  },

  // Logging configuration
  logging: {
    // Log levels in order of severity
    levels: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
    
    // Default log level
    defaultLevel: process.env.LOG_LEVEL || 'info',
    
    // Log format
    format: process.env.LOG_FORMAT || 'json',
    
    // Log rotation
    rotation: {
      maxSize: '100m',
      maxFiles: 10,
      compress: true
    },
    
    // Log filtering
    filters: {
      // Exclude sensitive data patterns
      excludePatterns: [
        /password/i,
        /token/i,
        /secret/i,
        /apikey/i,
        /authorization/i
      ]
    }
  },

  // Alerting configuration
  alerting: {
    // Alert evaluation interval
    evaluationInterval: 30000, // 30 seconds
    
    // Alert notification channels
    channels: {
      webhook: {
        enabled: true,
        url: process.env.ALERT_WEBHOOK_URL
      },
      email: {
        enabled: process.env.SMTP_HOST ? true : false,
        smtp: {
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        },
        from: process.env.ALERT_EMAIL_FROM || 'alerts@maifarm.local',
        to: process.env.ALERT_EMAIL_TO?.split(',') || []
      },
      slack: {
        enabled: process.env.SLACK_WEBHOOK_URL ? true : false,
        webhookUrl: process.env.SLACK_WEBHOOK_URL
      }
    },
    
    // Default alert rules
    defaultRules: [
      {
        name: 'High CPU Usage',
        condition: {
          metric: 'maifarm_resource_utilization',
          labels: { resource_type: 'cpu' },
          operator: '>',
          threshold: 90,
          duration: '5m'
        },
        severity: 'critical',
        actions: ['webhook', 'email', 'slack']
      },
      {
        name: 'High Memory Usage',
        condition: {
          metric: 'maifarm_resource_utilization',
          labels: { resource_type: 'memory' },
          operator: '>',
          threshold: 95,
          duration: '5m'
        },
        severity: 'critical',
        actions: ['webhook', 'email', 'slack']
      },
      {
        name: 'High Error Rate',
        condition: {
          metric: 'maifarm_http_request_duration_seconds_count',
          labels: { status: '5xx' },
          operator: '>',
          threshold: 10,
          duration: '1m'
        },
        severity: 'warning',
        actions: ['webhook', 'slack']
      },
      {
        name: 'Agent Down',
        condition: {
          metric: 'maifarm_active_agents',
          operator: '<',
          threshold: 1,
          duration: '2m'
        },
        severity: 'critical',
        actions: ['webhook', 'email', 'slack']
      }
    ]
  },

  // Health check configuration
  healthCheck: {
    // Health check interval
    interval: 10000, // 10 seconds
    
    // Timeout for health checks
    timeout: 5000, // 5 seconds
    
    // Health check endpoints to monitor
    endpoints: [
      {
        name: 'WebSocket Server',
        url: 'ws://localhost:8080',
        type: 'websocket'
      },
      {
        name: 'Coordination Directory',
        path: '/tmp/claude_coordination',
        type: 'filesystem'
      }
    ],
    
    // Thresholds for health status
    thresholds: {
      healthy: {
        cpu: 70,
        memory: 80,
        responseTime: 1000 // ms
      },
      degraded: {
        cpu: 85,
        memory: 90,
        responseTime: 3000 // ms
      }
    }
  },

  // Performance monitoring
  performance: {
    // Enable performance monitoring
    enabled: true,
    
    // Slow request threshold
    slowRequestThreshold: 1000, // 1 second
    
    // Performance sampling rate (0-1)
    samplingRate: 1,
    
    // Performance metrics to track
    metrics: [
      'requestDuration',
      'databaseQueries',
      'externalAPICalls',
      'memoryUsage',
      'cpuUsage'
    ]
  },

  // Integration settings
  integrations: {
    prometheus: {
      enabled: true,
      path: '/api/metrics',
      includeDefaultMetrics: true
    },
    grafana: {
      enabled: true,
      dashboardsPath: '/monitoring/grafana/dashboards'
    },
    elasticsearch: {
      enabled: process.env.ELASTICSEARCH_URL ? true : false,
      url: process.env.ELASTICSEARCH_URL,
      index: 'maifarm-logs',
      type: '_doc'
    }
  },

  // Security settings for monitoring
  security: {
    // Require authentication for metrics endpoint
    requireAuth: process.env.NODE_ENV === 'production',
    
    // API key for metrics access
    apiKey: process.env.METRICS_API_KEY,
    
    // IP whitelist for metrics access
    ipWhitelist: process.env.METRICS_IP_WHITELIST?.split(',') || [],
    
    // Rate limiting for metrics endpoints
    rateLimit: {
      windowMs: 60000, // 1 minute
      max: 100 // requests per window
    }
  }
};

// Export helper functions
export function getMetricThreshold(metric: string): number | undefined {
  const thresholds = monitoringConfig.metrics.thresholds;
  
  switch (metric) {
    case 'cpu':
      return thresholds.cpu.critical;
    case 'memory':
      return thresholds.memory.critical;
    case 'disk':
      return thresholds.disk.critical;
    default:
      return undefined;
  }
}

export function isLogLevelEnabled(level: string): boolean {
  const levels = monitoringConfig.logging.levels;
  const currentLevel = monitoringConfig.logging.defaultLevel;
  
  const levelIndex = levels.indexOf(level);
  const currentLevelIndex = levels.indexOf(currentLevel);
  
  return levelIndex >= currentLevelIndex;
}

export function getAlertChannel(channelName: string): any {
  return monitoringConfig.alerting.channels[channelName as keyof typeof monitoringConfig.alerting.channels];
}