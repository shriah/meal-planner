import { exclusionRule, linkRule } from '@/rules';
import { lockedMealKept } from '../expect';
import type { RuleCase } from '../types';

export const LOCK_CASES: RuleCase[] = [
  {
    kind: 'plan',
    id: 'lock-beats-pairing',
    group: 'Locks and picks',
    name: 'A lock beats a pairing',
    why: 'A meal the user locked keeps its own curry even when an Always pairing would put a different one there.',
    rules: (lib) => [linkRule(lib.dish('Sambar'), { mode: 'serve', target: 'base_dish', values: [lib.dish('Pongal').id] })],
    pins: { 'monday-breakfast': { base_id: 1, curry_id: 10 } },
    expect: [lockedMealKept('monday-breakfast', 'curry', 'Dal')],
  },
  {
    kind: 'plan',
    id: 'lock-picks-never-auto-dish',
    group: 'Locks and picks',
    name: 'A lock can place a never-auto dish',
    why: 'A dish never planned automatically can still be put in a meal by hand, and the plan keeps it there.',
    rules: (lib) => [exclusionRule(lib.dish('Chole'))],
    pins: { 'monday-lunch': { curry_id: 11 } },
    expect: [lockedMealKept('monday-lunch', 'curry', 'Chole')],
  },
];
