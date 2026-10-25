import { db } from '@/db/client';
import type { RuleRecord } from '@/db/client';
import { defaultRules, ownedRuleName, type OwnedRuleChanges, type OwnedTemplate } from '@/rules';
import type { ComponentRecord, ComponentType } from '@/types/component';
import type { MealRecord } from '@/types/meal';

// ─── Component CRUD ───────────────────────────────────────────────────────────

export async function getAllComponents(): Promise<ComponentRecord[]> {
  return db.components.toArray();
}

export async function getComponentsByType(type: ComponentType): Promise<ComponentRecord[]> {
  return db.components.where('componentType').equals(type).toArray();
}

export async function addComponent(component: Omit<ComponentRecord, 'id'>): Promise<number> {
  const record = {
    ...component,
    created_at: component.created_at || new Date().toISOString(),
  };
  return db.components.add(record as ComponentRecord) as Promise<number>;
}

export async function updateComponent(id: number, changes: Partial<ComponentRecord>): Promise<void> {
  await db.transaction('rw', db.components, db.rules, async () => {
    await db.components.update(id, changes);
    if (changes.name !== undefined) {
      const name = changes.name;
      await db.rules.where('owner_component_id').equals(id).modify((rule) => {
        rule.name = ownedRuleName(rule.spec.template, name);
      });
    }
  });
}

/** Deleting a component also deletes the rules it owns. */
export async function deleteComponent(id: number): Promise<void> {
  await db.transaction('rw', db.components, db.rules, async () => {
    await db.rules.where('owner_component_id').equals(id).delete();
    await db.components.delete(id);
  });
}

// ─── Owned rules (base pairing, curry clash, specific days) ───────────────────

export type { OwnedRuleChanges };

export async function getOwnedRules(componentId?: number): Promise<RuleRecord[]> {
  const owned = db.rules.where('owner_component_id');
  return (componentId === undefined ? owned.above(0) : owned.equals(componentId)).toArray();
}

/** The rule of one type a component owns; each component owns at most one per type. */
export async function getOwnedRule(componentId: number, template: OwnedTemplate): Promise<RuleRecord | undefined> {
  return (await getOwnedRules(componentId)).find((r) => r.spec.template === template);
}

/** Add or update a component together with the rules it owns. Rule types left out are not touched. */
export async function saveComponent(
  id: number | undefined,
  component: Omit<ComponentRecord, 'id'>,
  owned: OwnedRuleChanges = {},
): Promise<number> {
  return db.transaction('rw', db.components, db.rules, async () => {
    const componentId = id ?? ((await db.components.add(component as ComponentRecord)) as number);
    if (id !== undefined) await db.components.update(id, component);
    const existing = await getOwnedRules(componentId);
    for (const [template, build] of Object.entries(owned) as [OwnedTemplate, OwnedRuleChanges[OwnedTemplate]][]) {
      if (build === undefined) continue;
      const current = existing.find((r) => r.spec.template === template);
      if (build === null) {
        if (current) await db.rules.delete(current.id);
        continue;
      }
      const rule = build({ id: componentId, name: component.name });
      if (current) await db.rules.update(current.id, rule);
      else await db.rules.add({ ...rule, enabled: true, created_at: new Date().toISOString() } as RuleRecord);
    }
    return componentId;
  });
}

// ─── Meal CRUD ────────────────────────────────────────────────────────────────

export async function getAllMeals(): Promise<MealRecord[]> {
  return db.meals.toArray();
}

export async function addMeal(
  meal: Omit<MealRecord, 'id'>,
  extraIds: number[],
): Promise<number> {
  return db.transaction('rw', db.meals, db.meal_extras, async () => {
    const mealRecord = {
      ...meal,
      created_at: meal.created_at || new Date().toISOString(),
    };
    const mealId = (await db.meals.add(mealRecord as MealRecord)) as number;
    if (extraIds.length > 0) {
      await db.meal_extras.bulkAdd(
        extraIds.map(eid => ({ meal_id: mealId, component_id: eid })),
      );
    }
    return mealId;
  });
}

export async function deleteMeal(id: number): Promise<void> {
  await db.transaction('rw', db.meals, db.meal_extras, async () => {
    await db.meal_extras.where('meal_id').equals(id).delete();
    await db.meals.delete(id);
  });
}

export async function getMealExtras(mealId: number): Promise<ComponentRecord[]> {
  const junctionRows = await db.meal_extras.where('meal_id').equals(mealId).toArray();
  const componentIds = junctionRows.map(row => row.component_id);
  if (componentIds.length === 0) return [];
  const components = await db.components.bulkGet(componentIds);
  return components.filter((c): c is ComponentRecord => c !== undefined);
}

// ─── Rule CRUD ────────────────────────────────────────────────────────────────

export async function getRules(): Promise<RuleRecord[]> {
  return db.rules.toArray();
}

export async function addRule(rule: Omit<RuleRecord, 'id'>): Promise<number> {
  return db.rules.add(rule as RuleRecord) as Promise<number>;
}

export async function updateRule(id: number, changes: Partial<RuleRecord>): Promise<void> {
  await db.rules.update(id, changes);
}

export async function deleteRule(id: number): Promise<void> {
  await db.rules.delete(id);
}

/**
 * Add back the default rules that are missing, by key. Defaults that are still stored, edited or
 * switched off, are left as they are. Returns how many were added.
 */
export async function restoreDefaultRules(): Promise<number> {
  return db.transaction('rw', db.rules, async () => {
    const have = new Set((await db.rules.toArray()).map((r) => r.default_key).filter(Boolean));
    const missing = defaultRules().filter((r) => !have.has(r.default_key));
    const created_at = new Date().toISOString();
    await db.rules.bulkAdd(missing.map((r) => ({ ...r, enabled: true, created_at })) as RuleRecord[]);
    return missing.length;
  });
}
