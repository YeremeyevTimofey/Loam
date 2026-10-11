import {
  applyPlan,
  LoamError,
  loadKb,
  planSyncAgentSkills,
  todayIso,
  touchesSkills,
  type KbSnapshot,
  type KbStore,
  type Plan,
} from '@loam/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEMO_TODAY } from '../demo-data/today';
import { ChangeDialog, type ProposeOptions } from './components/ChangeDialog';
import type { Route } from './nav';

interface AppState {
  store: KbStore;
  today: string;
  snap: KbSnapshot | null;
  loading: boolean;
  loadError: string | null;
  refresh: () => Promise<void>;
  /** Shows the changes as a diff. Resolves true if the person pressed Apply, false on Cancel. */
  propose: (plan: Plan, options: ProposeOptions) => Promise<boolean>;
  go: (route: Route) => void;
  /** Leaves the current folder and returns to the Start screen. */
  closeFolder: () => void;
}

const Ctx = createContext<AppState | null>(null);

export const useApp = (): AppState => {
  const value = useContext(Ctx);
  if (!value) throw new Error('useApp must be used inside <AppProvider>');
  return value;
};

/** Runs a plan, then silently keeps the agent copies of the skills in step. */
export async function commitPlan(store: KbStore, plan: Plan): Promise<void> {
  await applyPlan(store, plan);
  if (touchesSkills(plan)) await applyPlan(store, await planSyncAgentSkills(store));
}

export function AppProvider({
  store,
  go,
  closeFolder,
  children,
}: {
  store: KbStore;
  go: (route: Route) => void;
  closeFolder: () => void;
  children: ReactNode;
}) {
  const today = store.mode === 'demo' ? DEMO_TODAY : todayIso();
  const [snap, setSnap] = useState<KbSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ plan: Plan; options: ProposeOptions; resolve: (applied: boolean) => void } | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const next = await loadKb(store, today);
      if (mine === seq.current) {
        setSnap(next);
        setLoadError(null);
      }
    } catch (error) {
      if (mine === seq.current) setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [store, today]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const propose = useCallback(
    (plan: Plan, options: ProposeOptions) =>
      new Promise<boolean>((resolve) => {
        if (plan.changes.length === 0) {
          resolve(false);
          return;
        }
        setPending({ plan, options, resolve });
      }),
    [],
  );

  const value = useMemo<AppState>(
    () => ({ store, today, snap, loading, loadError, refresh, propose, go, closeFolder }),
    [store, today, snap, loading, loadError, refresh, propose, go, closeFolder],
  );

  const finish = (applied: boolean) => {
    pending?.resolve(applied);
    setPending(null);
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <ChangeDialog
        pending={pending}
        onCancel={() => finish(false)}
        onApply={async () => {
          if (!pending) return;
          try {
            await commitPlan(store, pending.plan);
          } catch (error) {
            throw error instanceof LoamError ? error : new Error(error instanceof Error ? error.message : 'The change could not be saved.');
          }
          await refresh();
          finish(true);
        }}
      />
    </Ctx.Provider>
  );
}
