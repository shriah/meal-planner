// Loads planning data from the database and generates a plan, off the main thread when possible.
import { db } from '@/db/client';
import { planFromData, type PlanningInput, type PlanningOptions, type PlanningOutcome } from './plan-generation';

export async function loadPlanningInput(): Promise<PlanningInput> {
  const [library, categories, rules, prefs] = await Promise.all([
    db.components.toArray(),
    db.categories.toArray(),
    db.rules.toArray(),
    db.preferences.get('prefs'),
  ]);
  return { library, categories, rules, extraLimits: prefs?.extra_quantity_limits };
}

function runInWorker(input: PlanningInput, opts: PlanningOptions): Promise<PlanningOutcome> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./plan-generation.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<PlanningOutcome>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'plan worker failed'));
    };
    worker.postMessage({ input, opts });
  });
}

export async function generatePlan(opts: PlanningOptions = {}): Promise<PlanningOutcome> {
  const input = await loadPlanningInput();
  if (typeof Worker === 'undefined') return planFromData(input, opts);
  try {
    return await runInWorker(input, opts);
  } catch {
    // A worker that fails to load (e.g. blocked by the environment) must not stop planning.
    return planFromData(input, opts);
  }
}
