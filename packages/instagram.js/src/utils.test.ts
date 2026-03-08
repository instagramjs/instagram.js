import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from './errors';
import {
  binaryToDecimal,
  defineHiddenProperty,
  generateMutationToken,
  generateOfflineThreadingId,
  generateSprinkleToken,
  getArray,
  getNumber,
  getString,
  parseCookies,
  requireNonEmpty,
  requireNonEmptyArray,
} from './utils';

describe('binaryToDecimal', () => {
  it('converts simple binary strings', () => {
    expect(binaryToDecimal('0')).toBe('0');
    expect(binaryToDecimal('1')).toBe('1');
    expect(binaryToDecimal('10')).toBe('2');
    expect(binaryToDecimal('1010')).toBe('10');
    expect(binaryToDecimal('11111111')).toBe('255');
  });

  it('handles large binary values beyond safe integer range', () => {
    // 2^62 = 4611686018427387904
    const binary62 = '1' + '0'.repeat(62);
    expect(binaryToDecimal(binary62)).toBe('4611686018427387904');
  });

  it('handles 63-bit values', () => {
    // All ones: 2^63 - 1 = 9223372036854775807
    const allOnes = '1'.repeat(63);
    expect(binaryToDecimal(allOnes)).toBe('9223372036854775807');
  });
});

describe('generateOfflineThreadingId', () => {
  it('returns a numeric string', () => {
    const id = generateOfflineThreadingId();
    expect(id).toMatch(/^\d+$/);
  });

  it('produces deterministic output with fixed timestamp and mocked random', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const id = generateOfflineThreadingId(1700000000000);
    expect(id).toMatch(/^\d+$/);
    // With random = 0, the 22 random bits are all zeros
    // ts binary: 11000101111001101010110010101000011100000000
    // combined with 22 zero bits, take rightmost 63 bits
    expect(BigInt(id)).toBeGreaterThan(0n);
    vi.restoreAllMocks();
  });

  it('generates unique IDs for different timestamps', () => {
    const id1 = generateOfflineThreadingId(1700000000000);
    const id2 = generateOfflineThreadingId(1700000000001);
    expect(id1).not.toBe(id2);
  });
});

describe('generateSprinkleToken', () => {
  it('sums character codes and prepends version', () => {
    // 'abc' = 97 + 98 + 99 = 294
    const result = generateSprinkleToken('abc', 2, false);
    expect(result).toBe('2294');
  });

  it('returns just the sum when shouldRandomize is true', () => {
    const result = generateSprinkleToken('abc', 2, true);
    expect(result).toBe('294');
  });

  it('handles empty string', () => {
    const result = generateSprinkleToken('', 1, false);
    expect(result).toBe('10');
  });
});

describe('parseCookies', () => {
  it('parses a standard cookie string', () => {
    const cookies = parseCookies('sessionid=abc123; csrftoken=xyz789; ds_user_id=12345');
    expect(cookies).toEqual({
      sessionid: 'abc123',
      csrftoken: 'xyz789',
      ds_user_id: '12345',
    });
  });

  it('handles extra whitespace', () => {
    const cookies = parseCookies('  key1=val1 ;  key2=val2  ');
    expect(cookies).toEqual({ key1: 'val1', key2: 'val2' });
  });

  it('handles values with equals signs', () => {
    const cookies = parseCookies('token=abc=def=ghi');
    expect(cookies).toEqual({ token: 'abc=def=ghi' });
  });

  it('returns empty object for empty string', () => {
    expect(parseCookies('')).toEqual({});
  });

  it('skips malformed entries without =', () => {
    const cookies = parseCookies('good=value; badentry; another=ok');
    expect(cookies).toEqual({ good: 'value', another: 'ok' });
  });
});

describe('generateMutationToken', () => {
  it('returns a UUID string', () => {
    const token = generateMutationToken();
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates unique tokens', () => {
    const a = generateMutationToken();
    const b = generateMutationToken();
    expect(a).not.toBe(b);
  });
});

describe('defineHiddenProperty', () => {
  it('sets a non-enumerable property', () => {
    const obj: Record<string, unknown> = { visible: true };
    defineHiddenProperty(obj, 'hidden', 42);

    expect(obj['hidden']).toBe(42);
    expect(Object.keys(obj)).toEqual(['visible']);
  });

  it('sets a writable and configurable property', () => {
    const obj: Record<string, unknown> = {};
    defineHiddenProperty(obj, 'key', 'initial');

    obj['key'] = 'changed';
    expect(obj['key']).toBe('changed');

    delete obj['key'];
    expect(obj['key']).toBeUndefined();
  });
});

describe('requireNonEmpty', () => {
  it('passes for non-empty strings', () => {
    expect(() => requireNonEmpty('hello', 'field')).not.toThrow();
  });

  it.each([
    ['empty string', '', 'field'],
    ['number', 42, 'field'],
    ['null', null, 'field'],
    ['undefined', undefined, 'field'],
  ])('throws ValidationError for %s', (_label, value, name) => {
    expect(() => requireNonEmpty(value, name)).toThrow(ValidationError);
  });

  it('includes field name in error message', () => {
    expect(() => requireNonEmpty('', 'threadId')).toThrow('threadId must be a non-empty string');
  });
});

describe('requireNonEmptyArray', () => {
  it('passes for non-empty arrays', () => {
    expect(() => requireNonEmptyArray(['a'], 'ids')).not.toThrow();
  });

  it.each([
    ['empty array', []],
    ['string', 'abc'],
    ['null', null],
    ['undefined', undefined],
  ])('throws ValidationError for %s', (_label, value) => {
    expect(() => requireNonEmptyArray(value, 'ids')).toThrow(ValidationError);
  });

  it('includes field name in error message', () => {
    expect(() => requireNonEmptyArray([], 'userIds')).toThrow('userIds must be a non-empty array');
  });
});

describe('getString', () => {
  it('returns the string value when present', () => {
    expect(getString({ key: 'hello' }, 'key')).toBe('hello');
  });

  it('returns fallback for missing keys', () => {
    expect(getString({}, 'key')).toBe('');
    expect(getString({}, 'key', 'fallback')).toBe('fallback');
  });

  it('returns fallback for non-string values', () => {
    expect(getString({ key: 42 }, 'key')).toBe('');
    expect(getString({ key: null }, 'key', 'fb')).toBe('fb');
  });
});

describe('getNumber', () => {
  it('returns the number value when present', () => {
    expect(getNumber({ key: 42 }, 'key')).toBe(42);
  });

  it('returns fallback for missing keys', () => {
    expect(getNumber({}, 'key')).toBe(0);
    expect(getNumber({}, 'key', -1)).toBe(-1);
  });

  it('returns fallback for non-number values', () => {
    expect(getNumber({ key: 'abc' }, 'key')).toBe(0);
  });
});

describe('getArray', () => {
  it('returns the array when present', () => {
    expect(getArray({ key: [1, 2, 3] }, 'key')).toEqual([1, 2, 3]);
  });

  it('returns empty array for missing keys', () => {
    expect(getArray({}, 'key')).toEqual([]);
  });

  it('returns empty array for non-array values', () => {
    expect(getArray({ key: 'abc' }, 'key')).toEqual([]);
    expect(getArray({ key: null }, 'key')).toEqual([]);
  });
});
