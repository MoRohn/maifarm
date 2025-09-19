import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

// Unified API client for the gateway pattern
class UnifiedApiClient {
  private client: AxiosInstance;
  private batchQueue: Map<string, any[]> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;
  
  constructor() {
    this.client = axios.create({
      baseURL: '/api/v2/gateway',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    this.setupInterceptors();
  }
  
  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
    
    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        // Extract data from standardized response
        if (response.data?.meta?.version === 'v2') {
          return response.data.data;
        }
        return response.data;
      },
      (error) => {
        if (error.response?.data?.errors?.[0]) {
          const apiError = error.response.data.errors[0];
          console.error(`API Error: ${apiError.code} - ${apiError.message}`);
        }
        return Promise.reject(error);
      }
    );
  }
  
  // Resource-based methods
  farms = {
    list: (params?: any) => this.client.get('/farms', { params }),
    get: (id: string) => this.client.get(`/farms/${id}`),
    create: (data: any) => this.client.post('/farms', data),
    update: (id: string, data: any) => this.client.put(`/farms/${id}`, data),
    delete: (id: string) => this.client.delete(`/farms/${id}`),
    
    // Sub-resources
    agents: {
      list: (farmId: string) => this.client.get(`/farms/${farmId}/agents`),
      add: (farmId: string, config: any) => this.client.post(`/farms/${farmId}/agents`, config),
      remove: (farmId: string, agentId: string) => 
        this.client.delete(`/farms/${farmId}/agents/${agentId}`)
    },
    
    metrics: (farmId: string, params?: any) => 
      this.client.get(`/farms/${farmId}/metrics`, { params }),
    
    tasks: {
      list: (farmId: string, params?: any) => 
        this.client.get(`/farms/${farmId}/tasks`, { params }),
      submit: (farmId: string, task: any) => 
        this.client.post(`/farms/${farmId}/tasks`, task)
    },
    
    lifecycle: (farmId: string, action: string) =>
      this.client.post(`/farms/${farmId}/lifecycle/${action}`),
    
    harvests: (farmId: string, params?: any) =>
      this.client.get(`/farms/${farmId}/harvests`, { params })
  };
  
  tasks = {
    list: (params?: any) => this.client.get('/tasks', { params }),
    get: (id: string) => this.client.get(`/tasks/${id}`),
    create: (data: any) => this.client.post('/tasks', data),
    cancel: (id: string) => this.client.delete(`/tasks/${id}`)
  };
  
  providers = {
    list: () => this.client.get('/providers'),
    configure: (config: any) => this.client.post('/providers/configure', config),
    status: (provider: string) => this.client.get(`/providers/${provider}/status`),
    test: (provider: string) => this.client.post(`/providers/${provider}/test`)
  };
  
  analytics = {
    overview: () => this.client.get('/analytics/overview'),
    metrics: (params?: any) => this.client.get('/analytics/metrics', { params }),
    costs: (params?: any) => this.client.get('/analytics/costs', { params }),
    performance: () => this.client.get('/analytics/performance')
  };
  
  system = {
    health: () => this.client.get('/system/health'),
    status: () => this.client.get('/system/status'),
    auth: {
      login: (credentials: any) => this.client.post('/system/auth/login', credentials),
      refresh: () => this.client.post('/system/auth/refresh')
    },
    admin: {
      stats: () => this.client.get('/system/admin/stats')
    }
  };
  
  realtime = {
    status: () => this.client.get('/realtime/status'),
    subscribe: (channels: string[]) => this.client.post('/realtime/subscribe', { channels }),
    unsubscribe: (channels: string[]) => this.client.post('/realtime/unsubscribe', { channels }),
    channels: () => this.client.get('/realtime/channels')
  };
  
  // Batch request method
  async batch(requests: Array<{ method: string; path: string; data?: any }>): Promise<any[]> {
    const response = await this.client.post('/batch', { requests });
    return response.data.responses;
  }
  
  // Automatic batching for multiple simultaneous requests
  enableAutoBatching(windowMs = 50) {
    this.client.interceptors.request.use(
      (config) => {
        const batchKey = config.headers?.['X-Batch-Key'];
        if (batchKey && config.method === 'get') {
          // Queue for batching
          return this.queueForBatch(batchKey, config);
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
  }
  
  private queueForBatch(key: string, config: AxiosRequestConfig): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.batchQueue.has(key)) {
        this.batchQueue.set(key, []);
        
        this.batchTimer = setTimeout(() => {
          this.flushBatch(key);
        }, 50);
      }
      
      this.batchQueue.get(key)!.push({ config, resolve, reject });
    });
  }
  
  private async flushBatch(key: string) {
    const batch = this.batchQueue.get(key);
    if (!batch || batch.length === 0) return;
    
    this.batchQueue.delete(key);
    
    try {
      const requests = batch.map(item => ({
        method: item.config.method!,
        path: item.config.url!,
        params: item.config.params
      }));
      
      const responses = await this.batch(requests);
      
      batch.forEach((item, index) => {
        item.resolve(responses[index]);
      });
    } catch (error) {
      batch.forEach(item => item.reject(error));
    }
  }
}

// Export singleton instance
export const api = new UnifiedApiClient();

// Export for backward compatibility
export default api;