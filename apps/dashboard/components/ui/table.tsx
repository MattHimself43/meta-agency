import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}
export const THead = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <thead {...p} className={cn("[&_tr]:border-b [&_tr]:border-[var(--line)] [&_tr:hover]:bg-transparent", p.className)} />;
export const TBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody {...p} className={cn("[&_tr:last-child]:border-0", p.className)} />;
export const TR = (p: React.HTMLAttributes<HTMLTableRowElement>) => <tr {...p} className={cn("border-b border-[var(--line)] transition-colors hover:bg-[rgba(46,107,255,0.06)]", p.className)} />;
export const TH = (p: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th {...p} className={cn("h-10 px-3 text-left align-middle font-display text-[11px] font-medium uppercase tracking-[0.14em] text-[#5f6f92]", p.className)} />
);
export const TD = (p: React.TdHTMLAttributes<HTMLTableCellElement>) => <td {...p} className={cn("p-3 align-middle", p.className)} />;
