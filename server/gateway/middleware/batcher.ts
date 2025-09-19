import { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'events';

interface BatchRequest {
  method: string;
  path: string;
  params?: any;
  query?: any;
  body?: any;
  headers?: any;
}

interface BatchResponse {
  status: number;
  data: any;
  headers?: any;
}

interface BatchedRequest {
  requests: BatchRequest[];
}

class BatchProcessor extends EventEmitter {
  private batchQueue: Map<string, {
    requests: Array<{req: BatchRequest, resolve: Function, reject: Function}>;
    timer: NodeJS.Timeout;
  }> = new Map();
  
  private batchWindow = 50; // 50ms window to collect requests
  private maxBatchSize = 10; // Maximum requests per batch
  
  async processBatch(requests: BatchRequest[]): Promise<BatchResponse[]> {
    const results: BatchResponse[] = [];
    
    // Process requests in parallel
    const promises = requests.map(async (batchReq) => {
      try {
        // Execute the request internally
        const response = await this.executeRequest(batchReq);
        return {
          status: 200,
          data: response,
          headers: {}
        };
      } catch (error: any) {
        return {
          status: error.status || 500,
          data: { error: error.message },
          headers: {}
        };
      }
    });
    
    return Promise.all(promises);
  }
  
  private async executeRequest(batchReq: BatchRequest): Promise<any> {
    // This would be replaced with actual internal request routing
    // For now, return mock data
    return {
      method: batchReq.method,
      path: batchReq.path,
      timestamp: new Date().toISOString()
    };
  }
  
  queueRequest(key: string, request: BatchRequest): Promise<BatchResponse> {
    return new Promise((resolve, reject) => {
      if (!this.batchQueue.has(key)) {
        this.batchQueue.set(key, {
          requests: [],
          timer: setTimeout(() => this.flushBatch(key), this.batchWindow)
        });
      }
      
      const batch = this.batchQueue.get(key)!;
      batch.requests.push({ req: request, resolve, reject });
      
      // Flush immediately if batch is full
      if (batch.requests.length >= this.maxBatchSize) {
        clearTimeout(batch.timer);
        this.flushBatch(key);
      }
    });
  }
  
  private async flushBatch(key: string) {
    const batch = this.batchQueue.get(key);
    if (!batch || batch.requests.length === 0) return;
    
    this.batchQueue.delete(key);
    
    try {
      const requests = batch.requests.map(r => r.req);
      const responses = await this.processBatch(requests);
      
      batch.requests.forEach((item, index) => {
        item.resolve(responses[index]);
      });
    } catch (error) {
      batch.requests.forEach(item => {
        item.reject(error);
      });
    }
  }
}

const batchProcessor = new BatchProcessor();

export function requestBatcher() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Check if this is a batch request
    if (req.path === '/batch' && req.method === 'POST') {
      const batchedRequest = req.body as BatchedRequest;
      
      if (!batchedRequest.requests || !Array.isArray(batchedRequest.requests)) {
        return res.status(400).json({
          error: 'Invalid batch request format'
        });
      }
      
      try {
        // Process batch requests
        const responses = await batchProcessor.processBatch(batchedRequest.requests);
        
        // Return batched responses
        res.json({
          responses,
          meta: {
            batchSize: batchedRequest.requests.length,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error: any) {
        res.status(500).json({
          error: 'Batch processing failed',
          message: error.message
        });
      }
    } else {
      // Regular request - check if it can be batched with others
      const batchKey = req.get('X-Batch-Key');
      
      if (batchKey && req.method === 'GET') {
        // Queue this request for batching
        try {
          const response = await batchProcessor.queueRequest(batchKey, {
            method: req.method,
            path: req.path,
            query: req.query,
            params: req.params,
            headers: req.headers
          });
          
          res.status(response.status).json(response.data);
        } catch (error: any) {
          res.status(500).json({
            error: 'Request batching failed',
            message: error.message
          });
        }
      } else {
        // Non-batchable request
        next();
      }
    }
  };
}