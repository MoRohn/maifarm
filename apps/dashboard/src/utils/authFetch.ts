/**
 * Production-grade authentication fetch utility with retry logic and better error handling
 */

interface FetchOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
  timeout?: number;
}

interface AuthError {
  success: false;
  error: string;
  code?: string;
  details?: any;
  status?: number;
}

interface AuthSuccess<T = any> {
  success: true;
  data?: T;
  [key: string]: any;
}

type AuthResponse<T = any> = AuthSuccess<T> | AuthError;

/**
 * Enhanced fetch with retry logic, timeout, and better error handling
 */
export async function authFetch<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<AuthResponse<T>> {
  const {
    retries = 3,
    retryDelay = 1000,
    timeout = 30000,
    ...fetchOptions
  } = options;

  // Add default headers
  const headers = new Headers(fetchOptions.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt <= retries) {
    try {
      console.log(`[AuthFetch] Attempt ${attempt + 1}/${retries + 1} for ${url}`);

      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        credentials: 'include',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Parse response
      let data: any;
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (parseError) {
          console.error('[AuthFetch] Failed to parse JSON response:', parseError);
          data = { error: 'Invalid response format' };
        }
      } else {
        // Non-JSON response
        const text = await response.text();
        data = { error: text || `HTTP ${response.status}: ${response.statusText}` };
      }

      // Handle successful responses (2xx)
      if (response.ok) {
        console.log(`[AuthFetch] Success for ${url}:`, data);

        // Ensure success format
        if (!data.hasOwnProperty('success')) {
          return { success: true, ...data };
        }
        return data;
      }

      // Handle client errors (4xx) - don't retry these
      if (response.status >= 400 && response.status < 500) {
        console.error(`[AuthFetch] Client error for ${url}:`, {
          status: response.status,
          statusText: response.statusText,
          data
        });

        return {
          success: false,
          error: data.error || data.message || `Request failed with status ${response.status}`,
          code: data.code || `HTTP_${response.status}`,
          details: data.details,
          status: response.status
        };
      }

      // Server errors (5xx) - retry these
      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      // Unexpected status
      throw new Error(`Unexpected response: ${response.status} ${response.statusText}`);

    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error as Error;

      // Don't retry on abort
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[AuthFetch] Request timeout:', url);
        return {
          success: false,
          error: 'Request timeout',
          code: 'TIMEOUT'
        };
      }

      // Network errors - retry
      if (attempt < retries) {
        const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
        console.warn(`[AuthFetch] Retrying after ${delay}ms due to:`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
        continue;
      }

      // Final attempt failed
      console.error('[AuthFetch] All attempts failed for', url, ':', error);
    }
  }

  // All retries exhausted
  return {
    success: false,
    error: lastError?.message || 'Request failed after all retries',
    code: 'NETWORK_ERROR'
  };
}

/**
 * Convenience methods for specific HTTP verbs
 */
export const authAPI = {
  async get<T = any>(url: string, options?: FetchOptions): Promise<AuthResponse<T>> {
    return authFetch<T>(url, { ...options, method: 'GET' });
  },

  async post<T = any>(url: string, body?: any, options?: FetchOptions): Promise<AuthResponse<T>> {
    return authFetch<T>(url, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined
    });
  },

  async put<T = any>(url: string, body?: any, options?: FetchOptions): Promise<AuthResponse<T>> {
    return authFetch<T>(url, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined
    });
  },

  async delete<T = any>(url: string, options?: FetchOptions): Promise<AuthResponse<T>> {
    return authFetch<T>(url, { ...options, method: 'DELETE' });
  }
};

export default authAPI;