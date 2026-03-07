import { describe, expect, it } from 'vitest';
import { Collection } from './collection';

function makeCollection(): Collection<string, number> {
  const c = new Collection<string, number>();
  c.set('a', 1);
  c.set('b', 2);
  c.set('c', 3);
  return c;
}

describe('Collection', () => {
  it('extends Map', () => {
    const c = new Collection();
    expect(c).toBeInstanceOf(Map);
  });

  describe('find', () => {
    it('returns the first matching value', () => {
      const c = makeCollection();
      expect(c.find((v) => v > 1)).toBe(2);
    });

    it('returns undefined when nothing matches', () => {
      const c = makeCollection();
      expect(c.find((v) => v > 10)).toBeUndefined();
    });

    it('returns undefined on empty collection', () => {
      const c = new Collection<string, number>();
      expect(c.find(() => true)).toBeUndefined();
    });
  });

  describe('filter', () => {
    it('returns a new Collection with matching entries', () => {
      const c = makeCollection();
      const filtered = c.filter((v) => v >= 2);
      expect(filtered).toBeInstanceOf(Collection);
      expect(filtered.size).toBe(2);
      expect(filtered.get('b')).toBe(2);
      expect(filtered.get('c')).toBe(3);
    });

    it('returns empty collection when nothing matches', () => {
      const c = makeCollection();
      const filtered = c.filter((v) => v > 10);
      expect(filtered.size).toBe(0);
    });
  });

  describe('map', () => {
    it('maps values to an array', () => {
      const c = makeCollection();
      const result = c.map((v) => v * 2);
      expect(result).toEqual([2, 4, 6]);
    });

    it('returns empty array for empty collection', () => {
      const c = new Collection<string, number>();
      expect(c.map((v) => v)).toEqual([]);
    });
  });

  describe('first', () => {
    it('returns the first value with no argument', () => {
      const c = makeCollection();
      expect(c.first()).toBe(1);
    });

    it('returns undefined on empty collection', () => {
      const c = new Collection<string, number>();
      expect(c.first()).toBeUndefined();
    });

    it('returns an array of n values', () => {
      const c = makeCollection();
      expect(c.first(2)).toEqual([1, 2]);
    });

    it('returns all values when n exceeds size', () => {
      const c = makeCollection();
      expect(c.first(10)).toEqual([1, 2, 3]);
    });

    it('handles negative n by returning last values', () => {
      const c = makeCollection();
      expect(c.first(-2)).toEqual([2, 3]);
    });
  });

  describe('last', () => {
    it('returns the last value with no argument', () => {
      const c = makeCollection();
      expect(c.last()).toBe(3);
    });

    it('returns undefined on empty collection', () => {
      const c = new Collection<string, number>();
      expect(c.last()).toBeUndefined();
    });

    it('returns an array of the last n values', () => {
      const c = makeCollection();
      expect(c.last(2)).toEqual([2, 3]);
    });

    it('handles negative n by returning first values', () => {
      const c = makeCollection();
      expect(c.last(-2)).toEqual([1, 2]);
    });
  });

  describe('random', () => {
    it('returns undefined on empty collection', () => {
      const c = new Collection<string, number>();
      expect(c.random()).toBeUndefined();
    });

    it('returns a value from the collection', () => {
      const c = makeCollection();
      const val = c.random();
      expect([1, 2, 3]).toContain(val);
    });

    it('returns an array of n values', () => {
      const c = makeCollection();
      const vals = c.random(2);
      expect(vals).toHaveLength(2);
      for (const v of vals) {
        expect([1, 2, 3]).toContain(v);
      }
    });

    it('returns empty array when n requested from empty collection', () => {
      const c = new Collection<string, number>();
      expect(c.random(3)).toEqual([]);
    });
  });

  describe('toArray', () => {
    it('converts values to an array', () => {
      const c = makeCollection();
      expect(c.toArray()).toEqual([1, 2, 3]);
    });

    it('returns empty array for empty collection', () => {
      const c = new Collection<string, number>();
      expect(c.toArray()).toEqual([]);
    });
  });
});
