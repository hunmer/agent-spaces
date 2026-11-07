import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const shinyBadgeVariants = cva(
  'inline-flex items-center rounded-full border text-xs font-semibold transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent',
        secondary: 'border-transparent',
        destructive: 'border-transparent',
        outline: 'text-foreground',
      },
      shiny: {
        true: 'relative overflow-hidden',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      shiny: false,
    },
  },
);

export interface ShinyBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof shinyBadgeVariants> {
  shiny?: boolean;
  shinySpeed?: number;
}

function ShinyBadge({
  className,
  variant,
  shiny = false,
  shinySpeed = 5,
  children,
  ...props
}: ShinyBadgeProps) {
  const animationDuration = `${shinySpeed}s`;

  return (
    <div
      className={cn(shinyBadgeVariants({ variant, shiny }), className)}
      {...props}
    >
      <span className={cn('inline-flex items-center', shiny && 'relative z-10')}>{children}</span>

      {shiny && (
        <span
          className="absolute inset-0 pointer-events-none animate-shine dark:hidden"
          style={{
            background:
              'linear-gradient(120deg, transparent 40%, rgba(255,255,255,0.6) 50%, transparent 60%)',
            backgroundSize: '200% 100%',
            animationDuration,
            mixBlendMode: 'screen',
          }}
        />
      )}

      {shiny && (
        <span
          className="absolute inset-0 pointer-events-none animate-shine hidden dark:block"
          style={{
            background:
              'linear-gradient(120deg, transparent 40%, rgba(0,0,150,0.25) 50%, transparent 60%)',
            backgroundSize: '200% 100%',
            animationDuration,
            mixBlendMode: 'multiply',
          }}
        />
      )}
    </div>
  );
}

export { ShinyBadge, shinyBadgeVariants };
