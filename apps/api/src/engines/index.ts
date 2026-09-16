import type { EngineAdapter } from './engine-adapter';

export * from './engine-adapter';
export * from './config';

export interface EngineRegistryEntry {
  key: string;
  factory: () => Promise<EngineAdapter> | EngineAdapter;
}

export class EngineRegistry {
  private readonly entries = new Map<string, EngineRegistryEntry>();

  register(entry: EngineRegistryEntry) {
    if (this.entries.has(entry.key)) {
      throw new Error(`Engine with key "${entry.key}" is already registered`);
    }
    this.entries.set(entry.key, entry);
  }

  async resolve(key: string) {
    const entry = this.entries.get(key);
    if (!entry) {
      throw new Error(`Engine "${key}" not registered`);
    }

    const adapter = await entry.factory();
    if (adapter.key !== entry.key) {
      throw new Error(`Engine adapter key mismatch: expected ${entry.key}, got ${adapter.key}`);
    }
    return adapter;
  }

  listKeys(): string[] {
    return Array.from(this.entries.keys());
  }
}

export const engineRegistry = new EngineRegistry();

