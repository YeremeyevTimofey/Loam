import { applyPlan } from '../src/plan';
import { planScaffold } from '../src/kb';
import type { KbStore } from '../src/types';

export async function ensureBase(store: KbStore, today: string): Promise<void> {
  await applyPlan(store, await planScaffold(store, today));
}
