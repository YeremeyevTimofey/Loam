import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { copyText } from '../lib/clipboard';
import { cn } from '../lib/cn';
import { Button } from './ui/button';

/** A line the person copies into their agent. Monospace is reserved for exactly this (§12C.2). */
export function CopyField({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyText(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };
  return (
    <div className={cn('flex flex-col gap-2 rounded-md border border-line bg-surface p-2 sm:flex-row sm:items-center', className)}>
      <code className="min-w-0 flex-1 break-words px-2 py-1">{text}</code>
      <Button variant="secondary" onClick={copy} aria-label={`${label}: ${text}`}>
        {copied ? <Check size={20} aria-hidden /> : <Copy size={20} aria-hidden />}
        <span aria-live="polite">{copied ? 'Copied' : label}</span>
      </Button>
    </div>
  );
}
