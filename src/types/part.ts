import type { ComponentType } from './component';

/** A user-visible slot of a meal (Base, Curry, Subzi, Extras). `varied` = the planner varies it across days. */
export interface PartRecord {
  id: number;
  name: string;
  position: number;
  varied: boolean;
  /** Set on the four converted parts; how code finds them once they can be renamed. */
  legacy?: ComponentType;
  created_at: string;
}
