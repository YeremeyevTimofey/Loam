import { cn } from '../lib/cn';

/** The mark (§12C.6): a slice of soil, three rounded bars. The top layer is the lime sprout; the soil darkens with depth. */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={cn('shrink-0', className)}>
      <rect x="2" y="4" width="20" height="4" rx="2" className="fill-accent" />
      <rect x="2" y="10" width="20" height="4" rx="2" className="fill-soil" />
      <rect x="2" y="16" width="20" height="4" rx="2" className="fill-ink" />
    </svg>
  );
}

export const Wordmark = ({ className }: { className?: string }) => (
  <span className={cn('inline-flex items-center gap-2.5 text-xl font-semibold tracking-[-0.025em] text-ink', className)}>
    <LogoMark />
    Loam
  </span>
);
