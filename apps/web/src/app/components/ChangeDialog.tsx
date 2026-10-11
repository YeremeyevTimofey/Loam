import { changeKind, effectiveChanges, lineDiff, type Plan } from '@loam/core';
import { useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { DiffView } from './DiffView';

export interface ProposeOptions {
  title: string;
  description?: string;
  applyLabel?: string;
}

const KIND_LABEL = { create: 'New file', edit: 'Changed', delete: 'Deleted' } as const;
const KIND_TONE = { create: 'success', edit: 'neutral', delete: 'danger' } as const;

/** Every edit the app makes is shown here first: what will change, in plain lines, then Apply or Cancel. */
export function ChangeDialog({
  pending,
  onApply,
  onCancel,
}: {
  pending: { plan: Plan; options: ProposeOptions } | null;
  onApply: () => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changes = pending ? effectiveChanges(pending.plan.changes) : [];

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await onApply();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The change could not be saved.');
    } finally {
      setBusy(false);
    }
  };
  const cancel = () => {
    setError(null);
    onCancel();
  };

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && !busy && cancel()}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{pending?.options.title ?? 'Review changes'}</DialogTitle>
          <DialogDescription>
            {pending?.options.description ?? 'Nothing is saved until you press Apply. The old version is kept in your history.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {changes.map((change) => {
            const kind = changeKind(change);
            return (
              <section key={change.path} aria-label={change.path}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone={KIND_TONE[kind]}>{KIND_LABEL[kind]}</Badge>
                  <code className="break-all">{change.path}</code>
                </div>
                {change.reason ? <p className="t-secondary mb-2">{change.reason}</p> : null}
                <DiffView lines={lineDiff(change.before, change.after)} />
              </section>
            );
          })}
          {pending?.plan.notes.map((note) => (
            <p key={note} className="t-secondary">
              {note}
            </p>
          ))}
          {error ? (
            <p role="alert" className="rounded-md bg-danger-soft p-3 text-[15px] text-danger">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={cancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={busy}>
            {busy ? 'Saving…' : (pending?.options.applyLabel ?? 'Apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
