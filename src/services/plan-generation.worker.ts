// Web Worker entry: plans off the main thread so the UI stays responsive while the solver runs.
import { planFromData, type PlanningInput, type PlanningOptions } from './plan-generation';

self.onmessage = (event: MessageEvent<{ input: PlanningInput; opts: PlanningOptions }>) => {
  const { input, opts } = event.data;
  self.postMessage(planFromData(input, opts));
};
