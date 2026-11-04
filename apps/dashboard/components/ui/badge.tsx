import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", {
  variants: {
    variant: {
      default: "border-[var(--line-strong)] bg-[rgba(46,107,255,0.12)] text-[#bcd3ff]",
      secondary: "border-[var(--line)] bg-secondary text-secondary-foreground",
      outline: "border-[var(--line-strong)] text-foreground",
      high: "border-red-400/30 bg-red-500/10 text-red-300",
      medium: "border-amber-300/25 bg-amber-400/10 text-amber-200",
      // Landing .chip-live
      low: "border-[rgba(60,220,160,0.25)] bg-[rgba(60,220,160,0.1)] text-[#7cf5c4]",
      muted: "border-[var(--line)] bg-white/[0.03] text-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
