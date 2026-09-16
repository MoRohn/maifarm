export interface SettingsMap {
  [key: string]: unknown;
}

class SettingsService {
  private readonly baseUrl = '/api/settings';

  private parseValue(value: unknown) {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }

  async getAll(): Promise<SettingsMap> {
    const response = await fetch(this.baseUrl);
    if (!response.ok) {
      throw new Error(`Failed to load settings: ${response.status}`);
    }

    const payload = await response.json();
    const rawSettings: Record<string, unknown> = payload?.settings || {};
    const parsed: SettingsMap = {};

    Object.entries(rawSettings).forEach(([key, value]) => {
      parsed[key] = this.parseValue(value);
    });

    return parsed;
  }

  async update(key: string, value: unknown): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to update setting '${key}': ${response.status} ${text}`);
    }
  }
}

export const settingsService = new SettingsService();
