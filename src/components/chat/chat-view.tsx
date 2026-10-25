import * as React from "react"
import { GenerationCard } from "./generation-card"
import { AgentSteps } from "@pro/agent/agent-steps"
import { MessageResponse } from "@/components/ai-elements/message"
import { ResultAudio } from "@/components/agent/result-audio"
import {
  Bot,
  User,
  Image as ImageIcon,
  Sparkles,
  Volume2,
} from "lucide-react"
import { ChatMessage } from "@/types"
import { Badge } from "@/components/ui/badge"
import { DetailMediaItem } from "@/components/media-vault/media-detail-modal"
import { HomeHeroSlider } from "./home-hero-slider"
import { FEED_BOTTOM_PAD } from "@/lib/ui/composer-dock"
import { GenerationMode } from "@/types"
import { BlankState } from "@/components/ui/blank-state"
import { AGENT_INTRO } from "@/components/create/mode-intro"

interface ChatViewProps {
  messages: ChatMessage[]
  isDark?: boolean
  onSelectSuggestion: (prompt: string, mode?: GenerationMode) => void
  onOpenDetail?: (item: DetailMediaItem) => void
  onOpenSettings?: (tab?: string) => void
  onRetry?: () => void
  isRightDocked?: boolean
  /** The agent has its own blank state; chat keeps the hero */
  kind?: "chat" | "agent"
}

export function ChatView({
  messages,
  isDark = true,
  onSelectSuggestion,
  onOpenDetail,
  onOpenSettings,
  onRetry,
  kind = "chat",
}: ChatViewProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    // An empty chat shows its blank state from the top; only a conversation follows its newest message
    if (scrollRef.current) {
      scrollRef.current.scrollTop = messages.length > 0 ? scrollRef.current.scrollHeight : 0
    }
  }, [messages])

  return (
    <div className="ai-scope relative h-full w-full flex flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-4 md:px-8 lg:px-12" style={FEED_BOTTOM_PAD}>
        {/* EMPTY STATE: the agent's blank state, or the "Universal Imagination" hero + drag slider in chat */}
        {messages.length === 0 && kind === "agent" ? (
          <BlankState {...AGENT_INTRO} />
        ) : messages.length === 0 ? (
          <div className="max-w-5xl mx-auto flex flex-col items-center justify-center min-h-96">
            <HomeHeroSlider
              isDark={isDark}
              onSelectPrompt={onSelectSuggestion}
            />
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">

          {/* MESSAGE LIST */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 animate-fade-in ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-secondary text-foreground text-xs mt-1 border border-border/40">
                  <Bot className="h-3.5 w-3.5" />
                </div>
              )}

              <div
                className={`max-w-2xl rounded-2xl p-4 border ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "bg-card text-card-foreground border-border w-full"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`text-xs font-semibold ${
                      msg.role === "user" ? "text-primary-foreground" : "text-foreground"
                    }`}
                  >
                    {msg.role === "user" ? "You" : msg.plain ? "Studio" : "Studio"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {msg.createdAt}
                  </span>
                </div>

                {msg.content &&
                  (msg.role === "assistant" ? (
                    <MessageResponse>{msg.content}</MessageResponse>
                  ) : (
                    <div className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                  ))}

                {msg.steps && <AgentSteps steps={msg.steps} assets={msg.assets} onOpen={(a) => onOpenDetail?.({ id: a.id, title: a.title, type: a.type, url: a.url, thumbnailUrl: a.thumbnailUrl, prompt: a.prompt, model: a.model, aspectRatio: a.aspectRatio, status: "completed", activity: "generated", authorName: "You", createdAt: a.createdAt })} />}
                {msg.job && <GenerationCard job={msg.job} runId={msg.id} onOpenSettings={() => onOpenSettings?.("providers")} onRetry={onRetry} />}

                {/* Character Reference Card */}
                {msg.characterRef && (
                  <div
                    onClick={() =>
                      onOpenDetail?.({
                        id: msg.characterRef!.id,
                        title: msg.characterRef!.name,
                        type: "image",
                        url: msg.characterRef!.imageUrl,
                        thumbnailUrl: msg.characterRef!.imageUrl,
                        prompt: `Use @${msg.characterRef!.name} as character anchor. Hair: ${msg.characterRef!.extractedAttributes.hair}. Outfit: ${msg.characterRef!.extractedAttributes.outfit}.`,
                        model: "Seedance 2.5 Pro",
                        quality: "720p",
                        bitrate: "High",
                        size: "1024x1024",
                        status: "completed",
                        activity: "generated",
                        authorName: "kdraval",
                        createdAt: msg.createdAt,
                      })
                    }
                    className="mt-3 p-3 rounded-xl bg-secondary/60 border border-border/60 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-foreground">
                        {msg.characterRef.name}
                      </span>
                      <Badge variant="zinc" className="text-xs">Identity Locked</Badge>
                    </div>

                    <div className="flex gap-3 items-center">
                      <img
                        src={msg.characterRef.imageUrl}
                        alt="Character"
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <div>
                          <strong className="text-foreground">Hair:</strong>{" "}
                          {msg.characterRef.extractedAttributes.hair}
                        </div>
                        <div>
                          <strong className="text-foreground">Outfit:</strong>{" "}
                          {msg.characterRef.extractedAttributes.outfit}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Audio Track Preview Card */}
                {msg.audio && (
                  <div className="mt-3 p-3 rounded-xl bg-secondary/50 border border-border/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Volume2 className="h-3.5 w-3.5 text-foreground" />
                        <span className="text-xs font-semibold text-foreground">
                          {msg.audio.title}
                        </span>
                      </div>
                    </div>
                    {msg.audio.url && <ResultAudio src={msg.audio.url} />}
                  </div>
                )}

                {/* Multi-Batch Image Gallery */}
                {msg.images && msg.images.length > 0 && (
                  <div className="mt-3.5 space-y-2">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <ImageIcon className="h-3 w-3" />
                      <span>Batch Images ({msg.images.length})</span>
                    </span>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {msg.images.map((img) => (
                        <div
                          key={img.id}
                          className="group relative aspect-square rounded-lg overflow-hidden bg-secondary border border-border/40 cursor-pointer"
                          onClick={() =>
                            onOpenDetail?.({
                              id: img.id,
                              title: img.title,
                              type: "image",
                              url: img.url,
                              thumbnailUrl: img.url,
                              prompt: img.prompt || msg.content,
                              model: img.model,
                              quality: "",
                              bitrate: "",
                              size: img.aspectRatio,
                              aspectRatio: img.aspectRatio,
                              status: "completed",
                              activity: "generated",
                              authorName: "You",
                              createdAt: msg.createdAt,
                            })
                          }
                        >
                          <img
                            src={img.url}
                            alt={img.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-background/60 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-foreground p-1 text-xs">
                            <Sparkles className="h-4 w-4" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {msg.role === "user" && (
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-secondary text-foreground text-xs mt-1 border border-border/40">
                  <User className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
  )
}
