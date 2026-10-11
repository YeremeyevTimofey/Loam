import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/** §12C.4: surface, 1px border, 8px radius, no shadow. Padding 16px on phones, 24px on desktop. */
export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-lg border border-line bg-surface p-4 md:p-6', className)} {...props} />
);
