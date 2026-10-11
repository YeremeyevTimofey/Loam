import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/** §12C.4: 22px high, 4px radius, 13px text. Status badges carry their meaning in words, not only colour. */
const badgeVariants = cva('inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-sm px-2 text-[13px] font-medium leading-none', {
  variants: {
    tone: {
      neutral: 'bg-accent-soft text-accent',
      success: 'bg-success-soft text-success-ink',
      warning: 'bg-warning-soft text-warning-ink',
      danger: 'bg-danger-soft text-danger',
      muted: 'border border-line text-muted',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, tone, ...props }: BadgeProps) => <span className={cn(badgeVariants({ tone }), className)} {...props} />;
