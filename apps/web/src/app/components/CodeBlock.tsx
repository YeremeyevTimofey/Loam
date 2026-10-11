import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { copyText } from '../lib/clipboard';
import { Button } from './ui/button';

/** A block of text to copy: a command or the content of a config file. Monospace is for exactly this. */
export function CodeBlock({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyText(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <pre className="m-0 max-h-[28rem] overflow-auto whitespace-pre-wrap break-all p-3 text-[13px] leading-6" tabIndex={0} aria-label={label}>
        {text}
      </pre>
      <div className="flex justify-end border-t border-line p-1">
        <Button variant="ghost" onClick={copy} aria-label={`Copy: ${label}`}>
          {copied ? <Check size={20} aria-hidden /> : <Copy size={20} aria-hidden />}
          <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
        </Button>
      </div>
    </div>
  );
}
