import { Collection } from './collection';

/**
 * A Collection with a maximum size. Evicts the least recently used entry
 * when the capacity is exceeded. Accessing an entry via get() promotes
 * it to the most recently used position.
 *
 * @example
 * ```ts
 * const cache = new LruCollection<string, number>(2);
 * cache.set('a', 1);
 * cache.set('b', 2);
 * cache.set('c', 3); // evicts 'a'
 * cache.has('a'); // false
 * ```
 */
export class LruCollection<K, V> extends Collection<K, V> {
  readonly maxSize: number;

  constructor(maxSize: number) {
    super();
    this.maxSize = maxSize;
  }

  override get(key: K): V | undefined {
    if (!super.has(key)) {
      return undefined;
    }
    const value = super.get(key)!;
    super.delete(key);
    super.set(key, value);
    return value;
  }

  override set(key: K, value: V): this {
    if (super.has(key)) {
      super.delete(key);
    }
    super.set(key, value);
    while (this.size > this.maxSize) {
      const oldest = this.keys().next().value;
      if (oldest !== undefined) {
        super.delete(oldest);
      }
    }
    return this;
  }
}
