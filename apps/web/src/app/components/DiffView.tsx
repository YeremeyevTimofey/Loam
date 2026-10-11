import type { DiffLine } from '@loam/core';
import { cn } from '../lib/cn';

const MAX_LINES = 400;

/** §12C.4: monospace, additions on accent-soft, removals on danger-soft. The +/− markers carry the meaning too. */
export function DiffView({ lines }: { lines: DiffLine[] }) {
  const shown = lines.slice(0, MAX_LINES);
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface" role="group" aria-label="Changes">
      <pre className="m-0 min-w-full w-max text-[13px] leading-6">
        {shown.map((line, i) => (
          <div
            key={i}
            className={cn(
              'flex whitespace-pre-wrap break-words px-3',
              line.type === 'add' && 'bg-accent-soft',
              line.type === 'del' && 'bg-danger-soft',
              line.type === 'gap' && 'justify-center text-muted',
            )}
          >
            {line.type === 'gap' ? (
              <span>… {line.text} …</span>
            ) : (
              <>
                <span aria-hidden className="w-5 shrink-0 select-none text-muted">
                  {line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '}
                </span>
                <span className="sr-only">{line.type === 'add' ? 'Added: ' : line.type === 'del' ? 'Removed: ' : ''}</span>
                <span className="min-w-0 flex-1">{line.text || ' '}</span>
              </>
            )}
          </div>
        ))}
        {lines.length > MAX_LINES ? <div className="px-3 text-muted">… {lines.length - MAX_LINES} more lines …</div> : null}
      </pre>
    </div>
  );
}
