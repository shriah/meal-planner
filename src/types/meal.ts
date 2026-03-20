export interface MealRecord {
  id?: number;
  name?: string;
  base_id: number;
  curry_id?: number;
  subzi_id?: number;
  created_at: string;
}

export interface MealExtraRecord {
  meal_id: number;
  component_id: number;
}
