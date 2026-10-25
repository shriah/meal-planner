// One-time conversion of rules stored in the old target/scope/effects shape.
// A converted rule means what the old rule form said, not what the old generator happened to do
// (e.g. a day-scoped no-repeat now respects its days). Rules that cannot be converted faithfully
// are dropped with a reason. The old schema is copied here so the converter outlives the old code.
import { z } from 'zod';
import { DAYS, MEALS, all, is, type Matcher, type Role } from '@/planner';
import { DIETARY_TAGS, OCCASION_TAGS, PROTEIN_TAGS, REGIONAL_TAGS } from '@/types/component';
import { missingReferences, type KnownIds } from './record';
import { RuleSpecSchema, TEMPLATES, type RuleSpec, type RuleSpecInput, type Scope } from './templates';

const LegacyTargetSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('component_type'), component_type: z.enum(['base', 'curry', 'subzi']) }),
  z.object({
    mode: z.literal('tag'),
    filter: z.object({
      dietary_tag: z.enum(DIETARY_TAGS).optional(),
      protein_tag: z.enum(PROTEIN_TAGS).optional(),
      regional_tag: z.enum(REGIONAL_TAGS).optional(),
      occasion_tag: z.enum(OCCASION_TAGS).optional(),
    }),
  }),
  z.object({ mode: z.literal('component'), component_id: z.number() }),
  z.object({ mode: z.literal('base_category'), category_id: z.number() }),
]);

const LegacyEffectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('filter_pool') }),
  z.object({ kind: z.literal('require_one') }),
  z.object({ kind: z.literal('exclude') }),
  z.object({ kind: z.literal('no_repeat') }),
  z.object({ kind: z.literal('allowed_slots'), slots: z.array(z.enum(MEALS)) }),
  z.object({ kind: z.literal('skip_component'), component_types: z.array(z.enum(['curry', 'subzi', 'extra'])) }),
  z.object({ kind: z.literal('require_component'), component_ids: z.array(z.number()) }),
  z.object({ kind: z.literal('require_extra'), category_ids: z.array(z.number()) }),
]);

export const LegacyCompiledRuleSchema = z.object({
  type: z.literal('rule'),
  target: LegacyTargetSchema,
  scope: z.object({ days: z.array(z.enum(DAYS)).nullable(), slots: z.array(z.enum(MEALS)).nullable() }),
  effects: z.array(LegacyEffectSchema),
});
type LegacyTarget = z.infer<typeof LegacyTargetSchema>;

export interface LegacyRuleRow {
  id: number;
  name: string;
  enabled: boolean;
  compiled_filter: unknown;
  created_at: string;
}

export interface ConvertedRule {
  name: string;
  enabled: boolean;
  spec: RuleSpecInput;
  created_at: string;
}

export interface DroppedRule {
  id: number;
  name: string;
  reason: string;
}

export interface ConversionContext {
  known: KnownIds;
  /** Component type by id, to decide which role an "only allow this component" rule restricts. */
  componentTypes: ReadonlyMap<number, Role>;
}

export type ConversionResult = { ok: true; rules: ConvertedRule[] } | { ok: false; dropped: DroppedRule };

function targetMatcher(t: LegacyTarget): Matcher | string {
  switch (t.mode) {
    case 'component_type':
      return is('componentType', t.component_type);
    case 'component':
      return is('id', t.component_id);
    case 'base_category':
      return all(is('componentType', 'base'), is('base_category_id', t.category_id));
    case 'tag': {
      const f = t.filter;
      const parts: Matcher[] = [];
      if (f.dietary_tag) parts.push(is('dietary_tags', f.dietary_tag));
      if (f.protein_tag) parts.push(is('protein_tag', f.protein_tag));
      if (f.regional_tag) parts.push(is('regional_tags', f.regional_tag));
      if (f.occasion_tag) parts.push(is('occasion_tags', f.occasion_tag));
      if (parts.length === 0) return 'its tag filter is empty, so it would match every component';
      return parts.length === 1 ? parts[0] : all(...parts);
    }
  }
}

/** Roles an "only allow" rule restricted: the target's own type, or base/curry/subzi for tag filters. */
function onlyAllowRoles(t: LegacyTarget, ctx: ConversionContext): Role[] | string {
  switch (t.mode) {
    case 'component_type': return [t.component_type];
    case 'base_category': return ['base'];
    case 'tag': return ['base', 'curry', 'subzi'];
    case 'component': {
      const role = ctx.componentTypes.get(t.component_id);
      return role ? [role] : `component #${t.component_id} no longer exists`;
    }
  }
}

export function convertLegacyRule(row: LegacyRuleRow, ctx: ConversionContext): ConversionResult {
  const drop = (reason: string): ConversionResult => ({ ok: false, dropped: { id: row.id, name: row.name, reason } });

  const parsed = LegacyCompiledRuleSchema.safeParse(row.compiled_filter);
  if (!parsed.success) return drop('it could not be read');
  const { target, scope: oldScope, effects } = parsed.data;
  if (effects.length === 0) return drop('it has no effect');
  if (oldScope.days?.length === 0 || oldScope.slots?.length === 0) return drop('its days or meals select nothing');

  const match = targetMatcher(target);
  if (typeof match === 'string') return drop(match);
  const scope: Scope | undefined = oldScope.days || oldScope.slots
    ? { ...(oldScope.days && { days: oldScope.days }), ...(oldScope.slots && { meals: oldScope.slots }) }
    : undefined;

  const specs: RuleSpecInput[] = [];
  const requireWith = { components: [] as number[], extraCategories: [] as number[] };
  for (const e of effects) {
    switch (e.kind) {
      case 'exclude': specs.push({ template: 'exclude', params: { match, scope } }); break;
      case 'require_one': specs.push({ template: 'require', params: { match, scope } }); break;
      case 'no_repeat': specs.push({ template: 'no_repeat', params: { match, scope } }); break;
      case 'filter_pool': {
        const roles = onlyAllowRoles(target, ctx);
        if (typeof roles === 'string') return drop(roles);
        specs.push({ template: 'only_allow', params: { match, roles, scope } });
        break;
      }
      // The old form's meal scope did not apply to allowed meals; only its days did.
      case 'allowed_slots':
        if (e.slots.length === 0) return drop('it allows no meals');
        specs.push({ template: 'allowed_meals', params: { match, meals: e.slots, days: oldScope.days ?? undefined } });
        break;
      case 'skip_component':
        if (e.component_types.length) specs.push({ template: 'skip_when', params: { when: match, skip: e.component_types, scope } });
        break;
      case 'require_component': requireWith.components.push(...e.component_ids); break;
      case 'require_extra': requireWith.extraCategories.push(...e.category_ids); break;
    }
  }
  if (requireWith.components.length || requireWith.extraCategories.length) {
    specs.push({ template: 'require_with', params: { when: match, ...requireWith, scope } });
  }
  if (specs.length === 0) return drop('it has no effect');

  const validated: RuleSpec[] = [];
  for (const spec of specs) {
    const v = RuleSpecSchema.safeParse(stripUndefined(spec));
    if (!v.success) return drop(`it could not be converted (${v.error.issues[0].message})`);
    const missing = missingReferences(v.data, ctx.known);
    if (missing.length) return drop(`it refers to ${missing.join(', ')}, which no longer exists`);
    validated.push(v.data);
  }

  const split = validated.length > 1;
  return {
    ok: true,
    rules: validated.map((spec) => ({
      name: split ? `${row.name} — ${TEMPLATES[spec.template].label}` : row.name,
      enabled: row.enabled,
      spec,
      created_at: row.created_at,
    })),
  };
}

/** Optional keys must be absent rather than undefined for strict schemas and clean storage. */
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
