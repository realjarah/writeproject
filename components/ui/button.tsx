import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed select-none",
          variant === "default"     && "bg-black/[0.88] text-white dark:bg-white dark:text-black rounded-xl hover:bg-black/75 dark:hover:bg-white/90 active:scale-[0.98]",
          variant === "ghost"       && "text-black/50 dark:text-white/50 hover:text-black/80 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.06] rounded-xl",
          variant === "outline"     && "border border-black/[0.12] dark:border-white/[0.12] text-black/60 dark:text-white/60 hover:border-black/25 dark:hover:border-white/25 hover:text-black/90 dark:hover:text-white rounded-xl",
          variant === "destructive" && "text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-500/10 dark:hover:bg-red-400/10 rounded-xl",
          size === "default" && "h-10 px-5 text-sm",
          size === "sm"      && "h-8 px-3 text-xs",
          size === "lg"      && "h-11 px-6 text-sm",
          size === "icon"    && "h-8 w-8",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
