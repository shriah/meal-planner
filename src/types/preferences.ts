export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export interface UserPreferencesRecord {
  id: 'prefs';
  /** Most extras the planner may place at each meal. */
  extra_quantity_limits: Record<MealSlot, number>;
}
