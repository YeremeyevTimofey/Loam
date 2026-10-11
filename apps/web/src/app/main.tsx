import './jitless'; // must stay first: it configures zod before any schema is created
import type { KbStore } from '@loam/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/app.css';
import { App } from './App';
import { UnsupportedScreen } from './screens/Unsupported';
import { supportsFolders } from './store/folder';

/**
 * One decision at the door: ?demo=1 → the in-memory sample base (works in any browser),
 * otherwise a real folder, which needs the File System Access API.
 */
async function boot(): Promise<KbStore | 'unsupported' | null> {
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === '1') {
    const { DemoStore } = await import('../demo-data');
    const store = new DemoStore();
    await store.init();
    return store;
  }
  if (!supportsFolders()) return 'unsupported';
  return null;
}

// No top-level await: with code splitting it can deadlock when a lazily loaded chunk imports from this entry.
const root = createRoot(document.getElementById('root')!);
void boot().then((booted) => {
  root.render(<StrictMode>{booted === 'unsupported' ? <UnsupportedScreen /> : <App initialStore={booted} />}</StrictMode>);
});

// After the first visit the app works without a connection (see the service worker in vite.config.ts).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
}
