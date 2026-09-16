import {
  attachCorrelationHeaders,
  endRequestTrace,
  ensureCorrelationId,
  getCorrelationHeaderName,
  startRequestTrace,
} from '../services/requestTracer'

let installed = false

/**
 * Converts a relative URL to an absolute URL.
 * Safari's Request constructor doesn't handle relative URLs well and throws
 * "The string did not match the expected pattern" error.
 */
function toAbsoluteUrl(url: string | URL): string {
  try {
    if (url instanceof URL) {
      return url.toString()
    }

    // If already absolute, return as-is
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
      return url
    }

    // Handle data: and blob: URLs
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      return url
    }

    // Convert relative URL to absolute using current origin
    return new URL(url, window.location.origin).toString()
  } catch {
    // Fallback: return the original string if URL construction fails
    return typeof url === 'string' ? url : url.toString()
  }
}

/**
 * Safely create Headers object - Safari can throw on invalid header values
 */
function safeCreateHeaders(init?: HeadersInit | Headers): Headers {
  try {
    if (init instanceof Headers) {
      // Clone existing Headers
      const newHeaders = new Headers()
      init.forEach((value, key) => {
        try {
          newHeaders.set(key, value)
        } catch {
          // Skip invalid headers
        }
      })
      return newHeaders
    }
    return new Headers(init)
  } catch {
    // Fallback to empty headers if construction fails
    return new Headers()
  }
}

export function installRequestTracing() {
  // Skip if already installed, SSR, or fetch unavailable
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return
  }

  const globalScope = window as typeof window & { __MAIFARM_REQUEST_TRACING__?: boolean }

  if (globalScope.__MAIFARM_REQUEST_TRACING__) {
    installed = true
    return
  }

  const originalFetch = window.fetch.bind(window)
  installed = true
  globalScope.__MAIFARM_REQUEST_TRACING__ = true

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // If tracing fails for any reason, fall back to original fetch
    // This prevents Safari-specific errors from breaking the app
    try {
      const headerName = getCorrelationHeaderName()
      const incomingRequest = input instanceof Request ? input : null

      // Safely create headers - Safari can throw on certain header values
      const initialHeaders = safeCreateHeaders(
        init?.headers || incomingRequest?.headers || undefined
      )

      const correlationId = ensureCorrelationId(initialHeaders.get(headerName))

      attachCorrelationHeaders(initialHeaders, correlationId)

      // Safely set additional headers
      try {
        initialHeaders.set('X-Client-Timestamp', new Date().toISOString())
        initialHeaders.set('X-Client-Source', 'maifarm-dashboard')
      } catch {
        // Ignore header setting failures
      }

      const finalInit: RequestInit = {
        ...init,
        headers: initialHeaders,
      }

      // Get the URL - Safari requires absolute URLs for Request constructor
      let requestUrl: string
      if (incomingRequest) {
        requestUrl = incomingRequest.url
      } else {
        requestUrl = toAbsoluteUrl(input instanceof URL ? input : (input as string))
      }

      // Use original fetch with modified init instead of creating a new Request
      // This avoids Safari's strict Request constructor validation
      startRequestTrace(init?.method || 'GET', requestUrl, correlationId)

      try {
        const response = await originalFetch(requestUrl, finalInit)
        const serverCorrelation = response.headers.get('x-correlation-id')
        endRequestTrace(correlationId, response.status, undefined, serverCorrelation)
        return response
      } catch (error) {
        endRequestTrace(correlationId, 0, error, null)
        throw error
      }
    } catch (error) {
      // Log but don't block - fall back to original fetch
      console.warn('[MaiFarm][Tracing] Tracing failed, using original fetch:', error)
      return originalFetch(input as RequestInfo, init)
    }
  }
}
