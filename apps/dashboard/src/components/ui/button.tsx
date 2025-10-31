import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  asChild?: boolean;
  children?: React.ReactNode;
}

const buttonVariants = {
  default: 'bg-primary text-primary-foreground shadow-apple hover:bg-primary/90 hover:shadow-apple-lg active:scale-[0.98] transition-all duration-200',
  destructive: 'bg-destructive text-destructive-foreground shadow-apple-sm hover:bg-destructive/90 hover:shadow-apple active:scale-[0.98] transition-all duration-200',
  outline: 'border-2 border-primary/20 bg-background shadow-apple-sm hover:bg-primary/10 hover:border-primary/30 hover:shadow-apple active:scale-[0.98] transition-all duration-200',
  secondary: 'bg-secondary text-secondary-foreground shadow-apple-sm hover:bg-secondary/80 hover:shadow-apple active:scale-[0.98] transition-all duration-200',
  ghost: 'hover:bg-accent/20 hover:text-accent-foreground active:scale-[0.98] transition-all duration-200',
  link: 'text-primary underline-offset-4 hover:underline active:scale-[0.98] transition-all duration-200',
};

const buttonSizes = {
  default: 'h-10 px-5 py-2.5',
  sm: 'h-8 px-3 text-xs',
  lg: 'h-12 px-8 text-base',
  icon: 'h-10 w-10',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'default', asChild = false, ...props }, ref) => {
    const Comp = asChild ? 'span' : 'button';
    return (
      <Comp
        className={`inline-flex items-center justify-center rounded-apple text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
        ref={ref as any}
        {...(asChild ? {} : props)}
      >
        {props.children}
      </Comp>
    );
  }
);
Button.displayName = 'Button';