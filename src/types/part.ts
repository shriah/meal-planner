/** A user-visible slot of a meal (Base, Curry, Subzi, Extras). `varied` = the planner varies it across days. */
export interface PartRecord {
  id: number;
  name: string;
  position: number;
  varied: boolean;
  created_at: string;
}
