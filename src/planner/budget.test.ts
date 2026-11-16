import { describe, expect, it } from 'vitest';
import { buildModel } from './plan';
import { is } from './matcher';
import type { Constraint } from './constraints';
import { component } from './test-utils';
import {
  BUDGET_MAX, BUDGET_MIN, BUDGET_PER_DISH, BUDGET_PER_PAIR, BUDGET_PLATEAU, BUDGET_BASE, searchBudget,
} from './budget';

const library = (n: number) => Array.from({ length: n }, (_, i) => component('base', { id: i + 1 }));
const pairs = (n: number): Constraint[] =>
  Array.from({ length: n }, (_, i) => ({
    kind: 'pair', id: `pair-${i}`, label: 'Served with', origin: 'rule', when: is('id', 1), of: is('id', 2), strength: 'must',
  }));
const budgetOf = (dishes: number, pairCount = 0) =>
  searchBudget(buildModel({ library: library(dishes), constraints: pairs(pairCount) }));

// Measured in docs/superpowers/plans/2026-11-16-planner-search-budget-measurements.md (max over seeds).
const NEEDS = [
  { dishes: 31, pairs: 3, need: 20_217 },
  { dishes: 45, pairs: 3, need: 27_445 },
  { dishes: 60, pairs: 3, need: 27_544 },
  { dishes: 87, pairs: 3, need: 25_901 },
  { dishes: 87, pairs: 18, need: 29_808 },
  { dishes: 18, pairs: 0, need: 1000 }, // largest rule-case need, on the test library
];

describe('searchBudget', () => {
  it('grows with the library', () => {
    expect(budgetOf(40).maxIterations).toBeLessThan(budgetOf(120).maxIterations);
  });

  it('grows with pairs', () => {
    expect(budgetOf(40, 5).maxIterations).toBeGreaterThan(budgetOf(40, 0).maxIterations);
  });

  it('has a floor', () => {
    const b = budgetOf(0);
    expect(b.maxIterations).toBe(BUDGET_MIN);
    expect(BUDGET_MIN).toBeGreaterThanOrEqual(b.plateauIterations);
    expect(b.plateauIterations).toBe(BUDGET_PLATEAU);
  });

  it('has a ceiling', () => {
    expect(budgetOf(1200).maxIterations).toBe(BUDGET_MAX);
  });

  it('stays bounded for a large library', () => {
    expect(budgetOf(500).maxIterations).toBe(BUDGET_BASE + BUDGET_PER_DISH * 500);
    expect(budgetOf(500).maxIterations).toBe(111_000);
    expect(budgetOf(40, 5).maxIterations).toBe(BUDGET_BASE + BUDGET_PER_DISH * 40 + BUDGET_PER_PAIR * 5);
  });

  it.each(NEEDS)('covers the measured need at $dishes dishes, $pairs pairs', ({ dishes, pairs: p, need }) => {
    expect(budgetOf(dishes, p).maxIterations).toBeGreaterThanOrEqual(1.5 * need);
  });
});
