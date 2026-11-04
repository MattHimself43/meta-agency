import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Landing .btn-primary: blue→cyan gradient, dark text, glow
        default: "btn-grad",
        destructive: "border border-red-400/30 bg-red-500/10 text-red-200 hover:border-red-300/60 hover:bg-red-500/20",
        // Landing .btn-ghost: thin blue line, cyan on hover
        outline: "btn-ghost-line text-foreground",
        secondary: "border border-[var(--line)] bg-[rgba(46,107,255,0.12)] text-[#bcd3ff] hover:border-[var(--line-strong)] hover:bg-[rgba(46,107,255,0.2)]",
        ghost: "text-muted-foreground hover:bg-white/5 hover:text-foreground",
        link: "text-brand-cyan underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-9 px-4",
        xs: "h-7 px-3 text-xs",
        lg: "h-12 px-7 text-[15px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";
export { buttonVariants };
