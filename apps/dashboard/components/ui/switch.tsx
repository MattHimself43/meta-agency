import * as React from "react";
import { cn } from "@/lib/utils";

/** Accessible checkbox styled as a switch; works inside plain <form> server actions. */
export function Switch({ className, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <input
      type="checkbox"
      role="switch"
      className={cn(
        "relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full border border-[var(--line-strong)] bg-[rgba(8,16,31,0.8)] transition-all",
        "before:absolute before:left-[2px] before:top-[2px] before:h-[18px] before:w-[18px] before:rounded-full before:bg-[#93a4c6] before:transition-all",
        "checked:border-transparent checked:bg-[linear-gradient(100deg,#2e6bff,#5fe3ff)] checked:shadow-[0_0_16px_-4px_rgba(95,227,255,0.7)] checked:before:translate-x-5 checked:before:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
