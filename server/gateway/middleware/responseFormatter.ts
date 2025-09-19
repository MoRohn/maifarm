import { Request, Response, NextFunction } from 'express';

export interface StandardResponse<T = any> {
  success: boolean;
  data?: T;
  meta: {
    timestamp: string;
    version: string;
    cache?: {
      hit: boolean;
      ttl?: number;
      key?: string;
    };
    pagination?: {
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
  };
  errors?: Array<{
    code: string;
    message: string;
    field?: string;
    details?: any;
  }>;
}

export function responseFormatter() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override json method to format response
    res.json = function(data: any): Response {
      // Skip formatting for already formatted responses
      if (data && typeof data === 'object' && 'meta' in data && 'timestamp' in data.meta) {
        return originalJson(data);
      }
      
      // Format the response
      const formattedResponse: StandardResponse = {
        success: res.statusCode >= 200 && res.statusCode < 400,
        data: data,
        meta: {
          timestamp: new Date().toISOString(),
          version: 'v2',
          cache: res.locals.cache,
          pagination: res.locals.pagination
        }
      };
      
      // Handle error responses
      if (!formattedResponse.success) {
        formattedResponse.errors = Array.isArray(data) ? data : [data];
        delete formattedResponse.data;
      }
      
      return originalJson(formattedResponse);
    };
    
    next();
  };
}