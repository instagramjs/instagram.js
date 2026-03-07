import { describe, expect, it } from 'vitest';
import { LruCollection } from './lru-collection';

describe('LruCollection', () => {
  it('stores and retrieves values', () => {
    const lru = new LruCollection<string, number>(3);
    lru.set('a', 1);
    lru.set('b', 2);
    expect(lru.get('a')).toBe(1);
    expect(lru.get('b')).toBe(2);
  });

  it('evicts oldest entry when capacity is exceeded', () => {
    const lru = new LruCollection<string, number>(3);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);
    lru.set('d', 4);

    expect(lru.size).toBe(3);
    expect(lru.has('a')).toBe(false);
    expect(lru.has('b')).toBe(true);
    expect(lru.has('c')).toBe(true);
    expect(lru.has('d')).toBe(true);
  });

  it('promotes accessed entries to most recent', () => {
    const lru = new LruCollection<string, number>(3);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);

    lru.get('a');
    lru.set('d', 4);

    expect(lru.has('a')).toBe(true);
    expect(lru.has('b')).toBe(false);
    expect(lru.has('c')).toBe(true);
    expect(lru.has('d')).toBe(true);
  });

  it('updates existing entry without eviction', () => {
    const lru = new LruCollection<string, number>(3);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);

    lru.set('a', 10);

    expect(lru.size).toBe(3);
    expect(lru.get('a')).toBe(10);
  });

  it('returns undefined for missing keys', () => {
    const lru = new LruCollection<string, number>(3);
    expect(lru.get('missing')).toBeUndefined();
  });

  it('respects maxSize of 1', () => {
    const lru = new LruCollection<string, number>(1);
    lru.set('a', 1);
    lru.set('b', 2);

    expect(lru.size).toBe(1);
    expect(lru.has('a')).toBe(false);
    expect(lru.get('b')).toBe(2);
  });

  it('inherits Collection utility methods', () => {
    const lru = new LruCollection<string, number>(5);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);

    const found = lru.find((v) => v === 2);
    expect(found).toBe(2);

    const filtered = lru.filter((v) => v > 1);
    expect(filtered.size).toBe(2);

    expect(lru.toArray()).toEqual([1, 2, 3]);
  });

  it('eviction order reflects access pattern', () => {
    const lru = new LruCollection<string, number>(3);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);

    lru.get('a');
    lru.get('b');

    lru.set('d', 4);
    expect(lru.has('c')).toBe(false);

    lru.set('e', 5);
    expect(lru.has('a')).toBe(false);
  });
});
