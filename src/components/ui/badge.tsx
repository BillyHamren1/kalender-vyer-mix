import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-[hsl(var(--module-accent-base)/0.24)] bg-[hsl(var(--module-accent-soft))] text-[hsl(var(--module-accent))] hover:bg-[hsl(var(--module-accent-base)/0.16)]",
        active: "border-[hsl(var(--module-accent-base)/0.38)] bg-[hsl(var(--module-accent-soft))] text-[hsl(var(--module-accent))] shadow-[inset_3px_0_0_hsl(var(--module-accent))]",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        gradient: "operations-accent-gradient operations-gradient-shadow border-0 text-white",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
