// One plain sentence for a dish link, for the library row badges and the links editor.
import { MEALS } from '@/planner';
import type { Names } from './describe';
import { describeDays, isDishTarget, type DishLink } from './owned';

const STRENGTH_WORD = { always: 'always', usually: 'usually', moderately: 'often', sometimes: 'sometimes' } as const;
const SHORT_WORD = { always: '', usually: 'Usually', moderately: 'Often', sometimes: 'Sometimes' } as const;
const LONG_LIST = 4;

function valueName(link: DishLink, value: number | string, names: Names): string {
  const id = Number(value);
  switch (link.target) {
    case 'base_category': return names.baseCategory?.(id) ?? 'a deleted category';
    case 'extra_category': return names.extraCategory?.(id) ?? 'a deleted category';
    case 'curry_category': return String(value);
    default: return isDishTarget(link.target) ? (names.component?.(id) ?? 'a deleted dish') : String(value);
  }
}

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

/** "Sambar is usually planned only with Idli or Dosa, on weekdays at breakfast". */
export function describeLink(dishName: string, link: DishLink, names: Names): string {
  const listed = listValues(link, names);
  const what = link.mode === 'with' ? 'planned only with' : 'kept away from';
  return `${dishName} is ${STRENGTH_WORD[link.strength]} ${what} ${listed}${scopeText(link)}`;
}

/** "Usually only with Idli, Dosa, at lunch"; for an unscoped, always goes-with link to base categories, just the names. */
export function shortLink(link: DishLink, names: Names): string {
  const listed = link.values.map((v) => valueName(link, v, names)).join(', ');
  const unscoped = !link.scope?.days?.length && !link.scope?.meals?.length;
  if (link.mode === 'with' && link.target === 'base_category' && link.strength === 'always' && unscoped) return listed;
  const word = SHORT_WORD[link.strength];
  const what = link.mode === 'with' ? 'only with' : 'not with';
  return `${word ? `${word} ${what}` : what.charAt(0).toUpperCase() + what.slice(1)} ${listed}${scopeText(link)}`;
}
