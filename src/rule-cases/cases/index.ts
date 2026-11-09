import type { RuleCase } from '../types';
import { COMES_WITH_CASES } from './comes-with';
import { DAYS_MEALS_CASES } from './days-meals';
import { EXTRAS_CASES } from './extras';
import { LOCK_CASES } from './locks';
import { PAIRING_CASES } from './pairings';
import { VARIETY_CASES } from './variety';

export const ALL_CASES: RuleCase[] = [...PAIRING_CASES, ...COMES_WITH_CASES, ...DAYS_MEALS_CASES, ...VARIETY_CASES, ...LOCK_CASES, ...EXTRAS_CASES];
