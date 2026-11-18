import { db } from '@/db/client';
import { CONVERTED_PARTS, CONVERTED_TAG_GROUP_KEYS, CONVERTED_TAG_GROUPS } from '@/db/parts';
import type { PartRecord } from '@/types/part';
import type { TagGroupRecord } from '@/types/tags';

const byPosition = <T extends { position: number }>(rows: T[]) => [...rows].sort((a, b) => a.position - b.position);

/**
 * The library's parts and tag groups. A table that is empty gets today's four parts / four tag groups;
 * a table that has rows is returned as stored. Reads then one bulk add per table, so it runs inside a
 * caller's transaction (which must include `db.parts` and `db.tag_groups`).
 */
export async function ensurePartsAndTagGroups(): Promise<{ parts: PartRecord[]; tagGroups: TagGroupRecord[] }> {
  const created_at = new Date().toISOString();
  let parts = await db.parts.toArray();
  if (parts.length === 0) {
    const rows = Object.values(CONVERTED_PARTS).map((p) => ({ ...p, created_at }));
    const ids = await db.parts.bulkAdd(rows as PartRecord[], { allKeys: true });
    parts = rows.map((r, i) => ({ ...r, id: Number(ids[i]) }));
  }
  let tagGroups = await db.tag_groups.toArray();
  if (tagGroups.length === 0) {
    const rows = CONVERTED_TAG_GROUP_KEYS.map((k) => {
      const { name, position, multiple, values } = CONVERTED_TAG_GROUPS[k];
      return { name, position, multiple, values: values.map((v, i) => ({ id: i + 1, name: v })), created_at };
    });
    const ids = await db.tag_groups.bulkAdd(rows as TagGroupRecord[], { allKeys: true });
    tagGroups = rows.map((r, i) => ({ ...r, id: Number(ids[i]) }));
  }
  return { parts: byPosition(parts), tagGroups: byPosition(tagGroups) };
}
