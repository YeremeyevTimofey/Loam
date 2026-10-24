import type { KbStore } from '@loam/core';
import { useState } from 'react';
import { DemoBanner } from './components/DemoBanner';
import { Header } from './components/Header';
import { SiteFooter } from './components/SiteFooter';
import { AppProvider, useApp } from './context';
import { Button } from './components/ui/button';
import { FsStore } from './store/FsStore';
import { requestFolderAccess } from './store/folder';
import { useRoute, type Route } from './nav';
import { HealthScreen } from './screens/Health';
import { OverviewScreen } from './screens/Overview';
import { ProcessScreen } from './screens/Process';
import { SkillsScreen } from './screens/Skills';
import { StartScreen } from './screens/Start';

function Shell({ route }: { route: Route }) {
  const { store, snap, loading, loadError, refresh, closeFolder } = useApp();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:p-3">
        Skip to content
      </a>
      {store.mode === 'demo' ? <DemoBanner /> : null}
      <Header route={route} />
      <main id="main" className="wide gutter py-8 md:py-12" aria-busy={loading}>
        {loadError ? (
          <div role="alert" className="measure rounded-md bg-danger-soft p-4 text-danger">
            <p>Loam could not read the folder: {loadError}</p>
            {store instanceof FsStore ? (
              <div className="mt-3 flex flex-wrap gap-2 text-ink">
                <Button
                  onClick={async () => {
                    if (await requestFolderAccess(store.handle)) await refresh();
                  }}
                >
                  Allow access again
                </Button>
                <Button variant="secondary" onClick={closeFolder}>
                  Choose another folder
                </Button>
              </div>
            ) : null}
          </div>
        ) : !snap ? (
          <p className="t-secondary">Reading your folder…</p>
        ) : route.screen === 'process' && route.process ? (
          <ProcessScreen slug={route.process} />
        ) : route.screen === 'skills' ? (
          <SkillsScreen />
        ) : route.screen === 'health' ? (
          <HealthScreen />
        ) : (
          <OverviewScreen />
        )}
      </main>
      <SiteFooter />
    </>
  );
}

export function App({ initialStore }: { initialStore: KbStore | null }) {
  const [store, setStore] = useState<KbStore | null>(initialStore);
  const [route, go] = useRoute();

  if (!store) return <StartScreen onOpen={setStore} />;
  return (
    <AppProvider
      store={store}
      go={go}
      closeFolder={() => {
        if (store.mode === 'demo') window.location.assign('/app');
        else {
          go({ screen: 'overview' });
          setStore(null);
        }
      }}
    >
      <Shell route={route} />
    </AppProvider>
  );
}
