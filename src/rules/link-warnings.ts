// Problems with a dish's links that the planner would only show as a dish that never appears. They warn; only a
// `blocking` one (two curries always served with the same base) also stops saving.
import type { ComponentRecord, ComponentType } from '@/types/component';
import type { Names } from './describe';
import { listValues, scopeText } from './link-text';
import { isDishTarget, readLink, ruleDays, ruleMeals, type DishLink } from './owned';
import type { RuleRecord } from './record';

export interface LinkWarning { link: number; message: string; blocking?: boolean }

type Lookup = { dishes: readonly ComponentRecord[]; rules: readonly RuleRecord[] };

/** The library dishes a link points at, other than the dish itself. */
function chosenDishes(link: DishLink, selfId: number | undefined, dishes: readonly ComponentRecord[]): ComponentRecord[] {
  const has = (v: unknown) => link.values.includes(v as never);
  return dishes.filter((d) => {
    if (d.id === selfId) return false;
    switch (link.target) {
      case 'base_category': return d.componentType === 'base' && has(d.base_category_id);
      case 'extra_category': return d.componentType === 'extra' && has(d.extra_category_id);
      case 'curry_category': return d.componentType === 'curry' && has(d.curry_category);
      default: return isDishTarget(link.target) && has(d.id);
    }
  });
}

export function linkWarnings(
  self: { id?: number; name?: string; componentType: ComponentType },
  links: readonly DishLink[],
  lookup: Lookup,
  names: Names = {},
): LinkWarning[] {
  const out: LinkWarning[] = [];
  const mine = (self.name ?? '').trim() || 'this dish';
  const rules = lookup.rules.filter((r) => r.enabled);
  const ownedBy = (id: number | undefined) => rules.filter((r) => r.owner_component_id === id);

  links.forEach((link, i) => {
    if (link.values.length === 0) return;

    if (link.mode === 'with' || link.mode === 'serve') {
      const other = links.find((l) => l.mode === 'never' && l.target === link.target);
      const clash = other ? link.values.filter((v) => other.values.includes(v)) : [];
      if (clash.length > 0) {
        const said = clash.map((v) => listValues({ ...link, values: [v] }, names));
        const both = link.mode === 'serve' ? 'both served with and ruled out' : 'both allowed and ruled out';
        const text = `${said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]} are` : `${said[0]} is`} ${both}.`;
        out.push({ link: i, message: text.charAt(0).toUpperCase() + text.slice(1) });
      }
    }

    // A meal holds one curry and one subzi, so two of them always served with the same base cannot both be.
    if (link.mode === 'serve' && link.strength === 'always' && (self.componentType === 'curry' || self.componentType === 'subzi')) {
      for (const d of lookup.dishes) {
        if (d.id === self.id || d.componentType !== self.componentType) continue;
        const shared = ownedBy(d.id).flatMap((r) => {
          const theirs = readLink(r);
          return theirs?.mode === 'serve' && theirs.strength === 'always' && theirs.target === link.target
            ? theirs.values.filter((v) => link.values.includes(v)) : [];
        });
        if (shared.length === 0) continue;
        out.push({ link: i, blocking: true, message: `${d.name} is already always served with ${listValues({ ...link, values: [...new Set(shared)] }, names)}, and a meal holds one ${self.componentType}.` });
        break;
      }
    }

    if (link.mode !== 'with' || link.strength !== 'always') return;
    const usable = chosenDishes(link, self.id, lookup.dishes).filter((d) => !ownedBy(d.id).some((r) => r.spec.template === 'exclude'));
    if (usable.length === 0) {
      const listed = listValues(link, names);
      out.push({ link: i, message: isDishTarget(link.target)
        ? `None of ${listed} can be planned, so ${mine} would never be planned.`
        : `No dish in ${listed} can be planned, so ${mine} would never be planned.` });
      return;
    }

    const scope = link.scope;
    const meals = scope?.meals?.length ? scope.meals : undefined;
    const days = scope?.days?.length ? scope.days : undefined;
    const hidden = (pick: (r: RuleRecord) => readonly string[] | undefined, wanted: readonly string[] | undefined) =>
      wanted !== undefined && usable.every((d) => {
        const allowed = ownedBy(d.id).map(pick).find((v) => v !== undefined);
        return allowed !== undefined && !allowed.some((v) => wanted.includes(v));
      });
    const noMeals = hidden(ruleMeals, meals);
    const noDays = hidden(ruleDays, days);
    if (noMeals || noDays) {
      const text = scopeText({ scope: { ...(noDays && { days }), ...(noMeals && { meals }) } }).replace(/^, /, '');
      if (text) out.push({ link: i, message: `None of these are planned ${text}.` });
    }
  });
  return out;
}
