import axios, { AxiosInstance } from 'axios';

interface OllamaModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  modified_at: string;
}

interface OllamaStatus {
  running: boolean;
  configured: boolean;
  model?: string;
  totalModels: number;
  qwenModels: OllamaModel[];
  recommendations?: any[];
}

interface ModelValidation {
  valid: boolean;
  model?: OllamaModel;
  error?: string;
  instructions?: any;
}

interface TestResult {
  success: boolean;
  response?: string;
  error?: string;
}

class OllamaClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api/ollama',
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Get Ollama service status
   */
  async getStatus(): Promise<OllamaStatus> {
    try {
      const [statusRes, modelsRes, recommendedRes] = await Promise.all([
        this.client.get('/status'),
        this.client.get('/models').catch(() => ({ data: { models: [] } })),
        this.client.get('/recommended').catch(() => ({ data: { recommendations: [] } }))
      ]);

      const allModels = modelsRes.data.models || [];
      const qwenModels = allModels.filter((m: OllamaModel) => 
        m.name.toLowerCase().includes('qwen') || 
        m.model?.toLowerCase().includes('qwen')
      );

      return {
        running: statusRes.data.running,
        configured: statusRes.data.configured,
        model: statusRes.data.model,
        totalModels: allModels.length,
        qwenModels,
        recommendations: recommendedRes.data.recommendations
      };
    } catch (error) {
      console.error('Error getting Ollama status:', error);
      return {
        running: false,
        configured: false,
        totalModels: 0,
        qwenModels: []
      };
    }
  }

  /**
   * Validate a specific model
   */
  async validateModel(modelName: string): Promise<ModelValidation> {
    try {
      const response = await this.client.post('/validate', { modelName });
      return response.data;
    } catch (error: any) {
      return {
        valid: false,
        error: error.response?.data?.message || error.message || 'Validation failed'
      };
    }
  }

  /**
   * Test a model with a simple prompt
   */
  async testModel(modelName: string, prompt?: string): Promise<TestResult> {
    try {
      const response = await this.client.post('/test', {
        modelName,
        prompt: prompt || 'Write a simple hello world function in Python.'
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Test failed'
      };
    }
  }

  /**
   * Get download instructions for a model
   */
  async getInstructions(modelName: string): Promise<any> {
    try {
      const response = await this.client.get('/instructions', {
        params: { model: modelName }
      });
      return response.data;
    } catch (error) {
      console.error('Error getting instructions:', error);
      return null;
    }
  }

  /**
   * Configure Qwen Local provider
   */
  async configure(config: {
    modelName: string;
    ollamaPath?: string;
    apiUrl?: string;
  }): Promise<any> {
    try {
      const response = await this.client.post('/configure', config);
      return response.data;
    } catch (error) {
      console.error('Error configuring Qwen Local:', error);
      throw error;
    }
  }

  /**
   * List all available models
   */
  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await this.client.get('/models');
      return response.data.allModels || [];
    } catch (error) {
      console.error('Error listing models:', error);
      return [];
    }
  }

  /**
   * Get recommended models
   */
  async getRecommended(): Promise<any[]> {
    try {
      const response = await this.client.get('/recommended');
      return response.data.recommendations || [];
    } catch (error) {
      console.error('Error getting recommendations:', error);
      return [];
    }
  }

  /**
   * Start Ollama service
   */
  async startService(): Promise<boolean> {
    try {
      const response = await this.client.post('/start');
      return response.data.success === true;
    } catch (error) {
      console.error('Error starting Ollama service:', error);
      return false;
    }
  }

  /**
   * Pull a model from Ollama registry
   */
  async pullModel(
    modelName: string,
    onProgress?: (progress: number, status: string) => void
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(`/api/ollama/pull?modelName=${encodeURIComponent(modelName)}`);
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'progress') {
            // Parse progress percentage from message
            const match = data.message?.match(/(\d+)%/);
            const progress = match ? parseInt(match[1]) : 0;
            onProgress?.(progress, data.message || 'Downloading...');
          } else if (data.type === 'complete') {
            eventSource.close();
            resolve(true);
          } else if (data.type === 'error') {
            eventSource.close();
            reject(new Error(data.error || 'Download failed'));
          }
        } catch (e) {
          console.error('Error parsing SSE data:', e);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        eventSource.close();
        reject(new Error('Connection lost'));
      };
    });
  }
}

// Export singleton instance
export const ollamaClient = new OllamaClient();