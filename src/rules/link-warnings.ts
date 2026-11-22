// Problems with a dish's links that the planner would only show as a dish that never appears. They warn; only a
// `blocking` one (a meal that would need two curries or two subzis) also stops saving.
import type { ComponentRecord, ComponentType } from '@/types/component';
import type { PlannerPart } from '@/planner';
import type { LegacyParts } from './legacy-parts';
import type { Names } from './describe';
import { listValues, scopeText } from './link-text';
import { readLink, ruleDays, ruleMeals, sameTarget, type DishLink, type LinkParts } from './owned';
import type { RuleRecord } from './record';

export interface LinkWarning { link: number; message: string; blocking?: boolean }

const unscoped = (l: DishLink) => !l.scope?.days?.length && !l.scope?.meals?.length;

/**
 * The converted parts these checks are about (a meal holds one curry and one subzi): which part is which type. Until
 * Stage 3b reads cap rules instead, the checks run only on the converted parts.
 */
interface Roles { legacy: LegacyParts; parts: LinkParts; role: (part: number) => ComponentType | undefined }
function rolesOf(parts: readonly Pick<PlannerPart, 'id' | 'name' | 'legacy'>[]): Roles | undefined {
  const idOf = (t: ComponentType) => parts.find((p) => p.legacy === t)?.id;
  const [base, curry, subzi, extra] = (['base', 'curry', 'subzi', 'extra'] as const).map(idOf);
  if (base === undefined || curry === undefined || subzi === undefined || extra === undefined) return undefined;
  const legacy: LegacyParts = { base, curry, subzi, extra };
  const types = new Map((Object.entries(legacy) as [ComponentType, number][]).map(([t, id]) => [id, t]));
  return { legacy, parts, role: (part) => types.get(part) };
}

/** A dish's type as the checks read it: its part's, or its stored type when it has no part. */
const typeOf = (d: ComponentRecord, r: Roles): ComponentType => (d.part_id === undefined ? d.componentType : r.role(d.part_id) ?? d.componentType);
/** A link that brings a side: a comes link, to any part but the first. */
const bringsSide = (l: DishLink, r: Roles) => l.mode === 'comes' && l.target.part !== r.legacy.base;
/** An unscoped Always "comes with" link that brings a dish of `role`, waiting or not for the meal's curry or subzi. */
const alwaysComes = (l: DishLink | undefined, role: ComponentType, r: Roles): l is DishLink =>
  l !== undefined && bringsSide(l, r) && l.strength === 'always' && unscoped(l) && l.values.length > 0 && r.role(l.target.part) === role;
/** An unscoped Always "comes with" link that brings a dish of `role` with no condition: one that must hold in every meal. */
const alwaysBrings = (l: DishLink | undefined, role: ComponentType, r: Roles): l is DishLink => alwaysComes(l, role, r) && !l.when;
/** The dishes a link waits for in one part. */
const waitsIn = (l: DishLink, part: number) => l.when?.[part];
/** Whether a link brings its dish in every meal with this curry: it waits for nothing, or only for curries that include it. */
const bringsWithCurry = (l: DishLink, curry: number, r: Roles) =>
  !l.when || (Object.keys(l.when).every((part) => Number(part) === r.legacy.curry || !l.when![Number(part)].length) && (waitsIn(l, r.legacy.curry) ?? []).includes(curry));
/** Whether two conditional links can hold in one meal: every part both name shares a dish. */
const canMeet = (a: DishLink, b: DishLink) => [...new Set([...Object.keys(a.when ?? {}), ...Object.keys(b.when ?? {})])].map(Number).every((part) => {
  const x = waitsIn(a, part), y = waitsIn(b, part);
  return !x?.length || !y?.length || x.some((id) => y.includes(id));
});
const OTHER_ROLE: Partial<Record<ComponentType, ComponentType>> = { curry: 'subzi', subzi: 'curry' };

type Lookup = { dishes: readonly ComponentRecord[]; rules: readonly RuleRecord[]; parts: readonly Pick<PlannerPart, 'id' | 'name' | 'legacy'>[] };

/** The library dishes a link points at, other than the dish itself. */
function chosenDishes(link: DishLink, selfId: number | undefined, dishes: readonly ComponentRecord[], r: Roles): ComponentRecord[] {
  const has = (v: unknown) => link.values.includes(v as never);
  return dishes.filter((d) => {
    if (d.id === selfId) return false;
    if (link.target.kind === 'dish') return has(d.id);
    return (d.part_id ?? r.legacy[d.componentType]) === link.target.part && has(d.category_id);
  });
}

export function linkWarnings(
  self: { id?: number; name?: string; componentType: ComponentType; base_category_id?: number },
  links: readonly DishLink[],
  lookup: Lookup,
  names: Names = {},
): LinkWarning[] {
  const out: LinkWarning[] = [];
  const roles = rolesOf(lookup.parts);
  if (!roles) return out;
  const r = roles;
  const mine = (self.name ?? '').trim() || 'this dish';
  const rules = lookup.rules.filter((rule) => rule.enabled);
  const ownedBy = (id: number | undefined) => rules.filter((rule) => rule.owner_component_id === id);
  const read = (rule: RuleRecord) => readLink(rule, r.parts);
  const chosen = (link: DishLink, owner: number | undefined) => chosenDishes(link, owner, lookup.dishes, r);

  // Side dishes always served with this base, by their own stored links.
  const baseCategory = self.base_category_id ?? lookup.dishes.find((d) => d.id === self.id)?.base_category_id;
  const servedOnMe = self.id === undefined || self.componentType !== 'base' ? [] : lookup.dishes.filter((d) => d.id !== self.id && typeOf(d, r) !== 'base').filter((d) =>
    ownedBy(d.id).some((rule) => {
      const l = read(rule);
      return l?.mode === 'serve' && l.target.part === r.legacy.base && l.strength === 'always' && unscoped(l)
        && ((l.target.kind === 'dish' && l.values.includes(self.id!)) || (l.target.kind === 'category' && baseCategory != null && l.values.includes(baseCategory)));
    }));
  const comesIds = (l: DishLink) => new Set(chosen(l, self.id).map((d) => d.id));

  links.forEach((link, i) => {
    if (link.values.length === 0) return;

    if (bringsSide(link, r) && link.strength === 'always' && unscoped(link)) {
      const role = r.role(link.target.part);
      const mineIds = comesIds(link);
      if (role === 'curry' || role === 'subzi') {
        // A meal holds one curry and one subzi, so these always-comes links must share a dish to both hold. A link that
        // waits for a curry meets the plain ones in every meal with that curry, and another waiting one where both can
        // hold; it carries the clash, and two plain links or two waiting ones leave it to the later one.
        const earlier = links.find((o, j) => {
          if (j === i || !alwaysComes(o, role, r)) return false;
          if (link.when ? (o.when && (j > i || !canMeet(link, o))) : (o.when || j > i)) return false;
          const theirs = comesIds(o);
          return theirs.size > 0 && mineIds.size > 0 && ![...theirs].some((id) => mineIds.has(id));
        });
        if (earlier) out.push({ link: i, blocking: true, message: `${mine} already always comes with ${listValues(earlier, names)}, and a meal holds one ${role}.` });
        // Another dish always served with this base leaves no room for the ones this link names.
        const other = mineIds.size === 0 ? undefined : servedOnMe.find((d) => typeOf(d, r) === role && !mineIds.has(d.id));
        if (other) out.push({ link: i, blocking: true, message: `${other.name} is always served with ${mine}, which leaves no room for ${listValues(link, names)}, and a meal holds one ${role}.` });
        // A dish among the chosen ones that is always served with it makes the others unreachable.
        const narrowing = link.when ? undefined : servedOnMe.find((d) => typeOf(d, r) === role && mineIds.has(d.id));
        if (narrowing && mineIds.size > 1) {
          const rest = lookup.dishes.filter((d) => mineIds.has(d.id) && d.id !== narrowing.id).map((d) => d.name);
          out.push({ link: i, message: `${narrowing.name} is always served with ${mine}, so ${rest.length > 1 ? `${rest.slice(0, -1).join(', ')} and ${rest[rest.length - 1]}` : rest[0]} will never be picked. Remove that link on ${narrowing.name} to let ${rest.length > 1 ? 'any' : 'either'} come.` });
        }
      }
    }

    if (link.mode === 'with' || link.mode === 'serve') {
      const other = links.find((l) => l.mode === 'never' && sameTarget(l.target, link.target));
      const clash = other ? link.values.filter((v) => other.values.includes(v)) : [];
      if (clash.length > 0) {
        const said = clash.map((v) => listValues({ ...link, values: [v] }, names));
        const both = link.mode === 'serve' ? 'both served with and ruled out' : 'both allowed and ruled out';
        const text = `${said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]} are` : `${said[0]} is`} ${both}.`;
        out.push({ link: i, message: text.charAt(0).toUpperCase() + text.slice(1) });
      }
    }

    // A meal holds one curry and one subzi, so two of them always served with the same base cannot both be.
    if (link.mode === 'serve' && link.target.part === r.legacy.base && link.strength === 'always' && (self.componentType === 'curry' || self.componentType === 'subzi')) {
      for (const d of lookup.dishes) {
        if (d.id === self.id || typeOf(d, r) !== self.componentType) continue;
        const shared = ownedBy(d.id).flatMap((rule) => {
          const theirs = read(rule);
          return theirs?.mode === 'serve' && theirs.strength === 'always' && sameTarget(theirs.target, link.target)
            ? theirs.values.filter((v) => link.values.includes(v)) : [];
        });
        if (shared.length === 0) continue;
        out.push({ link: i, blocking: true, message: `${d.name} is already always served with ${listValues({ ...link, values: [...new Set(shared)] }, names)}, and a meal holds one ${self.componentType}.` });
        break;
      }
      // A base that always comes with other dishes of this kind leaves no room for this one.
      const taken = chosen(link, self.id).filter((b) => typeOf(b, r) === 'base').flatMap((b) =>
        ownedBy(b.id).flatMap((rule) => {
          const theirs = read(rule);
          if (!theirs || !bringsSide(theirs, r) || theirs.strength !== 'always' || theirs.when || !unscoped(theirs) || r.role(theirs.target.part) !== self.componentType) return [];
          const ids = chosen(theirs, b.id);
          return ids.length > 0 && !ids.some((d) => d.id === self.id) ? [{ b, theirs }] : [];
        }));
      if (taken.length > 0 && unscoped(link)) {
        out.push({ link: i, blocking: true, message: `${taken[0].b.name} always comes with ${listValues(taken[0].theirs, names)}, which leaves no room for ${mine}, and a meal holds one ${self.componentType}.` });
      }
    }

    // A link that waits for a curry or subzi leaves the dish free in every other meal.
    if ((link.mode !== 'with' && link.mode !== 'comes') || link.strength !== 'always' || link.when) return;
    const usable = chosen(link, self.id).filter((d) => !ownedBy(d.id).some((rule) => rule.spec.template === 'exclude'));
    if (usable.length === 0) {
      const listed = listValues(link, names);
      out.push({ link: i, message: link.target.kind === 'dish'
        ? `None of ${listed} can be planned, so ${mine} would never be planned.`
        : `No dish in ${listed} can be planned, so ${mine} would never be planned.` });
      return;
    }

    const scope = link.scope;
    const meals = scope?.meals?.length ? scope.meals : undefined;
    const days = scope?.days?.length ? scope.days : undefined;
    const hidden = (pick: (rule: RuleRecord) => readonly string[] | undefined, wanted: readonly string[] | undefined) =>
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
  out.push(...mealClashes(self, links, lookup, names, mine, r));
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
  r: Roles,
): LinkWarning[] {
  const out: LinkWarning[] = [];
  const rules = lookup.rules.filter((rule) => rule.enabled);
  const read = (rule: RuleRecord) => readLink(rule, r.parts);
  const brings = (owner: number, role: ComponentType) =>
    rules.filter((rule) => rule.owner_component_id === owner).map(read).filter((l): l is DishLink => alwaysBrings(l, role, r));
  const ids = (l: DishLink, owner: number | undefined) => new Set(chosenDishes(l, owner, lookup.dishes, r).map((d) => d.id));
  // A link whose dishes are all gone brings nothing, so it leaves room for anything.
  const crowds = (theirs: DishLink, owner: number | undefined, room: Set<number>) => {
    const t = ids(theirs, owner);
    return t.size > 0 && ![...t].some((id) => room.has(id));
  };

  // On the dish's own form: link `a` brings a dish of one role, link `b` a dish of the other. The later one carries it.
  links.forEach((a, i) => {
    for (const role of ['curry', 'subzi'] as const) {
      const other = OTHER_ROLE[role]!;
      if (!alwaysBrings(a, role, r)) continue;
      const candidates = chosenDishes(a, self.id, lookup.dishes, r);
      if (candidates.length === 0) continue;
      links.forEach((b, j) => {
        if (j === i || !alwaysBrings(b, other, r)) return;
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
  // Such a dish's meals all hold this curry, so its links waiting for this curry bring their dish there too.
  const bringsHere = (owner: number) => self.componentType !== 'curry' ? brings(owner, other) : rules
    .filter((rule) => rule.owner_component_id === owner).map(read)
    .filter((l): l is DishLink => alwaysComes(l, other, r) && bringsWithCurry(l, self.id!, r));
  links.forEach((link, i) => {
    if (!alwaysBrings(link, other, r)) return;
    const room = ids(link, self.id);
    if (room.size === 0) return;
    for (const owner of owners) {
      const theirs = bringsHere(owner.id).find((l) => crowds(l, owner.id, room));
      if (!theirs) continue;
      out.push({ link: i, blocking: true, message: `${owner.name} always comes with ${mine} and with ${listValues(theirs, names)}, which leaves no room for ${listValues(link, names)}, and a meal holds one ${other}.` });
      break;
    }
  });
  return out;
}
