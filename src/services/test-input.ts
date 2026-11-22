// Planning input for tests: the converted parts (ids 1 to 4) and each dish placed in the part of its type.
import { CONVERTED_PARTS, legacyPartIds } from '@/db/parts';
import { capRules, type RuleRecord } from '@/rules';
import type { ComponentRecord, ComponentType } from '@/types/component';
import type { PartRecord } from '@/types/part';
import type { PlanningInput } from './plan-generation';

const LEGACY_TYPES = Object.keys(CONVERTED_PARTS) as ComponentType[];

export const TEST_PART_RECORDS: PartRecord[] = Object.values(CONVERTED_PARTS).map((p, i) => ({ ...p, id: i + 1, legacy: LEGACY_TYPES[i], created_at: '' }));

const partOf = legacyPartIds(TEST_PART_RECORDS);

/** The input with the test parts, and every dish without a `part_id` given the part of its type. */
export function withParts<T extends Omit<PlanningInput, 'parts'>>(input: T): T & { parts: PartRecord[] } {
  const library = input.library.map((c: ComponentRecord) => (c.part_id === undefined ? { ...c, part_id: partOf[c.componentType] } : c));
  return { ...input, library, parts: TEST_PART_RECORDS };
}

/** The stored curry and subzi caps every library has (`capRules()`), with ids from `firstId`. */
export const capRecords = (firstId = 100): RuleRecord[] =>
  capRules().map((r, i) => ({ ...r, id: firstId + i, enabled: true, created_at: '' }));
