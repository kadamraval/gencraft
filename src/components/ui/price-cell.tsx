import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useMoney } from "@/lib/currency/currency"
import { standardRun } from "@/lib/registry/price"
import type { ModelPrice, ModelRecord, AppCategory } from "@/lib/registry/types"

/**
 * One price, written so it cannot be misread.
 *  - A language model is billed twice, for what goes in and what comes out, per million tokens: two labelled lines.
 *  - An image model billed per image token: the figure with what it counts underneath.
 *  - Everything else (per image, per second, per run) is one short figure.
 */
export function PriceCell({ price, category, model }: { price: ModelPrice; category?: AppCategory; /** With the model, a picture, clip or voice shows what a standard run costs */ model?: ModelRecord }) {
  const money = useMoney()
  const label = "mr-1 text-[10px] text-muted-foreground/60"
  // The figure reads first; what it counts sits small underneath
  const box = "flex flex-shrink-0 flex-col items-end gap-0.5 text-xs font-medium leading-none tabular-nums text-foreground/90"

  // What most people make, not the cheapest tier's unit rate: "$0.50" over "5 s · 1080p"
  if (model && model.category !== "text") {
    const { estimate, label: run } = standardRun(model)
    if (estimate.usd !== null) {
      const words = `${estimate.upTo ? "up to " : ""}${estimate.from ? "from " : ""}`
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={box}>
              <span>
                {words}
                {money.format(estimate.usd)}
              </span>
              {run && <span className="text-[10px] font-normal text-muted-foreground/70">{run}</span>}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            A standard run: {run || "one run"}. {estimate.breakdown ? `${estimate.breakdown}. ` : ""}The price changes with your settings{estimate.approximate ? " and is an estimate" : ""}.
          </TooltipContent>
        </Tooltip>
      )
    }
  }

  if (price.unit === "per_1m_tokens" && price.amount !== null && category === "image") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={box}>
            <span>{money.token(price.amount)}</span>
            <span className="text-[10px] font-normal text-muted-foreground/70">per 1M img tokens</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>Billed per million image tokens. The cost of one image depends on its size and quality.</TooltipContent>
      </Tooltip>
    )
  }

  if (price.unit === "per_1m_tokens" && price.amount !== null && price.outputAmount !== undefined) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={box}>
            <span>
              <span className={label}>in</span>
              {money.token(price.amount)}
            </span>
            <span>
              <span className={label}>out</span>
              {money.token(price.outputAmount)}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Per 1 million tokens. Input {money.token(price.amount)}, output {money.token(price.outputAmount)}.
        </TooltipContent>
      </Tooltip>
    )
  }

  // Billed by the token for audio or video, with no weight known for one clip: say what the number counts
  if (price.unit === "per_1m_tokens" && price.amount !== null && category !== "text") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={box}>
            <span>{money.token(price.amount)}</span>
            <span className="text-[10px] font-normal text-muted-foreground/70">per 1M tokens</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>Billed per million tokens. What one clip costs depends on its length and text.</TooltipContent>
      </Tooltip>
    )
  }

  return <span className="flex-shrink-0 text-xs font-medium tabular-nums text-foreground/90">{money.short(price) ?? "—"}</span>
}
