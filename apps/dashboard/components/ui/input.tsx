import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-xl border border-[var(--line)] bg-[rgba(8,16,31,0.6)] px-3.5 py-2 text-sm text-foreground transition-colors placeholder:text-[#5f6f92] hover:border-[var(--line-strong)] focus-visible:border-brand-cyan/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/20 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[80px] w-full rounded-xl border border-[var(--line)] bg-[rgba(8,16,31,0.6)] px-3.5 py-2.5 text-sm text-foreground transition-colors placeholder:text-[#5f6f92] hover:border-[var(--line-strong)] focus-visible:border-brand-cyan/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/20",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[13px] font-medium leading-none text-[#c2d1ef]", className)} {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
