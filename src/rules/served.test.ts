import { describe, expect, it } from 'vitest';
import type { ComponentRecord, ComponentType } from '@/types/component';
import { linkRule, type DishLink } from './owned';
import type { RuleRecord } from './record';
import { servedWith } from './served';

const dish = (id: number, componentType: ComponentType, over: Partial<ComponentRecord> = {}): ComponentRecord =>
  ({ id, name: `Dish ${id}`, componentType, dietary_tags: [], regional_tags: [], occasion_tags: [], created_at: '', ...over }) as ComponentRecord;
const serve = (id: number, over: Partial<DishLink>, enabled = true): RuleRecord =>
  ({ ...linkRule({ id, name: `Dish ${id}` }, { mode: 'serve', target: 'base_dish', values: [1], ...over }), id: 100 + id, enabled, created_at: '' }) as RuleRecord;

const idli = dish(1, 'base', { base_category_id: 5 });
const library = [idli, dish(10, 'curry'), dish(11, 'curry'), dish(20, 'subzi'), dish(30, 'extra'), dish(31, 'extra')];
const at = { day: 'monday' as const, meal: 'breakfast' as const };

describe('servedWith', () => {
  it('brings the most firmly served curry and subzi, and every served extra', () => {
    const rules = [
      serve(10, { strength: 'sometimes' }),
      serve(11, { strength: 'always' }),
      serve(20, { target: 'base_category', values: [5] }),
      serve(30, {}),
      serve(31, { strength: 'usually' }),
    ];
    expect(servedWith(idli, at, library, rules)).toEqual({ curry: 11, subzi: 20, extras: [30, 31] });
  });

  it('skips switched-off links, other bases and links limited to other days or meals', () => {
    const rules = [
      serve(10, {}, false),
      serve(11, { values: [2] }),
      serve(20, { scope: { meals: ['dinner'] } }),
      serve(30, { scope: { days: ['monday'], meals: ['breakfast'] } }),
    ];
    expect(servedWith(idli, at, library, rules)).toEqual({ curry: undefined, subzi: undefined, extras: [30] });
  });
});
