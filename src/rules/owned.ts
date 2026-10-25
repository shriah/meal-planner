// Rules a component owns: edited on the component's form, stored as ordinary rules, at most one per
// template. A curry or subzi owns its base pairing (`pairs_with`), an extra the curry types it never
// goes with (`avoid_with`), and any dish the days it may be planned on (`allowed_days`) and whether
// it is planned automatically at all (`exclude`).
import { all, is, isLeaf, oneOf, type Day, type Matcher } from '@/planner';
import type { CurryCategory } from '@/types/component';
import type { RuleRecord } from './record';
import type { RuleSpecInput } from './templates';

export type OwnedRule = Omit<RuleRecord, 'id' | 'enabled' | 'created_at'> & { owner_component_id: number };
export const OWNED_TEMPLATES = ['pairs_with', 'avoid_with', 'allowed_days', 'exclude'] as const;
export type OwnedTemplate = (typeof OWNED_TEMPLATES)[number];

const NAME_SUFFIX: Partial<Record<RuleSpecInput['template'], string>> = {
  pairs_with: 'base pairing',
  avoid_with: 'not with these curries',
  allowed_days: 'only on certain days',
  exclude: 'never planned automatically',
};

/** Name of a rule owned by `componentName`, kept in step when the component is renamed. */
export const ownedRuleName = (template: RuleSpecInput['template'], componentName: string): string =>
  `${componentName}: ${NAME_SUFFIX[template] ?? 'rule'}`;

export function pairingRule(component: { id: number; name: string }, baseCategories: readonly number[]): OwnedRule {
  return {
    name: ownedRuleName('pairs_with', component.name),
    spec: { template: 'pairs_with', params: { match: is('id', component.id), baseCategories: [...baseCategories], strength: 'must' } },
    owner_component_id: component.id,
  };
}

/** Base categories a pairing rule allows, or undefined when the rule is not a pairing. */
export function pairingCategories(rule: Pick<RuleRecord, 'spec'>): number[] | undefined {
  return rule.spec.template === 'pairs_with' ? [...(rule.spec.params.baseCategories ?? [])] : undefined;
}

export function curryClashRule(component: { id: number; name: string }, curryCategories: readonly CurryCategory[]): OwnedRule {
  return {
    name: ownedRuleName('avoid_with', component.name),
    spec: {
      template: 'avoid_with',
      params: { match: is('id', component.id), with: all(is('componentType', 'curry'), oneOf('curry_category', [...curryCategories])), strength: 'must' },
    },
    owner_component_id: component.id,
  };
}

/** Curry types a clash rule keeps away, or undefined when the rule is not a curry clash. */
export function clashCurryCategories(rule: Pick<RuleRecord, 'spec'>): CurryCategory[] | undefined {
  if (rule.spec.template !== 'avoid_with') return undefined;
  const find = (m: Matcher): CurryCategory[] | undefined => {
    if (isLeaf(m)) return m.field === 'curry_category' ? [m.value].flat() as CurryCategory[] : undefined;
    return 'all' in m ? m.all.map(find).find(Boolean) : undefined;
  };
  return find(rule.spec.params.with as Matcher) ?? [];
}

export function dayRule(component: { id: number; name: string }, days: readonly Day[]): OwnedRule {
  return {
    name: ownedRuleName('allowed_days', component.name),
    spec: { template: 'allowed_days', params: { match: is('id', component.id), days: [...days], strength: 'must' } },
    owner_component_id: component.id,
  };
}

/** Days a specific-days rule allows, or undefined when the rule is not one. */
export function ruleDays(rule: Pick<RuleRecord, 'spec'>): Day[] | undefined {
  return rule.spec.template === 'allowed_days' ? [...rule.spec.params.days] : undefined;
}

/** The dish is never planned automatically; it can still be picked by hand, as an override. */
export function exclusionRule(component: { id: number; name: string }): OwnedRule {
  return {
    name: ownedRuleName('exclude', component.name),
    spec: { template: 'exclude', params: { match: is('id', component.id), strength: 'must' } },
    owner_component_id: component.id,
  };
}
