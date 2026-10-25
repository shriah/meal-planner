// Public API of the planner: a headless constraint-optimisation engine for weekly meal plans.
export {
  DAYS, MEALS, ROLES, SLOT_COUNT, slotIndex, slotDay, slotMeal, emptyPlan,
  type Day, type Meal, type Role, type ComponentLike, type Assignment, type SlotState, type PlanState,
  type SlotPins, type Pins,
} from './types';
export {
  all, any, not, is, oneOf, TRUE, isLeaf, compileMatcher, matcherFields, MatcherSchema, FIELDS, FIELD_KEYS, OPS_BY_KIND,
  type Matcher, type Leaf, type FieldKey, type FieldKind, type FieldValues, type MatchFn,
} from './matcher';
export {
  ConstraintSchema, timeOf, byComponent,
  type Constraint, type CountConstraint, type PreferConstraint, type GroupBy, type TimeGroup, type Bounds, type Origin,
} from './constraints';
export {
  compileModel, score, compareScore, explain, groupText, UNKNOWN_COMPONENT,
  type CompiledModel, type Score, type ScoreResult, type Justification, type GroupKey, type BoundKind, type ExplainNames,
} from './scorer';
export { builtinConstraints } from './builtins';
export { solve, clonePlan, type SolveOptions, type SolveResult, type StopReason } from './solver';
export { mulberry32 } from './rng';
export {
  buildModel, planWeek, toPlanSlots, fromPlanSlots, InvalidConstraintError,
  type ModelInput, type PlanResult, type PlanSlotLike,
} from './plan';
