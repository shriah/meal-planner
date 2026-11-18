import { db } from '@/db/client';
import { CONVERTED_PARTS, CONVERTED_TAG_GROUP_KEYS, CONVERTED_TAG_GROUPS, type ConvertLookup } from '@/db/parts';
import type { CurryCategory } from '@/types/component';
import type { PartRecord } from '@/types/part';
import type { TagGroupRecord } from '@/types/tags';

const byPosition = <T extends { position: number }>(rows: T[]) => [...rows].sort((a, b) => a.position - b.position);

/**
 * The library's parts and tag groups, matched by their converted names (Base, Curry, Subzi, Extras; Dietary,
 * Protein, Region, Occasion). Any that is missing is created; everything stored is returned, sorted by position.
 * Reads then one bulk add per table, so it runs inside a caller's transaction (which must include `db.parts`
 * and `db.tag_groups`).
 */
export async function ensurePartsAndTagGroups(): Promise<{ parts: PartRecord[]; tagGroups: TagGroupRecord[] }> {
  const created_at = new Date().toISOString();
  const parts = await db.parts.toArray();
  const storedPartNames = new Set(parts.map((p) => p.name));
  const newParts = Object.values(CONVERTED_PARTS).filter((p) => !storedPartNames.has(p.name)).map((p) => ({ ...p, created_at }));
  const partIds = await db.parts.bulkAdd(newParts as PartRecord[], { allKeys: true });
  newParts.forEach((r, i) => parts.push({ ...r, id: Number(partIds[i]) }));

  const tagGroups = await db.tag_groups.toArray();
  const storedGroupNames = new Set(tagGroups.map((g) => g.name));
  const newGroups = CONVERTED_TAG_GROUP_KEYS.filter((k) => !storedGroupNames.has(CONVERTED_TAG_GROUPS[k].name)).map((k) => {
    const { name, position, multiple, values } = CONVERTED_TAG_GROUPS[k];
    return { name, position, multiple, values: values.map((v, i) => ({ id: i + 1, name: v })), created_at };
  });
  const groupIds = await db.tag_groups.bulkAdd(newGroups as TagGroupRecord[], { allKeys: true });
  newGroups.forEach((r, i) => tagGroups.push({ ...r, id: Number(groupIds[i]) }));
  return { parts: byPosition(parts), tagGroups: byPosition(tagGroups) };
}

/**
 * The lookup `convertDish` needs, built from stored data and matched by name. Parts and tag groups missing from the
 * library are created (so this runs inside a transaction that includes `db.parts`, `db.tag_groups` and `db.categories`).
 */
export async function loadConvertLookup(): Promise<ConvertLookup> {
  const { parts, tagGroups } = await ensurePartsAndTagGroups();
  const categories = await db.categories.toArray();
  const partTypes = Object.keys(CONVERTED_PARTS) as (keyof typeof CONVERTED_PARTS)[];
  const groupOf = (k: (typeof CONVERTED_TAG_GROUP_KEYS)[number]) => tagGroups.find((g) => g.name === CONVERTED_TAG_GROUPS[k].name)!;
  return {
    parts: Object.fromEntries(partTypes.map((t) => [t, parts.find((p) => p.name === CONVERTED_PARTS[t].name)!.id])) as ConvertLookup['parts'],
    curryCategory: new Map(categories.filter((c) => c.kind === 'curry').map((c) => [c.name as CurryCategory, c.id])),
    knownCategories: new Set(categories.map((c) => c.id)),
    tagGroups: Object.fromEntries(
      CONVERTED_TAG_GROUP_KEYS.map((k) => [k, { id: groupOf(k).id, valueId: new Map(groupOf(k).values.map((v) => [v.name, v.id])) }]),
    ) as ConvertLookup['tagGroups'],
  };
}
