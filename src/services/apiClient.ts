import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';

// Simple error logging function to replace the missing import
const logAPIError = (error: any, context?: any) => {
  console.error('[API Error]', {
    message: error?.message || error,
    status: error?.response?.status,
    endpoint: context?.endpoint,
    operation: context?.operation,
    metadata: context?.metadata
  });
};

// Use relative URL so Vite proxy handles the routing
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Retry configuration
interface RetryConfig extends AxiosRequestConfig {
  retryCount?: number;
  retryDelay?: number;
  maxRetries?: number;
}

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Increase timeout to 60 seconds for farm creation
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add retry functionality
const retryRequest = async (error: AxiosError, retryConfig: RetryConfig): Promise<any> => {
  const config = error.config as RetryConfig;
  
  // Initialize retry count
  if (!config.retryCount) {
    config.retryCount = 0;
  }
  
  // Default max retries - reduce for network errors to fail faster
  const isNetworkError = error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED';
  const maxRetries = isNetworkError ? 1 : (config.maxRetries || 3);
  const retryDelay = config.retryDelay || 1000;
  
  // Check if we should retry
  const shouldRetry = 
    config.retryCount < maxRetries &&
    (error.code === 'ERR_NETWORK' || 
     error.code === 'ECONNREFUSED' ||
     error.response?.status === 502 ||
     error.response?.status === 503 ||
     error.response?.status === 504);
    
  if (shouldRetry) {
    config.retryCount++;
    
    // Exponential backoff
    const delay = retryDelay * Math.pow(2, config.retryCount - 1);
    
    // Only log retry attempts if not a network error (to reduce console spam)
    if (!isNetworkError) {
      console.warn(`Retrying request (${config.retryCount}/${maxRetries}) after ${delay}ms...`);
    }
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return apiClient.request(config);
  }
  
  throw error;
};

// Track request timing for performance monitoring
const requestTimings = new Map<string, number>();

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Track request start time
    const requestId = `${config.method}-${config.url}-${Date.now()}`;
    config.headers['X-Request-ID'] = requestId;
    requestTimings.set(requestId, Date.now());
    
    // Add auth token if available
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Debug: Catch the problematic handshake request
    if (config.url?.includes('/agents/handshake/')) {
      const match = config.url.match(/\/agents\/handshake\/(.+)/);
      const agentId = match ? match[1] : 'unknown';
      console.warn('[API Debug] Handshake request for agent:', agentId);
      if (agentId === 'undefined' || agentId === 'null') {
        console.error('[API Debug] WARNING: Invalid agent ID in handshake request!');
        console.error('[API Debug] Stack trace:', new Error().stack);
        console.error('[API Debug] Full config:', config);
        // Don't block, but log the issue
      }
    }
    
    // Log request in development (but suppress noisy endpoints)
    if (import.meta.env.DEV) {
      const isNoisyEndpoint = config.url?.includes('/metrics') || 
                              config.url?.includes('/health') ||
                              config.url?.includes('/status');
      if (!isNoisyEndpoint) {
        console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`);
      }
    }
    
    return config;
  },
  (error) => {
    logAPIError(error, {
      endpoint: error.config?.url,
      operation: error.config?.method,
      metadata: { phase: 'request' }
    });
    return Promise.reject(error);
  }
);

// Circuit breaker for API calls
class CircuitBreaker {
  private failures = 0;
  private successCount = 0;
  private lastFailTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private readonly threshold = 5;
  private readonly timeout = 30000; // 30 seconds
  private readonly successThreshold = 3;

  isOpen(): boolean {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailTime > this.timeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        console.log('[Circuit Breaker] Entering HALF_OPEN state');
      }
    }
    return this.state === 'OPEN';
  }

  recordSuccess(): void {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        console.log('[Circuit Breaker] Circuit CLOSED - service recovered');
      }
    }
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailTime = Date.now();
    this.successCount = 0;
    
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      console.error('[Circuit Breaker] Circuit OPEN - too many failures');
    }
  }

  getState(): string {
    return this.state;
  }
}

const circuitBreaker = new CircuitBreaker();

// Response interceptor with error handling
apiClient.interceptors.response.use(
  (response) => {
    // Track response time
    const requestId = response.config.headers?.['X-Request-ID'];
    if (requestId && requestTimings.has(requestId)) {
      const duration = Date.now() - requestTimings.get(requestId)!;
      requestTimings.delete(requestId);
      
      // Log slow requests
      if (duration > 5000) {
        console.warn(`[API Slow] ${response.config.method?.toUpperCase()} ${response.config.url} took ${duration}ms`);
      }
    }
    
    // Record success for circuit breaker
    circuitBreaker.recordSuccess();
    
    return response;
  },
  async (error: AxiosError) => {
    // Track response time for failed requests
    const requestId = error.config?.headers?.['X-Request-ID'];
    if (requestId && requestTimings.has(requestId)) {
      const duration = Date.now() - requestTimings.get(requestId)!;
      requestTimings.delete(requestId);
    }
    
    // Check circuit breaker
    if (circuitBreaker.isOpen()) {
      console.error('[Circuit Breaker] Request blocked - circuit is OPEN');
      return Promise.reject(new Error('Service temporarily unavailable'));
    }
    
    // Record failure for 5xx errors
    if (error.response && error.response.status >= 500) {
      circuitBreaker.recordFailure();
    }
    
    // Try to retry the request
    try {
      return await retryRequest(error, error.config as RetryConfig);
    } catch (retryError) {
      // Only log API errors if not a network error (to avoid console spam)
      const isNetworkError = (retryError as AxiosError).code === 'ERR_NETWORK' || 
                            (retryError as AxiosError).code === 'ECONNREFUSED';
      
      // Suppress 404 errors for farm resources during initial load
      const is404 = (retryError as AxiosError).response?.status === 404;
      const isFarmEndpoint = (retryError as AxiosError).config?.url?.includes('/farms/');
      
      if (!isNetworkError && !(is404 && isFarmEndpoint)) {
        // Log API error with context after retry attempts
        logAPIError(retryError as AxiosError, {
          endpoint: (retryError as AxiosError).config?.url,
          operation: (retryError as AxiosError).config?.method?.toUpperCase(),
          metadata: {
            phase: 'response',
            status: (retryError as AxiosError).response?.status,
            message: (retryError as AxiosError).message,
            code: (retryError as AxiosError).code,
            responseData: (retryError as AxiosError).response?.data,
            retryCount: ((retryError as AxiosError).config as RetryConfig)?.retryCount || 0
          }
        });
      }
      
      // Handle network errors (backend not available)
      if ((retryError as AxiosError).code === 'ERR_NETWORK' || (retryError as AxiosError).code === 'ECONNREFUSED') {
        // Only log once to avoid console spam
        if (!window.__backendWarningShown) {
          console.info('Backend server not available. Using mock data for development.');
          window.__backendWarningShown = true;
        }
      
      // Return mock data for specific endpoints
      const mockResponses: Record<string, any> = {
        '/api/harvest/farms': {
          success: true,
          data: [],
          message: 'Mock response - backend unavailable'
        },
        '/api/harvests': {
          success: true,
          data: [],
          message: 'Mock response - backend unavailable'
        },
        '/api/health': {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: (Date.now() - (window as any).__APP_START_TIME__ || 0) / 1000,
          version: '2.0.0',
          services: {
            api: 'healthy',
            postgres: 'mock',
            redis: 'mock',
            websocket: 'mock'
          },
          checks: [
            {
              name: 'WebSocket',
              status: 'pass',
              componentType: 'service',
              time: 5,
            },
            {
              name: 'Database',
              status: 'pass',
              componentType: 'datastore',
              time: 10,
            },
            {
              name: 'Redis Cache',
              status: 'pass',
              componentType: 'datastore',
              time: 3,
            },
          ],
        },
        '/api/farms': {
          success: true,
          data: {
            farms: [],
            total: 0
          }
        },
        '/api/agents': {
          success: true,
          data: {
            agents: [],
            total: 0
          }
        },
        '/api/metrics/dashboard': {
          success: true,
          data: {
            activeFarms: 0,
            totalAgents: 0,
            tasksCompleted: 0,
            successRate: 0
          }
        },
        '/api/metrics': {
          success: true,
          data: {
            metrics: [],
            timestamp: new Date().toISOString()
          }
        },
        '/api/config': {
          maxAgents: 10,
          maxFarms: 5,
          features: {
            goWildMode: true,
            yamlGeneration: true,
            analytics: true,
            monitoring: true
          },
          version: '2.0.0'
        },
        '/api/auth/status': {
          success: true,
          data: {
            authenticated: true,
            user: {
              id: 'mock-user',
              email: 'user@localhost',
              name: 'Local User',
              roles: ['admin']
            }
          }
        }
      };

        const endpoint = (retryError as AxiosError).config?.url || '';
        const mockData = Object.entries(mockResponses).find(([key]) => 
          endpoint.includes(key)
        )?.[1];

        if (mockData) {
          return {
            data: mockData,
            status: 200,
            statusText: 'OK (Mock)',
            headers: {},
            config: (retryError as AxiosError).config!,
          };
        }
      }

      // Handle 401 Unauthorized
      if ((retryError as AxiosError).response?.status === 401) {
        // Clear auth token and redirect to login
        localStorage.removeItem('authToken');
        window.location.href = '/login';
      }

      return Promise.reject(retryError);
    }
  }
);

export default apiClient;
export { apiClient };

// Helper functions for common API calls
export const api = {
  // Base HTTP methods
  get: (url: string, config?: any) => apiClient.get(url, config),
  post: (url: string, data?: any, config?: any) => apiClient.post(url, data, config),
  put: (url: string, data?: any, config?: any) => apiClient.put(url, data, config),
  delete: (url: string, config?: any) => apiClient.delete(url, config),
  patch: (url: string, data?: any, config?: any) => apiClient.patch(url, data, config),
  
  // Health check
  health: () => apiClient.get('/api/health'),
  
  // Farms
  farms: {
    list: (params?: any) => apiClient.get('/api/farms', { params }),
    get: (id: string) => apiClient.get(`/api/farms/${id}`).catch(error => {
      // Return null for 404s instead of throwing
      if (error.response?.status === 404) {
        return { data: { success: false, data: null } };
      }
      throw error;
    }),
    create: (data: any) => apiClient.post('/api/farms', data),
    update: (id: string, data: any) => apiClient.put(`/api/farms/${id}`, data),
    delete: (id: string) => apiClient.delete(`/api/farms/${id}`),
    launch: (id: string, data: any) => apiClient.post(`/api/farms/${id}/launch`, data),
    start: (id: string) => apiClient.post(`/api/farms/${id}/start`),
    pause: (id: string) => apiClient.post(`/api/farms/${id}/pause`),
    claudeCode: {
      create: (id: string, data: any) => apiClient.post(`/api/farms/${id}/claude-code`, data),
      status: (id: string) => apiClient.get(`/api/farms/${id}/claude-code/status`),
    },
    goWild: {
      start: (farmId: string, config: any) => apiClient.post(`/api/farms/${farmId}/go-wild/start`, { config }),
      pause: (farmId: string) => apiClient.post(`/api/farms/${farmId}/go-wild/pause`),
      resume: (farmId: string) => apiClient.post(`/api/farms/${farmId}/go-wild/resume`),
      stop: (farmId: string) => apiClient.post(`/api/farms/${farmId}/go-wild/stop`),
      updateConfig: (farmId: string, config: any) => apiClient.put(`/api/farms/${farmId}/go-wild/config`, { config }),
      saveDiscovery: (farmId: string, discoveryId: string) => apiClient.post(`/api/farms/${farmId}/go-wild/discoveries/${discoveryId}/save`),
    },
  },
  
  // Agents
  agents: {
    list: (params?: any) => apiClient.get('/api/agents', { params }),
    get: (id: string) => apiClient.get(`/api/agents/${id}`),
    create: (data: any) => apiClient.post('/api/agents', data),
    update: (id: string, data: any) => apiClient.put(`/api/agents/${id}`, data),
    delete: (id: string) => apiClient.delete(`/api/agents/${id}`),
    tasks: (id: string) => apiClient.get(`/api/agents/${id}/tasks`),
    connected: () => apiClient.get('/api/agents/connected'),
    handshake: (id: string) => {
      if (!id || id === 'undefined' || id === 'null') {
        console.error('[API] Attempted to call handshake with invalid agent ID:', id);
        return Promise.reject(new Error('Invalid agent ID for handshake'));
      }
      return apiClient.get(`/api/agents/handshake/${id}`);
    },
  },
  
  // Harvests with proper error handling
  harvests: {
    list: (filter?: any) => apiClient.get('/api/harvests', { params: filter }).catch(error => {
      console.warn('Failed to fetch harvests, returning empty list:', error.message);
      return { data: { success: true, data: [] } };
    }),
    get: (id: string) => apiClient.get(`/api/harvests/${id}`).catch(error => {
      if (error.response?.status === 404) {
        return { data: { success: false, data: null } };
      }
      console.warn('Failed to fetch harvest, returning null:', error.message);
      return { data: { success: false, data: null } };
    }),
    create: (data: any) => apiClient.post('/api/harvests', data),
    update: (id: string, data: any) => apiClient.put(`/api/harvests/${id}`, data),
    delete: (id: string) => apiClient.delete(`/api/harvests/${id}`),
    archive: (id: string) => apiClient.post(`/api/harvests/${id}/archive`),
    export: (options: any) => apiClient.post('/api/harvests/export', options, { responseType: 'blob' }),
  },
  
  // Harvest endpoints with error handling
  harvest: {
    byFarmId: (farmId: string) => apiClient.get(`/api/harvest/farms/${farmId}`).catch(error => {
      console.warn(`Failed to fetch harvests for farm ${farmId}:`, error.message);
      return { data: { success: true, data: [] } };
    }),
    get: (id: string) => apiClient.get(`/api/harvest/${id}`).catch(error => {
      console.warn(`Failed to fetch harvest ${id}:`, error.message);
      return { data: { success: false, data: null } };
    }),
  },
  
  // Seeds
  seeds: {
    list: (includePublic = true) => apiClient.get('/api/seeds', { params: { includePublic } }),
    get: (id: string) => apiClient.get(`/api/seeds/${id}`),
    create: (data: any) => apiClient.post('/api/seeds', data),
    update: (id: string, data: any) => apiClient.put(`/api/seeds/${id}`, data),
    delete: (id: string) => apiClient.delete(`/api/seeds/${id}`),
    recordUsage: (id: string, success: boolean) => apiClient.post(`/api/seeds/${id}/use`, { success }),
    categories: () => apiClient.get('/api/seeds/categories'),
    // New harvest-based seed creation methods
    createFromHarvest: (harvestId: string, data: any) => 
      apiClient.post(`/api/seeds/from-harvest/${harvestId}`, data),
    createFromBarnHarvest: (harvestId: string, data: any) => 
      apiClient.post(`/api/seeds/from-barn-harvest/${harvestId}`, data),
    enhancePrompt: (seedId: string, additionalPrompt: string) => 
      apiClient.put(`/api/seeds/${seedId}/enhance-prompt`, { additionalPrompt }),
    getHarvestDerived: (userOnly = false) => 
      apiClient.get('/api/seeds/harvest-derived', { params: { userOnly } }),
  },
  
  // Farmers
  farmers: {
    list: () => apiClient.get('/api/farmers'),
    getById: (id: string) => apiClient.get(`/api/farmers/${id}`),
    getProfile: (id: string) => apiClient.get(`/api/farmers/${id}/profile`),
    getStats: (id: string) => apiClient.get(`/api/farmers/${id}/stats`),
    use: (id: string, data?: any) => apiClient.post(`/api/farmers/${id}/use`, data),
    generateYaml: (id: string, data: any) => apiClient.post(`/api/farmers/${id}/generate-yaml`, data),
    launch: (id: string, data?: any) => apiClient.post(`/api/farmers/${id}/launch`, data),
    categories: () => apiClient.get('/api/farmers/meta/categories'),
  },

  // Barn
  barn: {
    stats: () => apiClient.get('/api/barn/stats'),
    sync: () => apiClient.post('/api/barn/sync'),
    getSyncStatus: () => apiClient.get('/api/barn/sync-status'),
    getStorageStats: () => apiClient.get('/api/barn/storage-stats'),
    cleanup: (options: any) => apiClient.post('/api/barn/cleanup', options),
    bulkDelete: (itemIds: string[]) => apiClient.delete('/api/barn/items/bulk', { data: { itemIds } }),
    bulkArchive: (itemIds: string[]) => apiClient.post('/api/barn/items/bulk-archive', { itemIds }),
    getArchived: (filter?: any) => apiClient.get('/api/barn/archived', { params: filter }),
    restore: (itemIds: string[]) => apiClient.post('/api/barn/restore', { itemIds }),
    folders: {
      list: () => apiClient.get('/api/barn/folders'),
      create: (data: any) => apiClient.post('/api/barn/folders', data),
      update: (id: string, data: any) => apiClient.put(`/api/barn/folders/${id}`, data),
      delete: (id: string) => apiClient.delete(`/api/barn/folders/${id}`),
    },
  },
  
  // Tasks
  tasks: {
    quick: (data: any) => apiClient.post('/api/tasks/quick', data),
    list: (params?: any) => apiClient.get('/api/tasks', { params }),
    get: (id: string) => apiClient.get(`/api/tasks/${id}`),
    logs: (id: string) => apiClient.get(`/api/tasks/${id}/logs`),
    cancel: (id: string) => apiClient.put(`/api/tasks/${id}/cancel`),
    retry: (id: string) => apiClient.post(`/api/tasks/${id}/retry`),
  },
  
  // Metrics
  metrics: () => apiClient.get('/api/metrics/dashboard'),
  
  // MaiBarn
  maibarn: {
    info: () => apiClient.get('/api/maibarn/info'),
    reset: (options: { includeDatabase?: boolean } = {}) => 
      apiClient.post('/api/maibarn/reset', options),
  },
  
  // WebSocket info
  wsInfo: () => ({
    url: `${API_BASE_URL.replace('http', 'ws')}/ws`,
    available: false, // Will be set to true when backend is available
  }),
};