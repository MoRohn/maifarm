/**
 * Lightweight token estimation when a provider-specific tokenizer is not available.
 * Uses heuristic ~4 characters per token for latin text.
 */
export function estimateTokenCount(input: string): number {
  if (!input) {
    return 0;
  }
  // Collapse whitespace similar to tokenizer behaviour
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 0;
  }
  return Math.max(1, Math.ceil(normalized.length / 4));
}

export function estimateMessagesTokenCount(messages: { content: string | { text?: string } | Array<{ text?: string }> }[]): number {
  let total = 0;
  for (const message of messages) {
    if (typeof message.content === 'string') {
      total += estimateTokenCount(message.content);
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (typeof part?.text === 'string') {
          total += estimateTokenCount(part.text);
        }
      }
    } else if (message.content && typeof (message.content as any).text === 'string') {
      total += estimateTokenCount((message.content as any).text);
    }
  }
  return total;
}

