import { db } from '@/db/client';
import { CONVERTED_PARTS, CONVERTED_TAG_GROUP_KEYS, CONVERTED_TAG_GROUPS, legacyPartIds, type ConvertLookup } from '@/db/parts';
import type { ComponentType, CurryCategory } from '@/types/component';
import type { PartRecord } from '@/types/part';
import type { TagGroupRecord } from '@/types/tags';

const partTypes = Object.keys(CONVERTED_PARTS) as ComponentType[];

const byPosition = <T extends { position: number }>(rows: T[]) => [...rows].sort((a, b) => a.position - b.position);

/**
 * The library's parts and tag groups, matched by `legacy`, not by name (the converted parts and groups can be renamed). Any that is missing is created; everything stored is returned, sorted by position.
 * Reads then one bulk add per table, so it runs inside a caller's transaction (which must include `db.parts`
 * and `db.tag_groups`).
 */
export async function ensurePartsAndTagGroups(): Promise<{ parts: PartRecord[]; tagGroups: TagGroupRecord[] }> {
  const created_at = new Date().toISOString();
  const parts = await db.parts.toArray();
  const storedPartTypes = new Set(parts.map((p) => p.legacy));
  const newParts = partTypes.filter((t) => !storedPartTypes.has(t)).map((t) => ({ ...CONVERTED_PARTS[t], legacy: t, created_at }));
  const partIds = await db.parts.bulkAdd(newParts as PartRecord[], { allKeys: true });
  newParts.forEach((r, i) => parts.push({ ...r, id: Number(partIds[i]) }));

  const tagGroups = await db.tag_groups.toArray();
  const storedGroupKeys = new Set(tagGroups.map((g) => g.legacy));
  const newGroups = CONVERTED_TAG_GROUP_KEYS.filter((k) => !storedGroupKeys.has(k)).map((k) => {
    const { name, position, multiple, values } = CONVERTED_TAG_GROUPS[k];
    return { name, position, multiple, values: values.map((v, i) => ({ id: i + 1, name: v })), legacy: k, created_at };
  });
  const groupIds = await db.tag_groups.bulkAdd(newGroups as TagGroupRecord[], { allKeys: true });
  newGroups.forEach((r, i) => tagGroups.push({ ...r, id: Number(groupIds[i]) }));
  return { parts: byPosition(parts), tagGroups: byPosition(tagGroups) };
}

/**
 * The lookup `convertDish` needs, built from stored data and matched by `legacy`. Parts and tag groups missing from the
 * library are created (so this runs inside a transaction that includes `db.parts`, `db.tag_groups` and `db.categories`).
 */
export async function loadConvertLookup(): Promise<ConvertLookup> {
  const { parts, tagGroups } = await ensurePartsAndTagGroups();
  const categories = await db.categories.toArray();
  const groupOf = (k: (typeof CONVERTED_TAG_GROUP_KEYS)[number]) => tagGroups.find((g) => g.legacy === k)!;
  return {
    parts: legacyPartIds(parts),
    curryCategory: new Map(categories.filter((c) => c.kind === 'curry').map((c) => [c.name as CurryCategory, c.id])),
    knownCategories: new Set(categories.map((c) => c.id)),
    tagGroups: Object.fromEntries(
      CONVERTED_TAG_GROUP_KEYS.map((k) => [k, { id: groupOf(k).id, valueId: new Map(groupOf(k).values.map((v) => [v.name, v.id])) }]),
    ) as ConvertLookup['tagGroups'],
  };
}
