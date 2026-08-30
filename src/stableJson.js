import crypto from 'node:crypto';

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function cloneJson(value, label = 'value') {
  function validateJson(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (Array.isArray(item)) {
      item.forEach(validateJson);
      return;
    }
    if (isPlainObject(item)) {
      Object.values(item).forEach(validateJson);
      return;
    }
    throw new Error(`${label} must contain only JSON values`);
  }
  validateJson(value);
  return JSON.parse(JSON.stringify(value));
}
