import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

export const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-xs font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95 shadow-xs",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/90",
        ghost:
          "text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-secondary/90",
        // A composer control: a soft fill, a quiet border that never changes. Pressed, open or hovered only changes the fill.
        pill:
          "border border-border/50 bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-secondary aria-pressed:bg-accent aria-pressed:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground",
        subtle:
          "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive shadow-xs",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-secondary hover:text-foreground active:bg-secondary/90",
        link:
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3 py-1.5",
        sm: "h-7 rounded-md px-2.5 text-xs",
        lg: "h-9 rounded-lg px-4 text-xs",
        icon: "h-8 w-8 rounded-lg",
        iconSm: "h-7 w-7 rounded-md",
        "icon-sm": "h-7 w-7 rounded-md",
        chip: "h-8 gap-1.5 rounded-full px-3 text-xs",
        chipIcon: "h-8 w-8 rounded-full p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render the child element (a link, say) with the button's look */
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"
