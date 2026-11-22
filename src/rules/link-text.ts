// One plain sentence for a dish link, for the library row badges and the links editor.
import { MEALS } from '@/planner';
import { describeWhen, whenParts, type Names } from './describe';
import { STRENGTH_WORDS } from './levels';
import { describeDays, type DishLink } from './owned';

const LONG_LIST = 4;

function valueName(link: DishLink, value: number, names: Names): string {
  return link.target.kind === 'dish'
    ? (names.component?.(value) ?? 'a deleted dish')
    : (names.category?.(value) ?? 'a deleted category');
}

/** Whether a served-with link points above the first part's dishes: it then reads "added when … is in the meal". */
const addedWhen = (link: DishLink, names: Names) =>
  link.mode === 'serve' && names.firstPart !== undefined && link.target.part !== names.firstPart;

/** ", on weekdays at breakfast", or "" when the link holds everywhere. */
export function scopeText(link: Pick<DishLink, 'scope'>): string {
  const parts: string[] = [];
  const days = link.scope?.days?.length ? describeDays(link.scope.days) : undefined;
  if (days) parts.push(`on ${days.replace(/^Only /, '').replace(/^(Weekdays|Weekends)$/, (w) => w.toLowerCase())}`);
  const meals = MEALS.filter((m) => link.scope?.meals?.includes(m));
  if (meals.length > 0 && meals.length < MEALS.length) {
    parts.push(`at ${meals.length > 1 ? `${meals.slice(0, -1).join(', ')} or ${meals[meals.length - 1]}` : meals[0]}`);
  }
  return parts.length ? `, ${parts.join(' ')}` : '';
}

/** "Idli or Dosa": a link's chosen values in words, a long list cut short. */
export function listValues(link: DishLink, names: Names): string {
  const all = link.values.map((v) => valueName(link, v, names));
  return all.length > LONG_LIST
    ? `${all.slice(0, 3).join(', ')} and ${all.length - 3} more`
    : all.length > 1 ? `${all.slice(0, -1).join(', ')} or ${all[all.length - 1]}` : all.join('');
}

/** " when the curry is Sambar", or "" for a link with no condition. */
const whenText = (link: DishLink, names: Names): string =>
  link.when ? ` when ${describeWhen(link.when, (id) => names.component?.(id) ?? 'a deleted dish', names)}` : '';

/**
 * "Sambar is usually planned only with Idli or Dosa, on weekdays at breakfast", "Sambar is always served with Idli", or for
 * a dish served with a part other than the first, "Papad is always added when Sambar is in the meal".
 */
export function describeLink(dishName: string, link: DishLink, names: Names): string {
  const listed = listValues(link, names);
  if (link.mode === 'comes') return `${dishName} ${STRENGTH_WORDS[link.strength].word} comes with ${listed}${whenText(link, names)}${scopeText(link)}`;
  if (addedWhen(link, names)) return `${dishName} is ${STRENGTH_WORDS[link.strength].word} added when ${listed} is in the meal${scopeText(link)}`;
  const what = link.mode === 'with' ? 'planned only with' : link.mode === 'serve' ? 'served with' : 'kept away from';
  return `${dishName} is ${STRENGTH_WORDS[link.strength].word} ${what} ${listed}${scopeText(link)}`;
}

/** "Usually only with Idli, Dosa, at lunch"; for an unscoped, always goes-with link to base categories, just the names. */
export function shortLink(link: DishLink, names: Names): string {
  const listed = link.values.map((v) => valueName(link, v, names)).join(', ');
  const unscoped = !link.scope?.days?.length && !link.scope?.meals?.length;
  const pairing = link.mode === 'with' && link.target.kind === 'category' && names.firstPart !== undefined && link.target.part === names.firstPart;
  if (pairing && link.strength === 'always' && unscoped) return listed;
  const word = link.strength === 'always' ? '' : STRENGTH_WORDS[link.strength].label;
  const what = addedWhen(link, names) ? 'added with' : { with: 'only with', serve: 'served with', comes: 'comes with', never: 'not with' }[link.mode];
  const parts = whenParts(link.when).map(([, ids]) => ids.map((id) => names.component?.(id) ?? 'a deleted dish').join(' or '));
  const waits = parts.length ? ` (with ${parts.join(', and ')})` : '';
  return `${word ? `${word} ${what}` : what.charAt(0).toUpperCase() + what.slice(1)} ${listed}${waits}${scopeText(link)}`;
}
