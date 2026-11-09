// Problems with a dish's links that the planner would only show as a dish that never appears. They warn; only a
// `blocking` one (a meal that would need two curries or two subzis) also stops saving.
import type { ComponentRecord, ComponentType } from '@/types/component';
import type { Names } from './describe';
import { listValues, scopeText } from './link-text';
import { dishTypeOf, isDishTarget, isSideTarget, readLink, ruleDays, ruleMeals, type DishLink } from './owned';
import type { RuleRecord } from './record';

export interface LinkWarning { link: number; message: string; blocking?: boolean }

const unscoped = (l: DishLink) => !l.scope?.days?.length && !l.scope?.meals?.length;
/** An unscoped Always "comes with" link that brings a dish of `role`: one that must hold in every meal. */
const alwaysBrings = (l: DishLink | undefined, role: ComponentType): l is DishLink =>
  l !== undefined && l.mode === 'comes' && l.strength === 'always' && unscoped(l) && l.values.length > 0 && isSideTarget(l.target) && dishTypeOf(l.target) === role;
const OTHER_ROLE: Partial<Record<ComponentType, ComponentType>> = { curry: 'subzi', subzi: 'curry' };

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
  self: { id?: number; name?: string; componentType: ComponentType; base_category_id?: number },
  links: readonly DishLink[],
  lookup: Lookup,
  names: Names = {},
): LinkWarning[] {
  const out: LinkWarning[] = [];
  const mine = (self.name ?? '').trim() || 'this dish';
  const rules = lookup.rules.filter((r) => r.enabled);
  const ownedBy = (id: number | undefined) => rules.filter((r) => r.owner_component_id === id);

  // Side dishes always served with this base, by their own stored links.
  const baseCategory = self.base_category_id ?? lookup.dishes.find((d) => d.id === self.id)?.base_category_id;
  const servedOnMe = self.id === undefined || self.componentType !== 'base' ? [] : lookup.dishes.filter((d) => d.id !== self.id && d.componentType !== 'base').filter((d) =>
    ownedBy(d.id).some((r) => {
      const l = readLink(r);
      return l?.mode === 'serve' && l.strength === 'always' && unscoped(l)
        && ((l.target === 'base_dish' && l.values.includes(self.id!)) || (l.target === 'base_category' && baseCategory != null && l.values.includes(baseCategory)));
    }));
  const comesIds = (l: DishLink) => new Set(chosenDishes(l, self.id, lookup.dishes).map((d) => d.id));

  links.forEach((link, i) => {
    if (link.values.length === 0) return;

    if (link.mode === 'comes' && link.strength === 'always' && unscoped(link) && isSideTarget(link.target)) {
      const role = dishTypeOf(link.target);
      const mineIds = comesIds(link);
      if (role === 'curry' || role === 'subzi') {
        // A meal holds one curry and one subzi, so these always-comes links must share a dish to both hold.
        const earlier = links.slice(0, i).find((o) => {
          if (o.mode !== 'comes' || o.strength !== 'always' || !unscoped(o) || o.values.length === 0 || !isSideTarget(o.target) || dishTypeOf(o.target) !== role) return false;
          const theirs = comesIds(o);
          return theirs.size > 0 && mineIds.size > 0 && ![...theirs].some((id) => mineIds.has(id));
        });
        if (earlier) out.push({ link: i, blocking: true, message: `${mine} already always comes with ${listValues(earlier, names)}, and a meal holds one ${role}.` });
        // Another dish always served with this base leaves no room for the ones this link names.
        const other = mineIds.size === 0 ? undefined : servedOnMe.find((d) => d.componentType === role && !mineIds.has(d.id));
        if (other) out.push({ link: i, blocking: true, message: `${other.name} is always served with ${mine}, which leaves no room for ${listValues(link, names)}, and a meal holds one ${role}.` });
        // A dish among the chosen ones that is always served with it makes the others unreachable.
        const narrowing = servedOnMe.find((d) => d.componentType === role && mineIds.has(d.id));
        if (narrowing && mineIds.size > 1) {
          const rest = lookup.dishes.filter((d) => mineIds.has(d.id) && d.id !== narrowing.id).map((d) => d.name);
          out.push({ link: i, message: `${narrowing.name} is always served with ${mine}, so ${rest.length > 1 ? `${rest.slice(0, -1).join(', ')} and ${rest[rest.length - 1]}` : rest[0]} will never be picked. Remove that link on ${narrowing.name} to let ${rest.length > 1 ? 'any' : 'either'} come.` });
        }
      }
    }

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
      // A base that always comes with other dishes of this kind leaves no room for this one.
      const taken = chosenDishes(link, self.id, lookup.dishes).filter((b) => b.componentType === 'base').flatMap((b) =>
        ownedBy(b.id).flatMap((r) => {
          const theirs = readLink(r);
          if (theirs?.mode !== 'comes' || theirs.strength !== 'always' || !unscoped(theirs) || !isSideTarget(theirs.target) || dishTypeOf(theirs.target) !== self.componentType) return [];
          const ids = chosenDishes(theirs, b.id, lookup.dishes);
          return ids.length > 0 && !ids.some((d) => d.id === self.id) ? [{ b, theirs }] : [];
        }));
      if (taken.length > 0 && unscoped(link)) {
        out.push({ link: i, blocking: true, message: `${taken[0].b.name} always comes with ${listValues(taken[0].theirs, names)}, which leaves no room for ${mine}, and a meal holds one ${self.componentType}.` });
      }
    }

    if ((link.mode !== 'with' && link.mode !== 'comes') || link.strength !== 'always') return;
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
  out.push(...mealClashes(self, links, lookup, names, mine));
  return out;
}

/**
 * Clashes across one meal that the form can see: a dish always brings a curry that itself always brings a subzi other
 * than the ones the dish always brings (or the same with curry and subzi swapped), and, from the curry's own form,
 * a dish that always brings only this curry and also a subzi this curry's link leaves no room for. A meal holds one of each.
 */
function mealClashes(
  self: { id?: number; componentType: ComponentType },
  links: readonly DishLink[],
  lookup: Lookup,
  names: Names,
  mine: string,
): LinkWarning[] {
  const out: LinkWarning[] = [];
  const rules = lookup.rules.filter((r) => r.enabled);
  const brings = (owner: number, role: ComponentType) =>
    rules.filter((r) => r.owner_component_id === owner).map(readLink).filter((l): l is DishLink => alwaysBrings(l, role));
  const ids = (l: DishLink, owner: number | undefined) => new Set(chosenDishes(l, owner, lookup.dishes).map((d) => d.id));
  // A link whose dishes are all gone brings nothing, so it leaves room for anything.
  const crowds = (theirs: DishLink, owner: number | undefined, room: Set<number>) => {
    const t = ids(theirs, owner);
    return t.size > 0 && ![...t].some((id) => room.has(id));
  };

  // On the dish's own form: link `a` brings a dish of one role, link `b` a dish of the other. The later one carries it.
  links.forEach((a, i) => {
    for (const role of ['curry', 'subzi'] as const) {
      const other = OTHER_ROLE[role]!;
      if (!alwaysBrings(a, role)) continue;
      const candidates = chosenDishes(a, self.id, lookup.dishes);
      if (candidates.length === 0) continue;
      links.forEach((b, j) => {
        if (j === i || !alwaysBrings(b, other)) return;
        const room = ids(b, self.id);
        if (room.size === 0) return;
        // Ruled out only when every dish `a` may bring leaves no room; otherwise the planner picks one that does.
        const forced = candidates.map((c) => ({ c, theirs: brings(c.id, other).find((m) => crowds(m, c.id, room)) }));
        if (!forced.every((f) => f.theirs)) return;
        const said = forced.length === 1
          ? `${forced[0].c.name} always comes with ${listValues(forced[0].theirs!, names)}`
          : `${forced.slice(0, -1).map((f) => f.c.name).join(', ')} and ${forced[forced.length - 1].c.name} each always come with another ${other}`;
        out.push({ link: Math.max(i, j), blocking: true, message: `${said}, which leaves no room for ${listValues(b, names)}, and a meal holds one ${other}.` });
      });
    }
  });

  // On a curry's (or subzi's) form: a dish that always brings only this one, and also always brings a dish of the other role.
  const other = OTHER_ROLE[self.componentType];
  if (self.id === undefined || !other) return out;
  const owners = lookup.dishes.filter((d) => d.id !== self.id && brings(d.id, self.componentType).some((l) => {
    const t = ids(l, d.id);
    return t.size === 1 && t.has(self.id!);
  }));
  links.forEach((link, i) => {
    if (!alwaysBrings(link, other)) return;
    const room = ids(link, self.id);
    if (room.size === 0) return;
    for (const owner of owners) {
      const theirs = brings(owner.id, other).find((l) => crowds(l, owner.id, room));
      if (!theirs) continue;
      out.push({ link: i, blocking: true, message: `${owner.name} always comes with ${mine} and with ${listValues(theirs, names)}, which leaves no room for ${listValues(link, names)}, and a meal holds one ${other}.` });
      break;
    }
  });
  return out;
}
