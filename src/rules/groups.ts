// How the Rules page sorts stored rules: the user's own, the planner defaults every library starts
// with, and the settings that dishes own (edited from the Library).
import type { RuleRecord } from './record';

export interface RuleGroups {
  mine: RuleRecord[];
  defaults: RuleRecord[];
  dish: RuleRecord[];
}

/** A rule a dish owns is a dish setting even if it also carries a default key. Order is preserved. */
export function groupRules(rules: readonly RuleRecord[]): RuleGroups {
  const groups: RuleGroups = { mine: [], defaults: [], dish: [] };
  for (const rule of rules) {
    if (rule.owner_component_id !== undefined) groups.dish.push(rule);
    else if (rule.default_key !== undefined) groups.defaults.push(rule);
    else groups.mine.push(rule);
  }
  return groups;
}
