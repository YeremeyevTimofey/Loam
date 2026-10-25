import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/** §12C.4: 44px high, 10px radius, no shadow, no gradient. A pressed button sinks by one pixel. */
export const buttonVariants = cva(
  'inline-flex h-11 min-w-11 shrink-0 items-center no-underline justify-center gap-2 whitespace-nowrap rounded-md px-4 text-base font-medium leading-none transition-[color,background-color,border-color,translate] duration-150 ease-calm active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent hover:bg-accent-hover',
        secondary: 'border border-line bg-surface text-ink hover:border-soil',
        ghost: 'px-2 text-accent-ink hover:underline underline-offset-4',
        danger: 'border border-line bg-transparent text-danger hover:bg-danger-soft',
      },
      size: { default: '', icon: 'w-11 px-0' },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...(asChild ? {} : { type: 'button' })} {...props} />;
});
Button.displayName = 'Button';
