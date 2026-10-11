import { cn } from '../lib/cn';

/** The mark (§12C.6): a slice of soil, three rounded bars, lighter on top. Colour comes from the accent token. */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={cn('shrink-0 text-accent', className)}>
      <rect x="2" y="4" width="20" height="4" rx="2" fill="currentColor" fillOpacity="0.4" />
      <rect x="2" y="10" width="20" height="4" rx="2" fill="currentColor" fillOpacity="0.7" />
      <rect x="2" y="16" width="20" height="4" rx="2" fill="currentColor" />
    </svg>
  );
}

export const Wordmark = ({ className }: { className?: string }) => (
  <span className={cn('inline-flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-ink', className)}>
    <LogoMark />
    Loam
  </span>
);
