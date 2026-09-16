import { logger } from '../utils/logger.js';

export interface TelemetryConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  environment: string;
  endpoints: {
    prometheus?: string;
    otlp?: string;
  };
  sampling?: {
    ratio: number;
  };
  costTracking: {
    enableTokenMetrics: boolean;
    enableProviderMetrics: boolean;
    enableRealTimeExport: boolean;
  };
}

/**
 * OpenTelemetry configuration for MaiFarm
 * Implements Step 2 from Claude Cost Tracking Plan
 */
export class TelemetryManager {
  private sdk: NodeSDK | null = null;
  private prometheusExporter: PrometheusExporter | null = null;
  private config: TelemetryConfig;

  constructor(config: TelemetryConfig) {
    this.config = config;
  }

  /**
   * Initialize OpenTelemetry instrumentation
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('OpenTelemetry disabled via configuration');
      return;
    }

    try {
      // Dynamically import OpenTelemetry packages
      const [
        { NodeSDK },
        { Resource },
        { SemanticResourceAttributes },
        { getNodeAutoInstrumentations },
        { PrometheusExporter },
        { PeriodicExportingMetricReader }
      ] = await Promise.all([
        import('@opentelemetry/sdk-node').catch(() => ({ NodeSDK: null })),
        import('@opentelemetry/resources').catch(() => ({ Resource: null })),
        import('@opentelemetry/semantic-conventions').catch(() => ({ SemanticResourceAttributes: null })),
        import('@opentelemetry/auto-instrumentations-node').catch(() => ({ getNodeAutoInstrumentations: null })),
        import('@opentelemetry/exporter-prometheus').catch(() => ({ PrometheusExporter: null })),
        import('@opentelemetry/sdk-metrics').catch(() => ({ PeriodicExportingMetricReader: null }))
      ]);

      // Check if all required packages are available
      if (!NodeSDK || !Resource || !SemanticResourceAttributes || !getNodeAutoInstrumentations || !PrometheusExporter || !PeriodicExportingMetricReader) {
        logger.warn('OpenTelemetry packages not found. Telemetry will be disabled. Install with: npm install @opentelemetry/sdk-node @opentelemetry/resources @opentelemetry/semantic-conventions @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-prometheus @opentelemetry/sdk-metrics');
        return;
      }

      // Set up resource with service information
      const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: this.config.serviceVersion,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.config.environment,
        'service.namespace': 'maifarm',
        'service.component': 'cost-tracking'
      });

      // Configure Prometheus exporter for metrics
      this.prometheusExporter = new PrometheusExporter({
        port: 9464, // Different from main Prometheus port
        endpoint: '/cost-metrics'
      });

      // Set up metric readers
      const metricReaders = [this.prometheusExporter];

      // Add OTLP exporter if configured
      if (this.config.endpoints.otlp) {
        const { OTLPMetricExporter } = require('@opentelemetry/exporter-otlp-http');
        const otlpExporter = new OTLPMetricExporter({
          url: this.config.endpoints.otlp
        });
        
        metricReaders.push(new PeriodicExportingMetricReader({
          exporter: otlpExporter,
          exportIntervalMillis: 30000 // Export every 30 seconds
        }));
      }

      // Initialize SDK
      this.sdk = new NodeSDK({
        resource,
        instrumentations: [
          getNodeAutoInstrumentations({
            // Disable some instrumentations to reduce noise
            '@opentelemetry/instrumentation-fs': {
              enabled: false
            },
            '@opentelemetry/instrumentation-http': {
              enabled: true,
              requestHook: (span, request) => {
                // Add custom attributes for API calls
                if (request.url?.includes('/api/')) {
                  span.setAttributes({
                    'maifarm.api.endpoint': request.url,
                    'maifarm.component': 'api'
                  });
                }
              }
            }
          })
        ],
        metricReader: metricReaders.length > 1 ? undefined : metricReaders[0]
      });

      this.sdk.start();
      logger.info('OpenTelemetry initialized successfully', {
        serviceName: this.config.serviceName,
        prometheusPort: 9464,
        otlpEndpoint: this.config.endpoints.otlp
      });

    } catch (error) {
      logger.error('Failed to initialize OpenTelemetry:', error);
    }
  }

  /**
   * Shutdown telemetry gracefully
   */
  async shutdown(): Promise<void> {
    if (this.sdk) {
      try {
        await this.sdk.shutdown();
        logger.info('OpenTelemetry shutdown completed');
      } catch (error) {
        logger.error('Error during OpenTelemetry shutdown:', error);
      }
    }
  }

  /**
   * Get telemetry configuration
   */
  getConfig(): TelemetryConfig {
    return { ...this.config };
  }

  /**
   * Update telemetry configuration
   */
  updateConfig(updates: Partial<TelemetryConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Telemetry configuration updated', updates);
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get Prometheus metrics endpoint URL
   */
  getPrometheusEndpoint(): string | null {
    return this.prometheusExporter ? 'http://localhost:9464/cost-metrics' : null;
  }
}

// Default configuration
export const defaultTelemetryConfig: TelemetryConfig = {
  enabled: process.env.CLAUDE_CODE_ENABLE_TELEMETRY === '1',
  serviceName: 'maifarm-cost-tracking',
  serviceVersion: process.env.npm_package_version || '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  endpoints: {
    prometheus: process.env.PROMETHEUS_ENDPOINT,
    otlp: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  },
  sampling: {
    ratio: parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG || '0.1')
  },
  costTracking: {
    enableTokenMetrics: true,
    enableProviderMetrics: true,
    enableRealTimeExport: process.env.NODE_ENV === 'production'
  }
};

// Export singleton instance
export const telemetryManager = new TelemetryManager(defaultTelemetryConfig);

// Initialize on module load if enabled
if (defaultTelemetryConfig.enabled) {
  telemetryManager.initialize().catch(error => {
    logger.error('Failed to initialize telemetry:', error);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await telemetryManager.shutdown();
  });
  
  process.on('SIGINT', async () => {
    await telemetryManager.shutdown();
  });
}