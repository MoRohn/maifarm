import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import { ExternalApiConfig } from '@/types/orchestration'
import { faultToleranceService } from './faultTolerance'
import { encryptionService } from '../encryptionService'
import { auditService } from '../audit'
import { monitoringService } from '../monitoringService'

interface ApiRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  data?: any
  params?: Record<string, any>
  headers?: Record<string, string>
}

interface ApiResponse<T = any> {
  data: T
  status: number
  headers: Record<string, string>
  duration: number
}

class ExternalApiIntegration {
  private apiConfigs: Map<string, ExternalApiConfig> = new Map()
  private axiosInstances: Map<string, AxiosInstance> = new Map()
  private requestMetrics: Map<string, { total: number; failures: number; totalDuration: number }> = new Map()

  async registerApi(config: ExternalApiConfig): Promise<void> {
    // Validate configuration
    this.validateApiConfig(config)

    // Store configuration
    this.apiConfigs.set(config.id, config)

    // Create axios instance
    const axiosInstance = await this.createAxiosInstance(config)
    this.axiosInstances.set(config.id, axiosInstance)

    // Initialize metrics
    this.requestMetrics.set(config.id, { total: 0, failures: 0, totalDuration: 0 })

    await auditService.log({
      action: 'api.registered',
      resourceId: config.id,
      resource: 'external_api',
      userId: 'system',
      details: {
        name: config.name,
        type: config.type,
        endpoint: config.endpoint
      }
    })
  }

  async unregisterApi(apiId: string): Promise<void> {
    this.apiConfigs.delete(apiId)
    this.axiosInstances.delete(apiId)
    this.requestMetrics.delete(apiId)

    await auditService.log({
      action: 'api.unregistered',
      resourceId: apiId,
      resource: 'external_api',
      userId: 'system'
    })
  }

  async callApi<T = any>(apiId: string, request: ApiRequest): Promise<ApiResponse<T>> {
    const config = this.apiConfigs.get(apiId)
    if (!config) {
      throw new Error(`API ${apiId} not registered`)
    }

    const axiosInstance = this.axiosInstances.get(apiId)
    if (!axiosInstance) {
      throw new Error(`Axios instance not found for API ${apiId}`)
    }

    const startTime = Date.now()
    const metrics = this.requestMetrics.get(apiId)!

    try {
      // Execute request with fault tolerance
      const response = await faultToleranceService.executeWithRetry(
        async () => {
          const axiosConfig: AxiosRequestConfig = {
            method: request.method,
            url: request.path,
            data: request.data,
            params: request.params,
            headers: { ...request.headers }
          }

          return await axiosInstance.request(axiosConfig)
        },
        {
          operationId: `api-${apiId}-${request.method}-${request.path}`,
          retryPolicy: {
            maxRetries: config.retries || 3,
            initialDelay: 1000,
            maxDelay: 10000,
            backoffMultiplier: 2,
            jitter: true
          },
          onRetry: (attempt, error) => {
            monitoringService.recordMetric({
              name: 'api.request.retry',
              value: 1,
              tags: {
                api: apiId,
                method: request.method,
                path: request.path,
                attempt: attempt.toString(),
                error: error.message
              }
            })
          }
        }
      )

      const duration = Date.now() - startTime

      // Update metrics
      metrics.total++
      metrics.totalDuration += duration

      // Record success metrics
      monitoringService.recordMetric({
        name: 'api.request.success',
        value: 1,
        tags: {
          api: apiId,
          method: request.method,
          path: request.path,
          status: response.status.toString()
        }
      })

      monitoringService.recordMetric({
        name: 'api.request.duration',
        value: duration,
        tags: {
          api: apiId,
          method: request.method,
          path: request.path
        }
      })

      return {
        data: response.data,
        status: response.status,
        headers: response.headers as Record<string, string>,
        duration
      }

    } catch (error) {
      const duration = Date.now() - startTime

      // Update metrics
      metrics.total++
      metrics.failures++
      metrics.totalDuration += duration

      // Record failure metrics
      monitoringService.recordMetric({
        name: 'api.request.failure',
        value: 1,
        tags: {
          api: apiId,
          method: request.method,
          path: request.path,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      })

      await auditService.log({
        action: 'api.request.failed',
        resourceId: apiId,
        resource: 'external_api',
        userId: 'system',
        details: {
          method: request.method,
          path: request.path,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration
        }
      })

      throw error
    }
  }

  async batchCall<T = any>(apiId: string, requests: ApiRequest[]): Promise<ApiResponse<T>[]> {
    const config = this.apiConfigs.get(apiId)
    if (!config) {
      throw new Error(`API ${apiId} not registered`)
    }

    // Execute requests in parallel with concurrency limit
    const concurrency = 5
    const results: ApiResponse<T>[] = []
    
    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency)
      const batchPromises = batch.map(request => 
        this.callApi<T>(apiId, request).catch(error => ({
          data: null as any,
          status: 0,
          headers: {},
          duration: 0,
          error
        }))
      )
      
      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
    }

    return results
  }

  async testConnection(apiId: string): Promise<boolean> {
    const config = this.apiConfigs.get(apiId)
    if (!config) {
      throw new Error(`API ${apiId} not registered`)
    }

    try {
      // Make a simple GET request to test connectivity
      await this.callApi(apiId, {
        method: 'GET',
        path: '/'
      })
      
      return true
    } catch (error) {
      await auditService.log({
        action: 'api.connection.test.failed',
        resourceId: apiId,
        resource: 'external_api',
        userId: 'system',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      })
      
      return false
    }
  }

  private validateApiConfig(config: ExternalApiConfig): void {
    if (!config.id || !config.name || !config.endpoint) {
      throw new Error('Invalid API configuration: missing required fields')
    }

    try {
      new URL(config.endpoint)
    } catch {
      throw new Error('Invalid API endpoint URL')
    }

    if (config.authentication.type !== 'none' && !config.authentication.configuration) {
      throw new Error('Authentication configuration required for authenticated APIs')
    }
  }

  private async createAxiosInstance(config: ExternalApiConfig): Promise<AxiosInstance> {
    const axiosConfig: AxiosRequestConfig = {
      baseURL: config.endpoint,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      }
    }

    // Configure authentication
    switch (config.authentication.type) {
      case 'api-key':
        const apiKey = await this.getDecryptedValue(config.authentication.configuration.apiKey)
        const keyLocation = config.authentication.configuration.location || 'header'
        const keyName = config.authentication.configuration.keyName || 'X-API-Key'
        
        if (keyLocation === 'header') {
          axiosConfig.headers![keyName] = apiKey
        } else if (keyLocation === 'query') {
          axiosConfig.params = { [keyName]: apiKey }
        }
        break

      case 'basic':
        const username = config.authentication.configuration.username
        const password = await this.getDecryptedValue(config.authentication.configuration.password)
        axiosConfig.auth = { username, password }
        break

      case 'oauth2':
        const token = await this.getOAuth2Token(config.authentication.configuration)
        axiosConfig.headers!['Authorization'] = `Bearer ${token}`
        break
    }

    const instance = axios.create(axiosConfig)

    // Add request interceptor for logging
    instance.interceptors.request.use(
      request => {
        monitoringService.recordMetric({
          name: 'api.request.initiated',
          value: 1,
          tags: {
            api: config.id,
            method: request.method || 'unknown',
            url: request.url || 'unknown'
          }
        })
        return request
      },
      error => {
        return Promise.reject(error)
      }
    )

    // Add response interceptor for token refresh (OAuth2)
    if (config.authentication.type === 'oauth2') {
      instance.interceptors.response.use(
        response => response,
        async error => {
          if (error.response?.status === 401) {
            // Token expired, try to refresh
            const newToken = await this.refreshOAuth2Token(config.authentication.configuration)
            if (newToken) {
              error.config.headers['Authorization'] = `Bearer ${newToken}`
              return instance.request(error.config)
            }
          }
          return Promise.reject(error)
        }
      )
    }

    return instance
  }

  private async getDecryptedValue(encryptedValue: string): Promise<string> {
    // Check if value is encrypted (starts with 'enc:')
    if (encryptedValue.startsWith('enc:')) {
      return await encryptionService.decrypt(encryptedValue.substring(4))
    }
    return encryptedValue
  }

  private async getOAuth2Token(config: any): Promise<string> {
    // This is a simplified OAuth2 implementation
    // In production, implement proper OAuth2 flow
    if (config.accessToken) {
      return await this.getDecryptedValue(config.accessToken)
    }

    // If no access token, try to get one using client credentials
    if (config.clientId && config.clientSecret && config.tokenUrl) {
      const response = await axios.post(config.tokenUrl, {
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: await this.getDecryptedValue(config.clientSecret)
      })
      
      return response.data.access_token
    }

    throw new Error('OAuth2 token not available')
  }

  private async refreshOAuth2Token(config: any): Promise<string | null> {
    if (!config.refreshToken || !config.tokenUrl) {
      return null
    }

    try {
      const response = await axios.post(config.tokenUrl, {
        grant_type: 'refresh_token',
        refresh_token: await this.getDecryptedValue(config.refreshToken),
        client_id: config.clientId,
        client_secret: config.clientSecret ? await this.getDecryptedValue(config.clientSecret) : undefined
      })
      
      // Update stored tokens
      config.accessToken = response.data.access_token
      if (response.data.refresh_token) {
        config.refreshToken = response.data.refresh_token
      }
      
      return response.data.access_token
    } catch {
      return null
    }
  }

  // Get API metrics
  getApiMetrics(apiId: string): { successRate: number; averageDuration: number; totalRequests: number } | null {
    const metrics = this.requestMetrics.get(apiId)
    if (!metrics) return null

    return {
      successRate: metrics.total > 0 ? (metrics.total - metrics.failures) / metrics.total : 0,
      averageDuration: metrics.total > 0 ? metrics.totalDuration / metrics.total : 0,
      totalRequests: metrics.total
    }
  }

  getAllApiMetrics(): Map<string, { successRate: number; averageDuration: number; totalRequests: number }> {
    const allMetrics = new Map()
    
    for (const [apiId, metrics] of this.requestMetrics) {
      allMetrics.set(apiId, {
        successRate: metrics.total > 0 ? (metrics.total - metrics.failures) / metrics.total : 0,
        averageDuration: metrics.total > 0 ? metrics.totalDuration / metrics.total : 0,
        totalRequests: metrics.total
      })
    }
    
    return allMetrics
  }

  // Get registered APIs
  getRegisteredApis(): ExternalApiConfig[] {
    return Array.from(this.apiConfigs.values())
  }

  getApiConfig(apiId: string): ExternalApiConfig | undefined {
    return this.apiConfigs.get(apiId)
  }
}

export const externalApiIntegration = new ExternalApiIntegration()