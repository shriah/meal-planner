import type { BaseType, ExtraCategory } from './component';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export interface SlotRestrictions {
  base_type_slots: Partial<Record<BaseType, MealSlot[]>>;
  component_slot_overrides: Record<number, MealSlot[]>;
}

export interface BaseTypeRule {
  base_type: BaseType;
  required_extra_category?: ExtraCategory;
}

export interface UserPreferencesRecord {
  id: 'prefs';
  slot_restrictions: SlotRestrictions;
  extra_quantity_limits: Record<MealSlot, number>;
  base_type_rules: BaseTypeRule[];
}
