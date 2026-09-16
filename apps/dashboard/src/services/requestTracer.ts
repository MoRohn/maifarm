import { logger } from './monitoring/logger'

type TraceRecord = {
  id: string
  method: string
  url: string
  startTime: number
}

const activeTraces = new Map<string, TraceRecord>()
const recentTraces: TraceRecord[] = []
const RECENT_TRACE_LIMIT = 200

const CORRELATION_HEADER = 'X-Correlation-ID'
const REQUEST_HEADER = 'X-Request-ID'

function generateCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function ensureCorrelationId(existing?: string | null): string {
  return existing && existing.length > 0 ? existing : generateCorrelationId()
}

function recordRecentTrace(trace: TraceRecord) {
  recentTraces.push(trace)
  if (recentTraces.length > RECENT_TRACE_LIMIT) {
    recentTraces.shift()
  }
  ;(window as any).__MAIFARM_ACTIVE_TRACES__ = {
    recent: [...recentTraces],
    activeCount: activeTraces.size,
  }
}

export function startRequestTrace(method: string | undefined, url: string | undefined, correlationId: string) {
  if (typeof window === 'undefined') return

  const normalizedMethod = (method || 'GET').toUpperCase()
  const trace: TraceRecord = {
    id: correlationId,
    method: normalizedMethod,
    url: url || 'unknown',
    startTime: performance.now(),
  }

  activeTraces.set(correlationId, trace)
  recordRecentTrace(trace)

  logger.debug('API_TRACE', 'Request started', {
    correlationId,
    method: trace.method,
    url: trace.url,
  })
}

export function endRequestTrace(
  correlationId: string,
  status: number,
  error?: unknown,
  serverCorrelationId?: string | null,
) {
  if (typeof window === 'undefined') return

  const trace = activeTraces.get(correlationId)
  const endTime = performance.now()
  const duration = trace ? endTime - trace.startTime : 0

  activeTraces.delete(correlationId)
  ;(window as any).__MAIFARM_ACTIVE_TRACES__ = {
    recent: [...recentTraces],
    activeCount: activeTraces.size,
  }

  const metadata = {
    correlationId,
    serverCorrelationId: serverCorrelationId && serverCorrelationId !== correlationId ? serverCorrelationId : undefined,
    durationMs: Math.round(duration),
    status,
    method: trace?.method,
    url: trace?.url,
  }

  if (error) {
    logger.error('API_TRACE', 'Request failed', {
      ...metadata,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
    })
    logger.logAPICall(trace?.method ?? 'UNKNOWN', trace?.url ?? 'unknown', status || 0, duration, error)
  } else {
    logger.info('API_TRACE', 'Request completed', metadata)
    logger.logAPICall(trace?.method ?? 'UNKNOWN', trace?.url ?? 'unknown', status, duration)
  }

  if (!error && duration > 5000) {
    console.warn('[MaiFarm][API] Slow request detected', metadata)
  }
}

export function attachCorrelationHeaders(headers: Headers | { set?: (key: string, value: string) => void } | Record<string, any> | undefined, correlationId: string) {
  if (!headers) return

  if (headers instanceof Headers) {
    headers.set(CORRELATION_HEADER, correlationId)
    headers.set(REQUEST_HEADER, correlationId)
    return
  }

  if (typeof (headers as any).set === 'function') {
    ;(headers as any).set(CORRELATION_HEADER, correlationId)
    ;(headers as any).set(REQUEST_HEADER, correlationId)
    return
  }

  const normalisedHeaders = headers as Record<string, any>
  normalisedHeaders[CORRELATION_HEADER] = correlationId
  normalisedHeaders[REQUEST_HEADER] = correlationId
}

export function getCorrelationHeaderName() {
  return CORRELATION_HEADER
}
