export type Mergeable = Record<string, any> | any[];

function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => (isObject(item) ? clone(item) : item)) as T;
  }
  if (isObject(value)) {
    const result: Record<string, any> = {};
    Object.entries(value).forEach(([key, val]) => {
      result[key] = isObject(val) || Array.isArray(val) ? clone(val) : val;
    });
    return result as T;
  }
  return value;
}

export function deepMerge<T extends Mergeable>(target: T, source: Partial<T>): T {
  if (Array.isArray(source)) {
    return clone(source as T);
  }

  if (!isObject(source)) {
    return clone(source as T) ?? clone(target);
  }

  const base = isObject(target) ? { ...target } : {};

  Object.entries(source).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      (base as any)[key] = clone(value);
      return;
    }

    if (isObject(value)) {
      const current = (base as any)[key];
      (base as any)[key] = deepMerge(isObject(current) ? current : {}, value);
      return;
    }

    (base as any)[key] = value;
  });

  return base as T;
}

export function mergeWithDefaults<T extends Mergeable>(defaults: T, override?: Partial<T>): T {
  if (!override) {
    return clone(defaults);
  }
  return deepMerge(defaults, override);
}
