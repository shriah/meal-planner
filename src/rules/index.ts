// Rule types (templates), stored rules, and their compilation into planner constraints.
export {
  RuleSpecSchema, ScopeSchema, TEMPLATES, TEMPLATE_IDS, TEMPLATE_GROUPS, OWNED_ONLY_TEMPLATES, HAND_TEMPLATE_IDS, PREFER_COST, compileSpec, describeSpec, specReferences, ofPart,
  type RuleSpec, type RuleSpecInput, type TemplateId, type ParamsOf, type RuleTemplate, type Scope, type Strength,
  type ConstraintBody, type Refs, type CompileContext,
} from './templates';
export { groupRules, type RuleGroups } from './groups';
export { LEVELS, nearestLevel, STRENGTH_COST, STRENGTH_WORDS, type Level } from './levels';
export { describeLink, shortLink } from './link-text';
export { linkWarnings, type LinkWarning } from './link-warnings';
export { describeMatcher, describeScope, describeWhen, pluralNoun, singularNoun, whenParts, type Names } from './describe';
export { capRules, defaultRules, defaultKeyForName, legacyOccasionDays, DEFAULT_EXTRA_LIMITS, LEGACY_CALENDAR_TAGS, type DefaultRule } from './defaults';
export {
  pairingRule, pairingCategories, cleanWhen, linkRule, readLink, bringMode, linkModes, linkTargets, sameTarget, linkSlotOf, strengthOf, LINK_STRENGTHS, isDishTarget, ownedSlot, offersLink, addableSlots, isLinkSlot, dayRule, ruleDays, mealRule, ruleMeals, exclusionRule, ownedRuleName, linkRuleName, ownedRuleNameOf,
  readOwned, ownedChanges, linkChanges, sameLink, PLAIN_OWNED_SLOTS, dayModeOf, daysOfMode, describeDays, describeMeals,
  type OwnedRule, type OwnedTemplate, type OwnedSlot, type LinkTarget, type LinkKind, type LinkParts, type LinkMode, type LinkValue, type LinkSlot, type DishLink, type LinkScope, type LinkWhen, type LinkStrength, type OwnedRuleChanges, type OwnedValues, type LinkChange, type DayMode,
} from './owned';
export { compileRules, cappedParts, ruleLevel, parseSpec, missingReferences, type RuleRecord, type KnownIds, type RuleIssue } from './record';
export { toPartMatcher, constraintOverParts, libraryNames, type RuleParts } from './legacy-parts';
export {
  CONDITION_FIELDS, toMatcher, fromMatcher, groupProblems, emptyGroup,
  type Condition, type ConditionGroup, type ConditionField, type ConditionValue, type ReadableField,
} from './conditions';
export {
  TEMPLATE_FORMS, newSpec, validateDraft, previewMatches, matchesDish, type StoredDish,
  type FormField, type FormFieldKind, type TemplateForm, type Draft, type DraftErrors, type DraftResult,
} from './form';
export { allowedMealsOf } from './meals';
