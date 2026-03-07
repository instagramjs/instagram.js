import { describe, expectTypeOf, it } from 'vitest';
import { Collection } from './collection';

describe('Collection generics', () => {
  it('preserves key and value types', () => {
    const col = new Collection<string, number>();
    expectTypeOf(col.get('a')).toEqualTypeOf<number | undefined>();
    expectTypeOf(col.set('a', 1)).toEqualTypeOf<Collection<string, number>>();
  });

  it('find returns V or undefined', () => {
    const col = new Collection<string, number>();
    expectTypeOf(col.find((v) => v > 0)).toEqualTypeOf<number | undefined>();
  });

  it('filter returns a new Collection with same types', () => {
    const col = new Collection<string, number>();
    expectTypeOf(col.filter((v) => v > 0)).toEqualTypeOf<Collection<string, number>>();
  });

  it('map transforms value type', () => {
    const col = new Collection<string, number>();
    expectTypeOf(col.map((v) => String(v))).toEqualTypeOf<string[]>();
  });

  it('first returns V or undefined without argument', () => {
    const col = new Collection<string, number>();
    expectTypeOf(col.first()).toEqualTypeOf<number | undefined>();
  });

  it('first returns V[] with numeric argument', () => {
    const col = new Collection<string, number>();
    expectTypeOf(col.first(3)).toEqualTypeOf<number[]>();
  });

  it('toArray returns V[]', () => {
    const col = new Collection<string, number>();
    expectTypeOf(col.toArray()).toEqualTypeOf<number[]>();
  });
});
