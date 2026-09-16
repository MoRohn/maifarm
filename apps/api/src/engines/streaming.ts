const decoder = new TextDecoder();

export interface SSEEvent {
  event?: string;
  data: string;
}

/**
 * Convert a fetch Response body into an async iterator of SSE events.
 */
export async function* parseSSE(response: Response): AsyncGenerator<SSEEvent> {
  if (!response.body) {
    throw new Error('Response body is not readable');
  }

  const reader = response.body.getReader();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.trim().length > 0) {
        yield* flushBuffer(buffer);
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      yield* flushBuffer(chunk);
      boundary = buffer.indexOf('\n\n');
    }
  }
}

async function* flushBuffer(block: string): AsyncGenerator<SSEEvent> {
  if (!block.trim()) {
    return;
  }

  let event: SSEEvent = { data: '' };

  for (const line of block.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith('event:')) {
      event.event = trimmed.slice(6).trim();
    } else if (trimmed.startsWith('data:')) {
      const data = trimmed.slice(5).trim();
      event.data = event.data ? `${event.data}\n${data}` : data;
    }
  }

  if (event.data !== undefined) {
    yield event;
  }
}

