import { Context, ContextContent, ContextContentBody, ContextContentFooter, ContextContentHeader, ContextInputUsage, ContextOutputUsage, ContextTrigger } from "@/components/ai-elements/context"
import { contextUsage } from "@/lib/chat/usage"

/**
 * How full the model's context window is, with the tokens each side used. AI Elements' Context, fed from the usage each
 * reply carries. Shows nothing until a reply has reported its use.
 */
export function TokenContext({ messages, maxTokens, modelId }: { messages: Array<{ role: string; metadata?: unknown }>; maxTokens: number; modelId?: string }) {
  const { usedTokens, usage } = contextUsage(messages)
  if (usedTokens === 0 || maxTokens <= 0) return null
  return (
    <Context maxTokens={maxTokens} modelId={modelId} usage={usage} usedTokens={usedTokens}>
      <ContextTrigger />
      <ContextContent>
        <ContextContentHeader />
        <ContextContentBody>
          <ContextInputUsage />
          <ContextOutputUsage />
        </ContextContentBody>
        <ContextContentFooter />
      </ContextContent>
    </Context>
  )
}
