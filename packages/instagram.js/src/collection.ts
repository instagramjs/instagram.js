/**
 * An extension of Map with utility methods for working with cached data.
 *
 * @example
 * ```ts
 * const col = new Collection<string, number>();
 * col.set('a', 1);
 * col.set('b', 2);
 * col.find((v) => v > 1); // 2
 * col.filter((v) => v > 1); // Collection { 'b' => 2 }
 * col.map((v) => v * 2); // [2, 4]
 * ```
 */
export class Collection<K, V> extends Map<K, V> {
  /** Find the first value matching the predicate. */
  find(fn: (value: V, key: K, collection: this) => boolean): V | undefined {
    for (const [key, value] of this) {
      if (fn(value, key, this)) {
        return value;
      }
    }
    return undefined;
  }

  /** Filter to a new Collection containing only entries matching the predicate. */
  filter(fn: (value: V, key: K, collection: this) => boolean): Collection<K, V> {
    const result = new Collection<K, V>();
    for (const [key, value] of this) {
      if (fn(value, key, this)) {
        result.set(key, value);
      }
    }
    return result;
  }

  /** Map each value to a new array. */
  map<T>(fn: (value: V, key: K, collection: this) => T): T[] {
    const result: T[] = [];
    for (const [key, value] of this) {
      result.push(fn(value, key, this));
    }
    return result;
  }

  /** Get the first value(s). Returns a single value with no argument, or an array of n values. */
  first(): V | undefined;
  first(n: number): V[];
  first(n?: number): V | undefined | V[] {
    if (n === undefined) {
      return this.values().next().value;
    }
    if (n < 0) {
      return this.last(-n);
    }
    const iter = this.values();
    const result: V[] = [];
    for (let i = 0; i < n; i++) {
      const next = iter.next();
      if (next.done) {
        break;
      }
      result.push(next.value);
    }
    return result;
  }

  /** Get the last value(s). Returns a single value with no argument, or an array of n values. */
  last(): V | undefined;
  last(n: number): V[];
  last(n?: number): V | undefined | V[] {
    const arr = [...this.values()];
    if (n === undefined) {
      return arr[arr.length - 1];
    }
    if (n < 0) {
      return this.first(-n);
    }
    return arr.slice(-n);
  }

  /** Get random value(s). Returns a single value with no argument, or an array of n values. */
  random(): V | undefined;
  random(n: number): V[];
  random(n?: number): V | undefined | V[] {
    const arr = [...this.values()];
    if (n === undefined) {
      if (arr.length === 0) {
        return undefined;
      }
      return arr[Math.floor(Math.random() * arr.length)]!;
    }
    const result: V[] = [];
    for (let i = 0; i < n; i++) {
      if (arr.length === 0) {
        break;
      }
      result.push(arr[Math.floor(Math.random() * arr.length)]!);
    }
    return result;
  }

  /** Convert all values to an array. */
  toArray(): V[] {
    return [...this.values()];
  }
}
