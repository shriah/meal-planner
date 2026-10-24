// Rule types (templates), stored rules, and their compilation into planner constraints.
export {
  RuleSpecSchema, ScopeSchema, TEMPLATES, TEMPLATE_IDS, PREFER_COST, compileSpec, describeSpec, specReferences,
  type RuleSpec, type RuleSpecInput, type TemplateId, type ParamsOf, type RuleTemplate, type Scope, type Strength,
  type ConstraintBody, type Refs,
} from './templates';
export { describeMatcher, describeScope, type Names } from './describe';
export { compileRules, parseSpec, missingReferences, type RuleRecord, type KnownIds, type RuleIssue } from './record';
export {
  convertLegacyRule, LegacyCompiledRuleSchema,
  type LegacyRuleRow, type ConvertedRule, type DroppedRule, type ConversionContext, type ConversionResult,
} from './legacy';
