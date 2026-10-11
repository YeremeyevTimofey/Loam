import { effectiveChanges, type HistoryEntry, type Plan } from '@loam/core';
import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '../context';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The change log (§12B): every saved copy in .loam/history, newest first, with a restore that shows a diff first. */
export function HistoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { store, propose } = useApp();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setEntries(null);
    void store.listHistory().then(setEntries);
  }, [open, store]);

  const restore = async (entry: HistoryEntry) => {
    const old = await store.readFile(entry.path);
    const current = (await store.exists(entry.originalPath)) ? await store.readFile(entry.originalPath) : null;
    const plan: Plan = {
      changes: effectiveChanges([{ path: entry.originalPath, before: current, after: old, reason: `Go back to the version from ${when(entry.timestamp)}` }]),
      audit: [],
      notes: [],
    };
    if (plan.changes.length === 0) {
      setEntries(await store.listHistory());
      return;
    }
    onOpenChange(false);
    await propose(plan, { title: 'Restore an earlier version', description: 'The version you have now is kept in history too, so you can undo this.', applyLabel: 'Restore' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change history</DialogTitle>
          <DialogDescription>Before Loam changes a file, it keeps a copy of the old version. Pick one to go back to it.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {entries === null ? (
            <p className="t-secondary">Reading the history…</p>
          ) : entries.length === 0 ? (
            <p className="t-secondary">Nothing here yet. Once you change a file, the version before the change shows up here.</p>
          ) : (
            <>
              <Button className="mb-4" onClick={() => void restore(entries[0]!)}>
                <RotateCcw size={20} aria-hidden /> Undo the last change
              </Button>
              <ul className="divide-y divide-line">
                {entries.slice(0, 60).map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="break-all text-[15px] font-medium">{entry.originalPath}</div>
                      <div className="t-secondary">Version from before the change at {when(entry.timestamp)}</div>
                    </div>
                    <Button variant="secondary" onClick={() => void restore(entry)}>
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
              {entries.length > 60 ? <p className="t-secondary mt-3">Showing the 60 most recent of {entries.length}.</p> : null}
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
