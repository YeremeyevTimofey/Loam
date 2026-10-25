import { Folder, History, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context';
import type { Route } from '../nav';
import { Button } from './ui/button';
import { HistoryDialog } from './HistoryDialog';
import { Wordmark } from './Logo';
import { cn } from '../lib/cn';

const TABS: { label: string; route: Route }[] = [
  { label: 'Overview', route: { screen: 'overview' } },
  { label: 'Skills', route: { screen: 'skills' } },
  { label: 'Health', route: { screen: 'health' } },
];

export function Header({ route }: { route: Route }) {
  const { store, loading, refresh, go } = useApp();
  const [historyOpen, setHistoryOpen] = useState(false);
  const current = route.screen === 'process' ? 'overview' : route.screen;

  return (
    <header className="border-b border-line bg-bg">
      <div className="wide gutter flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
        <button type="button" onClick={() => go({ screen: 'overview' })} className="inline-flex h-11 items-center rounded-md" aria-label="Loam, go to the overview">
          <Wordmark />
        </button>
        <nav aria-label="Main" className="order-last flex w-full items-center gap-1 md:order-none md:w-auto">
          {TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => go(tab.route)}
              aria-current={current === tab.route.screen ? 'page' : undefined}
              className={cn(
                'inline-flex h-11 items-center rounded-md px-3 text-base font-medium transition-colors duration-150 ease-calm',
                current === tab.route.screen ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:text-ink',
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <span className="t-secondary hidden max-w-48 items-center gap-1 truncate sm:inline-flex" title={store.label}>
            <Folder size={16} aria-hidden />
            <span className="truncate">{store.label}</span>
          </span>
          <Button variant="ghost" onClick={() => void refresh()} aria-label="Refresh from the folder" title="Refresh from the folder">
            <RefreshCw size={20} aria-hidden className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button variant="ghost" onClick={() => setHistoryOpen(true)} aria-label="Change history" title="Change history">
            <History size={20} aria-hidden />
            <span className="hidden sm:inline">History</span>
          </Button>
        </div>
      </div>
      <HistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </header>
  );
}
