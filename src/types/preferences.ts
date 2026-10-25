export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

/**
 * Before v16, the most extras the planner could place at each meal. The limits are now stored rules;
 * the record is only read by the v16 upgrade.
 */
export interface LegacyPreferencesRecord {
  id: 'prefs';
  extra_quantity_limits: Record<MealSlot, number>;
}
