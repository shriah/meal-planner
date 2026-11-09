// One plain sentence for a dish link, for the library row badges and the links editor.
import { MEALS } from '@/planner';
import type { Names } from './describe';
import { STRENGTH_WORDS } from './levels';
import { describeDays, isDishTarget, type DishLink } from './owned';

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

/** "Sambar is usually planned only with Idli or Dosa, on weekdays at breakfast", or "Sambar is always served with Idli". */
export function describeLink(dishName: string, link: DishLink, names: Names): string {
  const listed = listValues(link, names);
  if (link.mode === 'comes') return `${dishName} ${STRENGTH_WORDS[link.strength].word} comes with ${listed}${scopeText(link)}`;
  const what = link.mode === 'with' ? 'planned only with' : link.mode === 'serve' ? 'served with' : 'kept away from';
  return `${dishName} is ${STRENGTH_WORDS[link.strength].word} ${what} ${listed}${scopeText(link)}`;
}

/** "Usually only with Idli, Dosa, at lunch"; for an unscoped, always goes-with link to base categories, just the names. */
export function shortLink(link: DishLink, names: Names): string {
  const listed = link.values.map((v) => valueName(link, v, names)).join(', ');
  const unscoped = !link.scope?.days?.length && !link.scope?.meals?.length;
  if (link.mode === 'with' && link.target === 'base_category' && link.strength === 'always' && unscoped) return listed;
  const word = link.strength === 'always' ? '' : STRENGTH_WORDS[link.strength].label;
  const what = { with: 'only with', serve: 'served with', comes: 'comes with', never: 'not with' }[link.mode];
  return `${word ? `${word} ${what}` : what.charAt(0).toUpperCase() + what.slice(1)} ${listed}${scopeText(link)}`;
}
