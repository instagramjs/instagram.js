import { ValidationError } from './errors';

/**
 * Convert a binary string to its decimal string representation.
 * Uses iterative long division because the values exceed JavaScript's safe integer range.
 */
export function binaryToDecimal(binary: string): string {
  if (!binary.includes('1')) {
    return '0';
  }
  let result = '';
  let remaining = binary;
  while (remaining !== '0') {
    let carry = 0;
    let quotient = '';
    for (let i = 0; i < remaining.length; i++) {
      carry = 2 * carry + parseInt(remaining[i]!, 10);
      if (carry >= 10) {
        quotient += '1';
        carry -= 10;
      } else {
        quotient += '0';
      }
    }
    result = carry.toString() + result;
    remaining = quotient.slice(quotient.indexOf('1'));
    if (remaining === '') {
      remaining = '0';
    }
  }
  return result;
}

/**
 * Generate a 63-bit offline threading ID from a timestamp and random bits.
 * Used for message deduplication and ordering.
 */
export function generateOfflineThreadingId(timestamp?: number): string {
  const ts = timestamp != null ? timestamp : Date.now();
  const random = Math.floor(Math.random() * 4294967296);
  const randomBits = ('0000000000000000000000' + random.toString(2)).slice(-22);
  const combined = ts.toString(2) + randomBits;
  const bits63 = combined.slice(-63);
  return binaryToDecimal(bits63);
}

/**
 * Generate a sprinkle token from a CSRF token.
 * Sums character codes of the token and optionally prepends a version number.
 */
export function generateSprinkleToken(
  csrfToken: string,
  version: number,
  shouldRandomize: boolean,
): string {
  let sum = 0;
  for (let i = 0; i < csrfToken.length; i++) {
    sum += csrfToken.charCodeAt(i);
  }
  const sumStr = sum.toString();
  if (shouldRandomize) {
    return sumStr;
  }
  return version + sumStr;
}

/** Parse a raw cookie header string into a key-value record. */
export function parseCookies(cookieString: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  const pairs = cookieString.split(';');
  for (const pair of pairs) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }
    const key = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();
    if (key) {
      cookies[key] = value;
    }
  }
  return cookies;
}

/** Generate a unique mutation token using crypto.randomUUID(). */
export function generateMutationToken(): string {
  return crypto.randomUUID();
}

/** Type guard: checks if a value is a non-null object (record). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Exhaustiveness check for discriminated unions. */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

/** Define a non-enumerable property on an object. */
export function defineHiddenProperty<T>(obj: object, key: string, value: T): void {
  Object.defineProperty(obj, key, {
    value,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/** Throw ValidationError if value is not a non-empty string. */
export function requireNonEmpty(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${name} must be a non-empty string`);
  }
}

/** Throw ValidationError if value is not a non-empty array. */
export function requireNonEmptyArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError(`${name} must be a non-empty array`);
  }
}

/** Extract a string from a record, returning fallback if missing or wrong type. */
export function getString(obj: Record<string, unknown>, key: string, fallback = ''): string {
  const val = obj[key];
  return typeof val === 'string' ? val : fallback;
}

/** Extract a number from a record, returning fallback if missing or wrong type. */
export function getNumber(obj: Record<string, unknown>, key: string, fallback = 0): number {
  const val = obj[key];
  return typeof val === 'number' ? val : fallback;
}

/** Extract an array from a record, returning [] if missing or wrong type. */
export function getArray<T>(obj: Record<string, unknown>, key: string): T[] {
  const val = obj[key];
  return Array.isArray(val) ? (val as T[]) : [];
}
