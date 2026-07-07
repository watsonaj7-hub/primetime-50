import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "min-h-12 w-full rounded-[8px] border bg-white px-4 text-base shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
