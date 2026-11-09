import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** A row or grid of choices where one is chosen (a style, a direction, a colour group): the chosen one has the select colour edge */
export function ChoiceChips({ options, value, onChange, columns = "grid-cols-2", className }: { options: string[]; value: string; onChange: (v: string) => void; columns?: string; className?: string }) {
  return (
    <div role="radiogroup" className={cn("grid gap-1.5", columns, className)}>
      {options.map((o) => (
        <Button key={o} type="button" role="radio" aria-checked={value === o} variant="outline" size="sm" className={cn("h-8 px-2 text-xs font-normal", value === o && "border-select bg-secondary font-medium")} onClick={() => onChange(o)}>
          {o}
        </Button>
      ))}
    </div>
  )
}
