import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  /** Fully rounded (pill) shape, like the landing page buttons */
  pill?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', pill = false, ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"

    const variants = {
      default: "cs-primary text-white",
      secondary: "bg-brand-soft text-brand-deep hover:bg-[#dbe7ff]",
      destructive: "bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-600",
      outline: "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50",
      ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
      link: "text-brand underline-offset-4 hover:underline"
    }

    const sizes = {
      default: "h-10 px-4 text-sm",
      sm: "h-8 px-3 text-xs",
      lg: "h-12 px-6 text-base",
      icon: "h-10 w-10"
    }

    return (
      <button
        className={cn(baseStyles, pill ? "rounded-full" : "rounded-xl", variants[variant], sizes[size], className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }