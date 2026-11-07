// Merging duplicate categories and dishes (a library seeded twice holds two of each). The lowest id is kept;
// everything that pointed at a removed copy is pointed at the kept one instead.
import type { PlanSlot } from '@/types/plan';

export interface IdMaps {
  component: Map<number, number>;
  baseCategory: Map<number, number>;
  extraCategory: Map<number, number>;
}

/** Removed id → kept id, for rows that share a key; the lowest id in each group is kept. */
export function duplicateIds<T extends { id: number }>(rows: readonly T[], key: (row: T) => string): Map<number, number> {
  const kept = new Map<string, number>();
  const out = new Map<number, number>();
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    const k = key(row);
    const keep = kept.get(k);
    if (keep === undefined) kept.set(k, row.id);
    else out.set(row.id, keep);
  }
  return out;
}

const remapIds = (value: unknown, map: Map<number, number>): unknown => {
  if (typeof value === 'number') return map.get(value) ?? value;
  if (Array.isArray(value)) return [...new Set(value.map((v) => (typeof v === 'number' ? map.get(v) ?? v : v)))];
  return value;
};

// Matcher leaves name an id by field; template params name ids in these lists.
const LEAF_MAP = { id: 'component', base_category_id: 'baseCategory', extra_category_id: 'extraCategory' } as const;
const LIST_MAP = { components: 'component', baseCategories: 'baseCategory', extraCategories: 'extraCategory' } as const;

/** A copy of a rule spec with every dish and category id it names mapped through `maps`. */
export function remapSpec<T>(spec: T, maps: IdMaps): T {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const obj = node as Record<string, unknown>;
    const leafKind = typeof obj.field === 'string' ? LEAF_MAP[obj.field as keyof typeof LEAF_MAP] : undefined;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const listKind = LIST_MAP[k as keyof typeof LIST_MAP];
      if (leafKind && k === 'value') out[k] = remapIds(v, maps[leafKind]);
      else if (listKind) out[k] = remapIds(v, maps[listKind]);
      else out[k] = walk(v);
    }
    return out;
  };
  return walk(spec) as T;
}

/** A copy of plan slots with every dish id mapped through `map`. */
export function remapSlots(slots: readonly PlanSlot[], map: Map<number, number>): PlanSlot[] {
  const one = (id: number | undefined) => (id === undefined ? id : map.get(id) ?? id);
  return slots.map((s) => ({
    ...s,
    base_id: one(s.base_id)!,
    ...(s.curry_id !== undefined ? { curry_id: one(s.curry_id) } : {}),
    ...(s.subzi_id !== undefined ? { subzi_id: one(s.subzi_id) } : {}),
    extra_ids: [...new Set(s.extra_ids.map((id) => one(id)!))],
  }));
}
