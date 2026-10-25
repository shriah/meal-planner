// Rule types (templates), stored rules, and their compilation into planner constraints.
export {
  RuleSpecSchema, ScopeSchema, TEMPLATES, TEMPLATE_IDS, TEMPLATE_GROUPS, PREFER_COST, compileSpec, describeSpec, specReferences,
  type RuleSpec, type RuleSpecInput, type TemplateId, type ParamsOf, type RuleTemplate, type Scope, type Strength,
  type ConstraintBody, type Refs,
} from './templates';
export { groupRules, type RuleGroups } from './groups';
export { LEVELS, nearestLevel, type Level } from './levels';
export { describeMatcher, describeScope, type Names } from './describe';
export { defaultRules, defaultKeyForName, legacyOccasionDays, DEFAULT_EXTRA_LIMITS, LEGACY_CALENDAR_TAGS, type DefaultRule } from './defaults';
export {
  pairingRule, pairingCategories, curryClashRule, clashCurryCategories, dayRule, ruleDays, exclusionRule, ownedRuleName, OWNED_TEMPLATES,
  readOwned, ownedChanges, dayModeOf, daysOfMode, describeDays,
  type OwnedRule, type OwnedTemplate, type OwnedRuleChanges, type OwnedValues, type DayMode,
} from './owned';
export { compileRules, parseSpec, missingReferences, type RuleRecord, type KnownIds, type RuleIssue } from './record';
export {
  convertLegacyRule, LegacyCompiledRuleSchema,
  type LegacyRuleRow, type ConvertedRule, type DroppedRule, type ConversionContext, type ConversionResult,
} from './legacy';
export {
  CONDITION_FIELDS, toMatcher, fromMatcher, groupProblems, emptyGroup,
  type Condition, type ConditionGroup, type ConditionField, type ConditionValue,
} from './conditions';
export {
  TEMPLATE_FORMS, newSpec, validateDraft, previewMatches,
  type FormField, type FormFieldKind, type TemplateForm, type Draft, type DraftErrors, type DraftResult,
} from './form';
