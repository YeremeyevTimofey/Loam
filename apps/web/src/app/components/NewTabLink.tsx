import type { AnchorHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/**
 * A link out of the app (GitHub, mostly). It opens in a new tab so a folder that is open, or a demo with edits,
 * stays where it is. Only navigates: the app itself makes no request (see the Content-Security-Policy).
 * Standalone links get a 44 px target; `inline` is for a link inside a sentence, like the other text links.
 */
export function NewTabLink({ inline, className, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { inline?: boolean }) {
  return (
    <a target="_blank" rel="noopener noreferrer" className={cn(!inline && 'inline-flex min-h-11 items-center', className)} {...props}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
