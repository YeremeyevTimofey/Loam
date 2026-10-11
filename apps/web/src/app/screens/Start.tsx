import { applyPlan, isKnowledgeBase, planScaffold, todayIso, type KbStore } from '@loam/core';
import { FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Wordmark } from '../components/Logo';
import { Button } from '../components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { FsStore } from '../store/FsStore';
import { describePickerError, folderAccess, forgetFolder, pickFolder, recallFolder, rememberFolder, requestFolderAccess, type Folder } from '../store/folder';

type Remembered = { handle: Folder; access: 'granted' | 'prompt' | 'denied' };

/** Screen 1 (§12B): choose the folder, or continue with the one used before. */
export function StartScreen({ onOpen }: { onOpen: (store: KbStore) => void }) {
  const [remembered, setRemembered] = useState<Remembered | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<FsStore | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const handle = await recallFolder();
      if (alive && handle) setRemembered({ handle, access: await folderAccess(handle) });
      if (alive) setChecked(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const finish = async (store: FsStore) => {
    await store.init();
    await applyPlan(store, await planScaffold(store, todayIso()));
    await rememberFolder(store.handle);
    onOpen(store);
  };

  const open = async (handle: Folder) => {
    setBusy(true);
    setError(null);
    try {
      const store = new FsStore(handle);
      if ((await isKnowledgeBase(store)) || (await store.isEmpty())) await finish(store);
      else setConfirm(store);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') {
        await forgetFolder();
        setRemembered(null);
        setError('That folder was moved or deleted. Choose it again.');
      } else setError(describePickerError(e));
    } finally {
      setBusy(false);
    }
  };

  const choose = async () => {
    setError(null);
    try {
      const handle = await pickFolder();
      if (handle) await open(handle);
    } catch (e) {
      setError(describePickerError(e));
    }
  };

  const continueWith = async () => {
    if (!remembered) return;
    if (remembered.access !== 'granted' && !(await requestFolderAccess(remembered.handle))) {
      setError('Loam needs permission to use that folder. Press the button again and choose Allow, or pick the folder again.');
      return;
    }
    await open(remembered.handle);
  };

  return (
    <main className="gutter flex min-h-screen flex-col py-6">
      <Wordmark className="mx-auto mb-10 w-full max-w-[var(--wide)] md:mb-16" />
      <div className="measure appear flex-1">
        <h1 className="t-h1 mb-4">Choose a folder for your knowledge base</h1>
        <p className="mb-3">
          Loam keeps what your AI assistant needs to know about your work in a folder on your computer. Pick an empty folder, or the one you used before, and Loam sets it up.
        </p>
        <p className="mb-3">Nothing is uploaded. This page has no server and no account; it only reads and writes the folder you choose.</p>
        <p className="mb-8">When you are done, you connect the folder to your agent and let it interview you about your day.</p>

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap">
          {remembered ? (
            <>
              <Button onClick={() => void continueWith()} disabled={busy}>
                <FolderOpen size={20} aria-hidden /> Continue with {remembered.handle.name}
              </Button>
              <Button variant="secondary" onClick={() => void choose()} disabled={busy}>
                Choose a different folder
              </Button>
            </>
          ) : (
            <Button onClick={() => void choose()} disabled={busy || !checked}>
              <FolderOpen size={20} aria-hidden /> Choose folder
            </Button>
          )}
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-md bg-danger-soft p-3 text-[15px] text-danger">
            {error}
          </p>
        ) : null}

        <p className="t-secondary mt-8">
          Works in Chrome and Edge on a computer. To connect your AI agent (Claude, Cursor, Codex, VS Code, Gemini and others) you also need that agent; the{' '}
          <a href="/install">install guide</a> shows how. Just looking?{' '}
          <a href="/app?demo=1">See a filled example instead</a>.
        </p>
      </div>

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This folder already has files</DialogTitle>
            <DialogDescription>It is not a Loam knowledge base yet.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="mb-3">
              Loam will add its own files here (README.md, AGENTS.md, profile.md and the folders processes, skills and context). It will not change or delete anything that is already in the folder.
            </p>
            <p className="t-secondary">If you would rather keep things separate, cancel and create a new folder, for example one called “Loam”.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                const store = confirm;
                if (!store) return;
                setBusy(true);
                try {
                  await finish(store);
                } catch (e) {
                  setError(describePickerError(e));
                  setConfirm(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Set up Loam here
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
