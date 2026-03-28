import { db } from '@/db/client';
import type { RuleRecord } from '@/db/client';
import type { ComponentRecord, ComponentType, BaseType } from '@/types/component';
import type { MealRecord } from '@/types/meal';
import type { UserPreferencesRecord } from '@/types/preferences';

// ─── Component CRUD ───────────────────────────────────────────────────────────

export async function getAllComponents(): Promise<ComponentRecord[]> {
  return db.components.toArray();
}

export async function getComponentsByType(type: ComponentType): Promise<ComponentRecord[]> {
  return db.components.where('componentType').equals(type).toArray();
}

export async function getExtrasByBaseType(baseType: BaseType | number): Promise<ComponentRecord[]> {
  const extras = await db.components.where('componentType').equals('extra').toArray();
  if (typeof baseType === 'number') {
    return extras.filter((extra) => (extra.compatible_base_category_ids ?? []).includes(baseType));
  }

  return extras.filter((extra) => (extra.compatible_base_types ?? []).includes(baseType));
}

export async function addComponent(component: Omit<ComponentRecord, 'id'>): Promise<number> {
  const record = {
    ...component,
    created_at: component.created_at || new Date().toISOString(),
  };
  return db.components.add(record as ComponentRecord) as Promise<number>;
}

export async function updateComponent(id: number, changes: Partial<ComponentRecord>): Promise<void> {
  await db.components.update(id, changes);
}

export async function deleteComponent(id: number): Promise<void> {
  await db.components.delete(id);
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

// ─── Preferences ─────────────────────────────────────────────────────────────

export async function getPreferences(): Promise<UserPreferencesRecord | undefined> {
  return db.preferences.get('prefs');
}

export async function putPreferences(prefs: UserPreferencesRecord): Promise<void> {
  await db.preferences.put(prefs);
}

// ─── Rule CRUD ────────────────────────────────────────────────────────────────

export async function getRules(): Promise<RuleRecord[]> {
  return db.rules.toArray();
}

export async function getEnabledRules(): Promise<RuleRecord[]> {
  const all = await db.rules.toArray();
  return all.filter(r => r.enabled);
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
