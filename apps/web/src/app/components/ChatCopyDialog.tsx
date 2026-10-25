import {
  buildProcessChatBundle,
  buildSkillChatBundle,
  chatNotices,
  CHAT_TOKENS_WARN,
  defaultSelection,
  renderChatText,
  type ChatBundle,
} from '@loam/core';
import { Check, Copy, Download, Info, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context';
import { copyText } from '../lib/clipboard';
import { cn } from '../lib/cn';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

export type ChatTarget = { kind: 'process'; slug: string } | { kind: 'skill'; name: string };

type Counter = (text: string) => number;
const fmt = (n: number) => n.toLocaleString('en-GB');

/** Starts the browser's own "save file" for text we hold in memory. Nothing is requested from anywhere. */
function saveAsFile(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * "Copy for any chat": one process or skill as a piece of text for a chat that cannot run Loam (ChatGPT, Gemini or
 * claude.ai in a browser). The person sees exactly what will be copied, ticks what to include, and sees the size.
 * Read-only: nothing is written to the folder.
 */
export function ChatCopyDialog({ target, onClose }: { target: ChatTarget | null; onClose: () => void }) {
  const { store, today } = useApp();
  const [bundle, setBundle] = useState<ChatBundle | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [count, setCount] = useState<{ fn: Counter } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setBundle(null);
    setError(null);
    setCopied(false);
    setCopyFailed(false);
    if (!target) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = target.kind === 'process' ? await buildProcessChatBundle(store, target.slug, today) : await buildSkillChatBundle(store, target.name, today);
        // The tokenizer is a separate chunk: only loaded when someone opens this dialog.
        const { countTokens } = await import('@loam/core/tokens');
        if (cancelled) return;
        setCount({ fn: countTokens });
        setSelected(new Set(defaultSelection(next)));
        setBundle(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'The text could not be prepared.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target, store, today]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const text = useMemo(() => (bundle ? renderChatText(bundle, selected) : ''), [bundle, selected]);
  const notices = useMemo(() => (bundle ? chatNotices(bundle, selected) : []), [bundle, selected]);
  const partTokens = useMemo(() => (bundle && count ? new Map(bundle.parts.map((p) => [p.id, count.fn(p.text)])) : new Map<string, number>()), [bundle, count]);
  const tokens = useMemo(() => (count && text ? count.fn(text) : 0), [count, text]);
  const hasSecret = notices.some((n) => n.code === 'secret');
  const long = tokens > CHAT_TOKENS_WARN;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const copy = async () => {
    const ok = await copyText(text);
    setCopyFailed(!ok);
    setCopied(ok);
    window.clearTimeout(timer.current);
    if (ok) timer.current = window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Copy for any chat</DialogTitle>
          <DialogDescription>
            {bundle ? `“${bundle.title}” as text to paste into ChatGPT, Gemini, claude.ai or any chat.` : 'Text to paste into ChatGPT, Gemini, claude.ai or any chat.'} It carries your context, so the chat works your way. It is a copy: nothing is saved back.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {error ? (
            <p role="alert" className="rounded-md bg-danger-soft p-3 text-[15px] text-danger">
              {error}
            </p>
          ) : null}
          {!bundle && !error ? <p className="t-secondary">Preparing the text…</p> : null}

          {bundle ? (
            <>
              <fieldset>
                <legend className="mb-2 block text-[15px] font-medium">What to include</legend>
                <ul className="space-y-1">
                  {bundle.parts.map((p) => {
                    const on = p.required || selected.has(p.id);
                    const n = partTokens.get(p.id);
                    return (
                      <li key={p.id}>
                        <label className={cn('flex min-h-11 items-start gap-3 rounded-md border px-3 py-2', p.required ? 'border-line bg-bg' : 'cursor-pointer border-line hover:bg-bg', on && !p.required && 'border-accent-ink bg-accent-soft')}>
                          <input type="checkbox" checked={on} disabled={p.required} onChange={() => toggle(p.id)} className="mt-1 size-4 shrink-0 accent-[var(--accent-ink)]" aria-describedby={p.hint ? `part-hint-${p.id}` : undefined} />
                          <span className="min-w-0 flex-1">
                            <span className="block break-words font-medium">{p.label}</span>
                            {p.hint ? (
                              <span id={`part-hint-${p.id}`} className="t-secondary block">
                                {p.hint}
                              </span>
                            ) : null}
                          </span>
                          {n !== undefined ? <span className="t-secondary shrink-0 tabular-nums">{fmt(n)} tokens</span> : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>

              <div aria-live="polite" className={cn('flex flex-wrap items-baseline gap-x-3 rounded-md px-3 py-2', long ? 'bg-warning-soft text-warning-ink' : 'bg-bg')}>
                <span className="font-medium tabular-nums">About {fmt(tokens)} tokens</span>
                <span className="text-[15px]">
                  {long ? 'That is long. Some chats cut long text or use up their limit fast: untick what you do not need, or attach the file instead.' : 'Fine for any chat.'}
                </span>
              </div>

              <ul className="space-y-2" aria-label="Before you paste">
                {notices.map((n) => (
                  <li key={n.text}>
                    <div role={n.tone === 'warning' ? 'alert' : undefined} className={cn('flex gap-2 rounded-md p-3 text-[15px]', n.tone === 'warning' ? 'bg-warning-soft text-warning-ink' : 'border border-line bg-bg')}>
                      {n.tone === 'warning' ? <TriangleAlert size={20} className="shrink-0" aria-hidden /> : <Info size={20} className="shrink-0" aria-hidden />}
                      <span>{n.text}</span>
                    </div>
                  </li>
                ))}
                <li>
                  <div className="flex gap-2 rounded-md border border-line bg-bg p-3 text-[15px]">
                    <Info size={20} className="shrink-0" aria-hidden />
                    <span>Loam sends nothing anywhere. When you paste this text, it goes to that chat’s service, so read it first.</span>
                  </div>
                </li>
              </ul>

              <div>
                <h3 id="chat-preview-h" className="mb-2 text-[15px] font-medium">
                  Exactly what will be copied
                </h3>
                <pre role="region" tabIndex={0} aria-labelledby="chat-preview-h" className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-bg p-3 text-[15px]">
                  {text}
                </pre>
              </div>

              <p className="t-secondary">
                How to use it: open a new chat, paste this, then type your request. For work you repeat, save it once as the instructions of a Project (claude.ai, ChatGPT) or a Gem (Gemini).
              </p>
              {copyFailed ? (
                <p role="alert" className="rounded-md bg-warning-soft p-3 text-[15px] text-warning-ink">
                  Your browser did not allow copying. Use “Download .md” instead, or select the text above and copy it yourself.
                </p>
              ) : null}
            </>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" disabled={!bundle} onClick={() => bundle && saveAsFile(bundle.filename, text)}>
            <Download size={20} aria-hidden /> Download .md
          </Button>
          <Button disabled={!bundle} onClick={() => void copy()}>
            {copied ? <Check size={20} aria-hidden /> : <Copy size={20} aria-hidden />}
            <span aria-live="polite">{copied ? 'Copied' : hasSecret ? 'Copy anyway' : 'Copy text'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
