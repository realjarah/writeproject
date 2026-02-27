import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.09] dark:border-white/[0.08] rounded-xl px-4 py-3 text-sm text-black/85 dark:text-white placeholder-black/30 dark:placeholder-white/25 focus:outline-none focus:border-black/[0.22] dark:focus:border-white/[0.22] transition-colors duration-150",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
