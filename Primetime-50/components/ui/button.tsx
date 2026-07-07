import Link from "next/link";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] text-base font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary px-4 py-2.5 text-primary-foreground hover:bg-primary/92",
        secondary: "bg-secondary px-4 py-2.5 text-secondary-foreground hover:bg-secondary/88",
        outline: "border bg-background px-4 py-2.5 hover:bg-muted",
        outlineOnDark: "border border-white/35 px-4 py-2.5 text-white hover:bg-white/10",
        ghost: "px-3 py-2 hover:bg-muted"
      },
      size: {
        default: "min-h-11",
        lg: "min-h-12 px-5 text-lg",
        icon: "h-11 w-11 p-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { buttonVariants };
