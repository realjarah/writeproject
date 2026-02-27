import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "error" | "warning" | "active";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
        variant === "default" && "bg-white/[0.07] text-white/50",
        variant === "success" && "bg-emerald-400/10 text-emerald-400",
        variant === "error"   && "bg-red-400/10 text-red-400",
        variant === "warning" && "bg-yellow-400/10 text-yellow-400",
        variant === "active"  && "bg-blue-400/10 text-blue-400",
        className
      )}
      {...props}
    />
  );
}
