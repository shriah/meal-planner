// Merging duplicate categories and dishes (a library seeded twice holds two of each). The lowest id is kept;
// everything that pointed at a removed copy is pointed at the kept one instead.
import type { PlanSlot } from '@/types/plan';

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
