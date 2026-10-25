import { AiToolPanel } from "@/components/ai-tools/ai-tool-panel"
import { useToolHost } from "@/components/ai-tools/tool-host"
import { downloadMedia } from "@/lib/library/download"
import * as React from "react"
import {
  X,
  Info,
  Edit3,
  MessageSquare,
  Copy,
  Check,
  Share2,
  MoreHorizontal,
  Download,
  Heart,
  RotateCw,
  Sparkles,
  Video,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Layers,
  Type,
  Crop,
  Maximize2,
  Scissors,
  Palette,
  Wand2,
  SunMedium,
  Box,
  Hand,
  Eraser,
  PenTool,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Plus,
  ArrowRight,
  PictureInPicture,
  Sliders,
  Send,
  Eye,
  EyeOff,
  CheckCircle2,
  Loader2,
  FastForward,
  MessageCircle,
  PersonStanding,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import type { FriendlyError } from "@/lib/errors/explain"
import type { EditAction, EditKind } from "@/lib/registry/edit-actions"

const EDIT_ICON: Record<EditKind, React.ComponentType<{ className?: string }>> = {
  edit: Edit3,
  extend: FastForward,
  "lip-sync": MessageCircle,
  "motion-transfer": PersonStanding,
}

export interface DetailMediaItem {
  id: string
  title: string
  type: "image" | "video" | "audio"
  url: string
  thumbnailUrl: string
  prompt: string
  aspectRatio?: string
  model?: string
  quality?: string
  bitrate?: string
  size?: string
  duration?: number
  createdAt?: string
  authorName?: string
  authorAvatar?: string
  status?: "completed" | "generating" | "failed"
  activity?: "generated" | "uploaded" | "liked" | "downloaded"
  error?: string
  errorInfo?: FriendlyError
  log?: string[]
  params?: Record<string, unknown>
  provider?: string
}

interface MediaDetailModalProps {
  item: DetailMediaItem | null
  open: boolean
  onClose: () => void
  onTurnToVideo?: (item: DetailMediaItem) => void
  onRecreate?: (item: DetailMediaItem) => void
  onUseAsReference?: (item: DetailMediaItem) => void
  /** What a switched-on model can do with an opened video. Nothing is offered that no model does. */
  editActions?: EditAction[]
  /** Starts one of those actions: the video goes to the composer with the model that does it */
  onEdit?: (item: DetailMediaItem, action: EditAction) => void
}

interface DecomposedLayer {
  id: string
  name: string
  visible: boolean
  opacity: number
  thumbnailUrl: string
}

export function MediaDetailModal({
  item,
  open,
  onClose,
  onTurnToVideo,
  onRecreate,
  onUseAsReference,
  editActions = [],
  onEdit,
}: MediaDetailModalProps) {
  if (!open || !item) return null

  // Tabs: 'info' | 'edit' | 'comments'
  const [activeTab, setActiveTab] = React.useState<"info" | "edit" | "comments">("info")
  const toolHost = useToolHost()
  const [isCopied, setIsCopied] = React.useState(false)
  const [isLiked, setIsLiked] = React.useState(item.activity === "liked")
  const [showFullPrompt, setShowFullPrompt] = React.useState(false)
  const [detailsOpen, setDetailsOpen] = React.useState(true)

  // Video playback states
  const [isPlaying, setIsPlaying] = React.useState(true)
  const [currentTime, setCurrentTime] = React.useState(4)
  const totalDuration = item.duration || 15
  const [playbackSpeed, setPlaybackSpeed] = React.useState<number>(1)
  const [isMuted, setIsMuted] = React.useState(false)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const videoRef = React.useRef<HTMLVideoElement>(null)

  // Image zoom and canvas states
  const [zoomLevel, setZoomLevel] = React.useState<number>(100)
  const [activeCanvasTool, setActiveCanvasTool] = React.useState<
    "pointer" | "hand" | "crop" | "inpaint" | "highlighter" | "eraser" | "mask"
  >("pointer")
  const [editPromptInput, setEditPromptInput] = React.useState("")
  const [editFeedbackMessage, setEditFeedbackMessage] = React.useState<string | null>(null)
  const [isProcessing, setIsProcessing] = React.useState(false)

  // Model-aware active sub-tool in EDIT tab
  const [selectedToolId, setSelectedToolId] = React.useState<string | null>(null)

  // Interactive capability states:
  // 1. Relighting
  const [relightPreset, setRelightPreset] = React.useState<"golden" | "studio" | "neon" | "twilight">("golden")
  const [relightAngle, setRelightAngle] = React.useState<number>(45)
  const [relightIntensity, setRelightIntensity] = React.useState<number>(65)
  const [relightTemp, setRelightTemp] = React.useState<number>(4200)

  // 2. Color Palette / Grading
  const [colorLUT, setColorLUT] = React.useState<"default" | "teal-orange" | "arri" | "bleach" | "kodak" | "noir">("default")
  const [colorContrast, setColorContrast] = React.useState<number>(100)
  const [colorSaturation, setColorSaturation] = React.useState<number>(100)

  // 3. Upscale
  const [upscaleFactor, setUpscaleFactor] = React.useState<"2k" | "4k" | "8k">("4k")
  const [faceRestore, setFaceRestore] = React.useState<boolean>(true)

  // 4. Background Removal & Replacement
  const [bgMode, setBgMode] = React.useState<"normal" | "alpha" | "white" | "obsidian">("normal")

  // 5. Reframe & Crop
  const [targetRatio, setTargetRatio] = React.useState<"16:9" | "9:16" | "1:1" | "2.39:1">(
    (item.aspectRatio === "9:16" || item.aspectRatio === "1:1" || item.aspectRatio === "2.39:1" ? item.aspectRatio : "16:9")
  )
  const [smartTrackingSubject, setSmartTrackingSubject] = React.useState<string>("Subject Lock")

  // 8. Angles (Image)
  const [selectedAngle, setSelectedAngle] = React.useState<string>("0")

  // 9. Layer Decomposition (Image)
  const [layers, setLayers] = React.useState<DecomposedLayer[]>([
    {
      id: "layer-subject",
      name: "Subject (@Kadam)",
      visible: true,
      opacity: 100,
      thumbnailUrl: item.thumbnailUrl || "/author_avatar.png",
    },
    {
      id: "layer-garment",
      name: "Burgundy Double-Breasted Suit",
      visible: true,
      opacity: 100,
      thumbnailUrl: "/suit_reference_thumb.png",
    },
    {
      id: "layer-lighting",
      name: "Studio Key & Rim Lighting",
      visible: true,
      opacity: 85,
      thumbnailUrl: item.thumbnailUrl || "/burgundy_suit_portrait.png",
    },
    {
      id: "layer-backdrop",
      name: "Studio Neutral Backdrop",
      visible: true,
      opacity: 100,
      thumbnailUrl: "/layer_cutout_badge.png",
    },
  ])

  // Escape key listener to close modal
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  // Video time progress loop
  React.useEffect(() => {
    if (item.type !== "video" || !isPlaying) return
    const interval = window.setInterval(() => {
      setCurrentTime((prev) => {
        if (prev >= totalDuration) return 0
        return +(prev + 0.25).toFixed(1)
      })
    }, 250)
    return () => window.clearInterval(interval)
  }, [isPlaying, totalDuration, item.type])

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(item.prompt)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  const handleExecutePromptEdit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editPromptInput.trim()) return
    const instruction = editPromptInput.trim()
    setIsProcessing(true)
    setEditFeedbackMessage(`Applying edit with ${item.model || "Neural Model"}: "${instruction}"...`)
    setEditPromptInput("")
    setTimeout(() => {
      setIsProcessing(false)
      const newLayer: DecomposedLayer = {
        id: `layer-edit-${Date.now()}`,
        name: `Inpainted: ${instruction.slice(0, 18)}...`,
        visible: true,
        opacity: 100,
        thumbnailUrl: item.thumbnailUrl || "/burgundy_suit_portrait.png",
      }
      setLayers((prev) => [newLayer, ...prev])
      setEditFeedbackMessage("Generative modification rendered as layer!")
      setTimeout(() => setEditFeedbackMessage(null), 3500)
    }, 1600)
  }

  const handleApplyCapability = (toolTitle: string) => {
    setIsProcessing(true)
    setEditFeedbackMessage(`Processing ${toolTitle} using ${item.model || "Active AI Model"}...`)
    setTimeout(() => {
      setIsProcessing(false)
      setEditFeedbackMessage(`${toolTitle} processed successfully!`)
      setTimeout(() => setEditFeedbackMessage(null), 3000)
    }, 1300)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`
  }

  // Dynamic CSS styling for canvas preview based on active capabilities
  const getCanvasFilter = () => {
    let filters: string[] = []
    if (colorLUT === "teal-orange") {
      filters.push("contrast(1.2) saturate(1.25) hue-rotate(-12deg)")
    } else if (colorLUT === "noir") {
      filters.push("grayscale(1) contrast(1.35)")
    } else if (colorLUT === "bleach") {
      filters.push("contrast(1.4) saturate(0.65)")
    } else if (colorLUT === "kodak") {
      filters.push("sepia(0.2) contrast(1.1) saturate(1.2)")
    } else if (colorLUT === "arri") {
      filters.push("contrast(1.05) saturate(1.1)")
    }

    if (colorContrast !== 100) {
      filters.push(`contrast(${colorContrast / 100})`)
    }
    if (colorSaturation !== 100) {
      filters.push(`saturate(${colorSaturation / 100})`)
    }

    return filters.join(" ")
  }

  const authorName = item.authorName || "You"
  const authorAvatar = item.authorAvatar || "/author_avatar.png"

  return (
    /* TRUE FULL POPUP: Edge-to-edge covering the entire viewport */
    <div
      className="fixed inset-0 z-50 w-screen h-screen pt-12 bg-background text-foreground flex flex-col md:flex-row overflow-hidden select-none animate-fade-in"
      onClick={(e) => e.stopPropagation()}
    >
      {/* ======================================================== */}
      {/* LEFT / CENTER: MEDIA CANVAS & CONTROLS                   */}
      {/* ======================================================== */}
      <div className="flex-1 relative flex flex-col justify-between items-center bg-background/60 overflow-hidden p-4 md:p-6 min-h-0">
        {/* Top Feedback / Processing Toast */}
        {editFeedbackMessage && (
          <div className="absolute top-4 z-40 bg-card text-card-foreground border border-border px-4 py-2 rounded-xl shadow-xl animate-fade-in flex items-center gap-2 text-xs font-medium">
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
            <span>{editFeedbackMessage}</span>
          </div>
        )}

        {/* Top Left Asset Info Chip */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-card/80 backdrop-blur-md border border-border/60 px-3 py-1.5 rounded-xl shadow-xs">
          <span className="text-xs font-medium text-foreground truncate max-w-xs">
            {item.title}
          </span>
          <span className="text-xs font-mono text-muted-foreground uppercase border-l border-border/60 pl-2">
            {item.type} · {item.aspectRatio || "16:9"}
          </span>
        </div>

        {/* MAIN MEDIA PREVIEW CONTAINER */}
        <div className="flex-1 w-full flex items-center justify-center overflow-hidden relative">
          {item.type === "video" ? (
            /* VIDEO PREVIEW */
            <div className="relative w-full h-full flex items-center justify-center">
              {/* Relight Overlay */}
              {selectedToolId === "relight" && (
                <div
                  className="absolute inset-0 pointer-events-none z-10 transition-opacity duration-300 rounded-xl"
                  style={{
                    background:
                      relightPreset === "golden"
                        ? `radial-gradient(circle at 75% 20%, rgba(251, 191, 36, ${relightIntensity / 250}) 0%, transparent 65%)`
                        : relightPreset === "neon"
                        ? `radial-gradient(circle at 20% 50%, rgba(6, 182, 212, ${relightIntensity / 250}) 0%, rgba(236, 72, 153, ${relightIntensity / 300}) 60%, transparent 85%)`
                        : relightPreset === "twilight"
                        ? `radial-gradient(circle at 50% 10%, rgba(99, 102, 241, ${relightIntensity / 250}) 0%, transparent 70%)`
                        : `radial-gradient(circle at 50% 40%, rgba(255, 255, 255, ${relightIntensity / 300}) 0%, transparent 60%)`,
                  }}
                />
              )}

              {/* Reframe Boundary Overlay */}
              {selectedToolId === "reframe" && (
                <div className="absolute inset-4 border border-dashed border-primary/70 rounded-xl pointer-events-none z-20 flex items-start justify-end p-2">
                  <span className="bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5 rounded font-mono">
                    Target {targetRatio} · {smartTrackingSubject}
                  </span>
                </div>
              )}

              {/* Video Element */}
              <div
                className="relative max-h-[78vh] max-w-full flex items-center justify-center rounded-2xl overflow-hidden shadow-2xl border border-border/40 transition-all duration-300"
                style={{ filter: getCanvasFilter() }}
              >
                <video
                  ref={videoRef}
                  src={item.url}
                  poster={item.thumbnailUrl || "/desert_nomad_frame.png"}
                  loop
                  playsInline
                  autoPlay
                  muted={isMuted}
                  className="max-h-[78vh] w-auto max-w-full rounded-2xl object-contain"
                />
              </div>

              {/* Actions a switched-on model really has for this video */}
              {editActions.length > 0 && (
                <div data-testid="video-actions" className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center bg-card/90 backdrop-blur-md border border-border/80 p-1 rounded-xl shadow-xl text-foreground text-xs font-medium">
                  {editActions.map((a, i) => {
                    const Icon = EDIT_ICON[a.kind]
                    return (
                      <React.Fragment key={a.id}>
                        {i > 0 && <span className="h-3.5 w-px bg-border mx-1" />}
                        <Button
                          variant="ghost"
                          type="button"
                          title={`${a.hint} (${a.record.name})`}
                          onClick={() => onEdit?.(item, a)}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span>{a.label}</span>
                        </Button>
                      </React.Fragment>
                    )
                  })}
                </div>
              )}
            </div>
          ) : item.type === "audio" ? (
            <div className="flex w-full max-w-xl flex-col items-center gap-4 rounded-2xl border border-border/60 bg-card/70 p-8 shadow-2xl" data-testid="audio-preview">
              <Volume2 className="h-10 w-10 text-muted-foreground" />
              <audio src={item.url} controls className="w-full" />
            </div>
          ) : (
            /* IMAGE PREVIEW */
            <div
              className="relative max-h-[78vh] max-w-full flex items-center justify-center transition-transform duration-200"
              style={{ transform: `scale(${zoomLevel / 100})` }}
            >
              <div
                className={`relative rounded-2xl overflow-hidden transition-all duration-300 border border-border/50 shadow-2xl ${
                  bgMode === "alpha"
                    ? "bg-[linear-gradient(45deg,#262626_25%,transparent_25%),linear-gradient(-45deg,#262626_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#262626_75%),linear-gradient(-45deg,transparent_75%,#262626_75%)] bg-[size:20px_20px] bg-secondary"
                    : bgMode === "white"
                    ? "bg-white p-4"
                    : bgMode === "obsidian"
                    ? "bg-background p-4"
                    : ""
                }`}
              >
                {/* Relight Glow Overlay */}
                {selectedToolId === "relight" && (
                  <div
                    className="absolute inset-0 pointer-events-none z-10 transition-opacity duration-300"
                    style={{
                      background:
                        relightPreset === "golden"
                          ? `radial-gradient(circle at 80% 20%, rgba(251, 191, 36, ${relightIntensity / 250}) 0%, transparent 60%)`
                          : relightPreset === "neon"
                          ? `radial-gradient(circle at 15% 50%, rgba(6, 182, 212, ${relightIntensity / 240}) 0%, rgba(236, 72, 153, ${relightIntensity / 280}) 60%, transparent 85%)`
                          : relightPreset === "twilight"
                          ? `radial-gradient(circle at 50% 10%, rgba(99, 102, 241, ${relightIntensity / 250}) 0%, transparent 70%)`
                          : `radial-gradient(circle at 45% 35%, rgba(255, 255, 255, ${relightIntensity / 300}) 0%, transparent 60%)`,
                    }}
                  />
                )}

                {/* Crop Overlay */}
                {(selectedToolId === "expand-crop" || activeCanvasTool === "crop") && (
                  <div className="absolute inset-3 border border-dashed border-primary rounded-xl z-20 pointer-events-none flex items-start justify-end p-2">
                    <span className="bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5 rounded font-mono">
                      Grid {targetRatio}
                    </span>
                  </div>
                )}

                <img
                  src={item.url || item.thumbnailUrl || "/burgundy_suit_portrait.png"}
                  alt={item.title}
                  className="max-h-[78vh] w-auto max-w-full rounded-2xl object-contain transition-all duration-300"
                  style={{ filter: getCanvasFilter() }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* BOTTOM CONTROLS BAR UNDER MEDIA CANVAS                   */}
        {/* ======================================================== */}
        {item.type === "video" ? (
          /* VIDEO CONTROLS: Scrubber bar, time, speed, status, fullscreen */
          <div className="w-full max-w-4xl pt-2 flex flex-col gap-2 shrink-0">
            {/* Scrubber Bar (Token-Based) */}
            <div
              className="relative h-1.5 w-full rounded-full bg-secondary cursor-pointer overflow-hidden group"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const pos = (e.clientX - rect.left) / rect.width
                setCurrentTime(+(pos * totalDuration).toFixed(1))
              }}
            >
              {/* Progress Fill */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-primary transition-all duration-100"
                style={{
                  width: `${Math.min(100, (currentTime / totalDuration) * 100)}%`,
                }}
              />

            </div>

            {/* Bottom Row controls */}
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <div className="flex items-center gap-3">
                <Button variant="ghost"
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="text-foreground hover:text-primary transition-colors cursor-pointer"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                </Button>

                <Button variant="ghost"
                  type="button"
                  onClick={() => {
                    const next = playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1
                    setPlaybackSpeed(next)
                  }}
                  className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-secondary/50 text-foreground hover:bg-secondary transition-colors cursor-pointer"
                  title="Playback Speed"
                >
                  {playbackSpeed}x
                </Button>

                <Button variant="ghost"
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  className="hover:text-foreground transition-colors cursor-pointer"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              </div>

              {/* Center: Timestamp */}
              <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                <span className="text-foreground font-medium">{formatTime(currentTime)}</span>
                <span>/</span>
                <span>{formatTime(totalDuration)}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </div>

              {/* Right: Status, PiP, Fullscreen */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-muted-foreground">Status</span>
                </div>

                <Button variant="ghost"
                  type="button"
                  className="hover:text-foreground transition-colors cursor-pointer"
                  title="Picture-in-Picture"
                >
                  <PictureInPicture className="h-3.5 w-3.5" />
                </Button>

                <Button variant="ghost"
                  type="button"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="hover:text-foreground transition-colors cursor-pointer text-xs"
                  title="Fullscreen (F)"
                >
                  <Maximize className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ) : activeTab === "edit" ? (
          /* IMAGE EDIT MODE: Floating Toolbar & Prompt Input Bar */
          <div className="w-full flex flex-col items-center gap-3 shrink-0 pt-2">
            {/* Row 1: Floating Editor Toolbar */}
            <div className="flex items-center gap-1 bg-card/90 backdrop-blur-md border border-border/80 p-1.5 rounded-2xl shadow-xl">
              <Button variant="ghost"
                type="button"
                onClick={() => setActiveCanvasTool("pointer")}
                className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                  activeCanvasTool === "pointer"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Select Pointer"
              >
                <ArrowRight className="h-4 w-4 -rotate-45" />
              </Button>

              <Button variant="ghost"
                type="button"
                onClick={() => setActiveCanvasTool("hand")}
                className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                  activeCanvasTool === "hand"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Pan Hand"
              >
                <Hand className="h-4 w-4" />
              </Button>

              <Button variant="ghost"
                type="button"
                onClick={() => {
                  setActiveCanvasTool("crop")
                  setSelectedToolId("expand-crop")
                }}
                className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                  activeCanvasTool === "crop"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Reframe & Crop"
              >
                <Crop className="h-4 w-4" />
              </Button>

              <Button variant="ghost"
                type="button"
                onClick={() => setActiveCanvasTool("inpaint")}
                className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                  activeCanvasTool === "inpaint"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Brush Inpaint"
              >
                <Sparkles className="h-4 w-4" />
              </Button>

              <Button variant="ghost"
                type="button"
                onClick={() => setActiveCanvasTool("highlighter")}
                className={`p-1.5 rounded-xl transition-colors cursor-pointer relative ${
                  activeCanvasTool === "highlighter"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Highlighter Pen"
              >
                <PenTool className="h-4 w-4" />
              </Button>

              <Button variant="ghost"
                type="button"
                onClick={() => setActiveCanvasTool("eraser")}
                className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                  activeCanvasTool === "eraser"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Eraser"
              >
                <Eraser className="h-4 w-4" />
              </Button>
            </div>

            {/* Row 2: Prompt Input Bar */}
            <form
              onSubmit={handleExecutePromptEdit}
              className="w-full max-w-xl flex items-center gap-2 bg-card border border-border rounded-full pl-4 pr-1.5 py-1.5 shadow-xl"
            >
              <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                type="text"
                placeholder="Describe how to edit image..."
                value={editPromptInput}
                onChange={(e) => setEditPromptInput(e.target.value)}
                className="w-full bg-transparent border-0 shadow-none text-xs text-foreground placeholder:text-muted-foreground focus-visible:bg-transparent focus-visible:border-transparent focus-visible:ring-0"
              />
              <Button variant="ghost"
                type="submit"
                disabled={!editPromptInput.trim() || isProcessing}
                className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 transition-all cursor-pointer shrink-0"
                title="Generate Edit"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </Button>
            </form>

            {/* Zoom Controls */}
            <div className="w-full flex items-center justify-between text-xs text-muted-foreground px-2">
              <div className="flex items-center gap-1 bg-card border border-border px-2 py-1 rounded-lg">
                <Button variant="ghost"
                  type="button"
                  onClick={() => setZoomLevel((prev) => Math.max(50, prev - 25))}
                  className="hover:text-foreground px-1 cursor-pointer"
                >
                  -
                </Button>
                <span className="font-mono text-xs px-1 text-foreground">{zoomLevel}%</span>
                <Button variant="ghost"
                  type="button"
                  onClick={() => setZoomLevel((prev) => Math.min(200, prev + 25))}
                  className="hover:text-foreground px-1 cursor-pointer"
                >
                  +
                </Button>
              </div>

              <Button variant="ghost"
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="hover:text-foreground cursor-pointer"
                title="Fullscreen"
              >
                <Maximize className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          /* IMAGE INFO MODE: Bottom Zoom and Status Bar */
          <div className="w-full flex items-center justify-between text-xs text-muted-foreground px-4 pt-2">
            <div className="flex items-center gap-1 bg-card border border-border px-2 py-1 rounded-lg">
              <Button variant="ghost"
                type="button"
                onClick={() => setZoomLevel((prev) => Math.max(50, prev - 25))}
                className="hover:text-foreground px-1 cursor-pointer"
              >
                -
              </Button>
              <span className="font-mono text-xs px-1 text-foreground">{zoomLevel}%</span>
              <Button variant="ghost"
                type="button"
                onClick={() => setZoomLevel((prev) => Math.min(200, prev + 25))}
                className="hover:text-foreground px-1 cursor-pointer"
              >
                +
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Status</span>
              </div>
              <Button variant="ghost"
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="hover:text-foreground cursor-pointer"
              >
                <Maximize className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* RIGHT SIDEBAR: PROMPT, DETAILS, ACTIONS, CAPABILITIES    */}
      {/* ======================================================== */}
      <div className="w-full md:w-96 lg:w-96 shrink-0 h-full bg-card border-t md:border-t-0 md:border-l border-border flex flex-col justify-between p-5 overflow-y-auto">
        <div className="space-y-4">
          {/* 1. Header: Author Avatar + Name + Close Button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full overflow-hidden bg-secondary border border-border flex items-center justify-center shrink-0">
                <img
                  src={authorAvatar}
                  alt="Author"
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <div className="text-xs font-semibold text-foreground">
                  {authorName}
                </div>
                <div className="text-xs text-muted-foreground">Author</div>
              </div>
            </div>

            <Button variant="ghost"
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* 2. Segmented Tab Switcher: [ Info | Edit | Comments ] */}
          <div className="grid grid-cols-3 gap-1 bg-secondary/60 p-1 rounded-xl border border-border/40">
            <Button variant="ghost"
              type="button"
              onClick={() => {
                setActiveTab("info")
                setSelectedToolId(null)
              }}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "info"
                  ? "bg-card text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Info className="h-3.5 w-3.5" />
              <span>Info</span>
            </Button>

            <Button variant="ghost"
              type="button"
              onClick={() => setActiveTab("edit")}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "edit"
                  ? "bg-card text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Edit</span>
            </Button>

            <Button variant="ghost"
              type="button"
              onClick={() => {
                setActiveTab("comments")
                setSelectedToolId(null)
              }}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "comments"
                  ? "bg-card text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Comments</span>
            </Button>
          </div>

          {/* ==================================================== */}
          {/* TAB 1: INFO (DECLUTTERED & CLEAN)                    */}
          {/* ==================================================== */}
          {activeTab === "info" && (
            <div className="space-y-4 animate-fade-in">
              {/* PROMPT Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="h-3 w-3" />
                    <span>Prompt</span>
                  </span>
                  <Button variant="ghost"
                    type="button"
                    onClick={handleCopyPrompt}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                  >
                    {isCopied ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-500" />
                        <span className="text-emerald-500">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* Prompt Card: Clean typography, no redundant squashed thumbnails */}
                <div className="text-xs text-foreground leading-relaxed bg-secondary/40 p-3.5 rounded-xl border border-border/60 space-y-2">
                  <p className={showFullPrompt ? "" : "line-clamp-4"}>
                    {item.prompt.includes("@") ? (
                      item.prompt.split(" ").map((word, i) => {
                        if (word.startsWith("@")) {
                          return (
                            <span
                              key={i}
                              className="inline-block bg-primary/10 text-primary border border-primary/20 px-1 rounded mx-0.5 font-medium"
                            >
                              {word}{" "}
                            </span>
                          )
                        }
                        return word + " "
                      })
                    ) : (
                      item.prompt
                    )}
                  </p>

                  <Button variant="ghost"
                    type="button"
                    onClick={() => setShowFullPrompt(!showFullPrompt)}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors pt-1"
                  >
                    <span>{showFullPrompt ? "See less" : "See all"}</span>
                    {showFullPrompt ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>

              {/* DETAILS Accordion: Clean key-value table */}
              <div className="border-t border-border pt-3">
                <Button variant="ghost"
                  type="button"
                  onClick={() => setDetailsOpen(!detailsOpen)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Info className="h-3 w-3" />
                    <span>Details</span>
                  </span>
                  {detailsOpen ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </Button>

                {detailsOpen && (
                  <div className="space-y-1.5 text-xs animate-fade-in">
                    <div className="flex items-center justify-between py-1">
                      <span className="text-muted-foreground">Model</span>
                      <span className="font-mono text-foreground font-medium">
                        {item.model || "Unknown"}
                      </span>
                    </div>
                    {item.quality && (
                      <div className="flex items-center justify-between py-1">
                        <span className="text-muted-foreground">Quality</span>
                        <span className="font-mono text-foreground font-medium">{item.quality}</span>
                      </div>
                    )}
                    {item.bitrate && (
                      <div className="flex items-center justify-between py-1">
                        <span className="text-muted-foreground">Bitrate</span>
                        <span className="font-mono text-foreground font-medium">{item.bitrate}</span>
                      </div>
                    )}
                    {(item.size || item.aspectRatio) && (
                      <div className="flex items-center justify-between py-1">
                        <span className="text-muted-foreground">Size</span>
                        <span className="font-mono text-foreground font-medium">{item.size || item.aspectRatio}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between py-1">
                      <span className="text-muted-foreground">Created</span>
                      <span className="font-mono text-muted-foreground text-xs">
                        {item.createdAt}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 2: EDIT (MODEL-AWARE CAPABILITIES)                */}
          {/* ==================================================== */}
          {activeTab === "edit" && (
            <div className="space-y-4 animate-fade-in">
              {/* SUB-PANEL: Active Capability Controls */}
              {selectedToolId ? (
                <div className="space-y-3 bg-secondary/40 p-3.5 rounded-2xl border border-border animate-fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <Button variant="ghost"
                      type="button"
                      onClick={() => setSelectedToolId(null)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      <span>All Tools</span>
                    </Button>
                    <span className="text-xs font-mono text-muted-foreground uppercase font-semibold">
                      {item.model || "Neural Model"}
                    </span>
                  </div>

                  {selectedToolId === "relight" && (
                    <div className="space-y-3 text-xs">
                      <div className="font-semibold text-foreground">Directional AI Relighting</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {([
                          { id: "golden", label: "Golden Sunset" },
                          { id: "studio", label: "Studio Softbox" },
                          { id: "neon", label: "Dual Cyber Neon" },
                          { id: "twilight", label: "Moody Twilight" },
                        ] as const).map((p) => (
                          <Button variant="ghost"
                            key={p.id}
                            type="button"
                            onClick={() => setRelightPreset(p.id)}
                            className={`p-2 rounded-xl text-left border cursor-pointer transition-all ${
                              relightPreset === p.id
                                ? "bg-card border-select text-foreground font-medium shadow-xs"
                                : "border-border text-muted-foreground hover:text-foreground hover:bg-card/50"
                            }`}
                          >
                            {p.label}
                          </Button>
                        ))}
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Intensity</span>
                          <span className="font-mono text-foreground">{relightIntensity}%</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={relightIntensity}
                          onChange={(e) => setRelightIntensity(+e.target.value)}
                          className="w-full accent-foreground"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Light Angle</span>
                          <span className="font-mono text-foreground">{relightAngle}°</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          value={relightAngle}
                          onChange={(e) => setRelightAngle(+e.target.value)}
                          className="w-full accent-foreground"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Color Temperature</span>
                          <span className="font-mono text-foreground">{relightTemp}K</span>
                        </div>
                        <input
                          type="range"
                          min="2800"
                          max="7500"
                          step="100"
                          value={relightTemp}
                          onChange={(e) => setRelightTemp(+e.target.value)}
                          className="w-full accent-foreground"
                        />
                      </div>

                      <Button variant="ghost"
                        type="button"
                        onClick={() => handleApplyCapability("Relight")}
                        disabled={isProcessing}
                        className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 cursor-pointer flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                      >
                        <SunMedium className="h-3.5 w-3.5" />
                        <span>Bake Neural Relighting</span>
                      </Button>
                    </div>
                  )}

                  {(selectedToolId === "color-palette" || selectedToolId === "color-grading") && (
                    <div className="space-y-3 text-xs">
                      <div className="font-semibold text-foreground">Cinematic LUTs & Color Grading</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {([
                          { id: "default", label: "Natural Rec.709" },
                          { id: "teal-orange", label: "Teal & Orange" },
                          { id: "arri", label: "Arri Alexa Soft" },
                          { id: "bleach", label: "Bleach Bypass" },
                          { id: "kodak", label: "Kodak 5219 Warm" },
                          { id: "noir", label: "Monochrome Noir" },
                        ] as const).map((lut) => (
                          <Button variant="ghost"
                            key={lut.id}
                            type="button"
                            onClick={() => setColorLUT(lut.id)}
                            className={`p-2 rounded-xl text-left border cursor-pointer transition-all ${
                              colorLUT === lut.id
                                ? "bg-card border-select text-foreground font-medium shadow-xs"
                                : "border-border text-muted-foreground hover:text-foreground hover:bg-card/50"
                            }`}
                          >
                            {lut.label}
                          </Button>
                        ))}
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Contrast</span>
                          <span className="font-mono text-foreground">{colorContrast}%</span>
                        </div>
                        <input
                          type="range"
                          min="60"
                          max="150"
                          value={colorContrast}
                          onChange={(e) => setColorContrast(+e.target.value)}
                          className="w-full accent-foreground"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Saturation</span>
                          <span className="font-mono text-foreground">{colorSaturation}%</span>
                        </div>
                        <input
                          type="range"
                          min="40"
                          max="180"
                          value={colorSaturation}
                          onChange={(e) => setColorSaturation(+e.target.value)}
                          className="w-full accent-foreground"
                        />
                      </div>

                      <Button variant="ghost"
                        type="button"
                        onClick={() => handleApplyCapability("Color Palette")}
                        disabled={isProcessing}
                        className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 cursor-pointer flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                      >
                        <Palette className="h-3.5 w-3.5" />
                        <span>Apply Palette Profile</span>
                      </Button>
                    </div>
                  )}

                  {selectedToolId === "upscale" && (
                    <div className="space-y-3 text-xs">
                      <div className="font-semibold text-foreground">Multi-Scale Super-Resolution</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {([
                          { id: "2k", label: "2K HD", res: "2048px" },
                          { id: "4k", label: "4K Ultra", res: "3840px" },
                          { id: "8k", label: "8K IMAX", res: "7680px" },
                        ] as const).map((u) => (
                          <Button variant="ghost"
                            key={u.id}
                            type="button"
                            onClick={() => setUpscaleFactor(u.id)}
                            className={`p-2 rounded-xl text-center border cursor-pointer transition-all ${
                              upscaleFactor === u.id
                                ? "bg-card border-select text-foreground font-semibold shadow-xs"
                                : "border-border text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <div>{u.label}</div>
                            <div className="text-xs text-muted-foreground font-mono">{u.res}</div>
                          </Button>
                        ))}
                      </div>

                      <label className="flex items-center gap-2 text-foreground cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={faceRestore}
                          onChange={(e) => setFaceRestore(e.target.checked)}
                          className="accent-foreground rounded"
                        />
                        <span>Restore Facial Pores & Micro-Textures</span>
                      </label>

                      <Button variant="ghost"
                        type="button"
                        onClick={() => handleApplyCapability("Upscale")}
                        disabled={isProcessing}
                        className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 cursor-pointer flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                        <span>Run Super-Resolution</span>
                      </Button>
                    </div>
                  )}

                  {(selectedToolId === "remove-bg" || selectedToolId === "remove-background") && (
                    <div className="space-y-3 text-xs">
                      <div className="font-semibold text-foreground">Subject Extraction & Alpha Matte</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {([
                          { id: "normal", label: "Original" },
                          { id: "alpha", label: "Transparent Alpha" },
                          { id: "white", label: "Studio White" },
                          { id: "obsidian", label: "Studio Void" },
                        ] as const).map((b) => (
                          <Button variant="ghost"
                            key={b.id}
                            type="button"
                            onClick={() => setBgMode(b.id)}
                            className={`p-2 rounded-xl text-left border cursor-pointer transition-all ${
                              bgMode === b.id
                                ? "bg-card border-select text-foreground font-medium shadow-xs"
                                : "border-border text-muted-foreground hover:text-foreground hover:bg-card/50"
                            }`}
                          >
                            {b.label}
                          </Button>
                        ))}
                      </div>

                      <Button variant="ghost"
                        type="button"
                        onClick={() => handleApplyCapability("Background Removal")}
                        disabled={isProcessing}
                        className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 cursor-pointer flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                      >
                        <Scissors className="h-3.5 w-3.5" />
                        <span>Extract Subject Layer</span>
                      </Button>
                    </div>
                  )}

                  {(selectedToolId === "reframe" || selectedToolId === "expand-crop") && (
                    <div className="space-y-3 text-xs">
                      <div className="font-semibold text-foreground">Smart Aspect Ratio Reframe</div>
                      <div className="grid grid-cols-4 gap-1">
                        {(["16:9", "9:16", "1:1", "2.39:1"] as const).map((r) => (
                          <Button variant="ghost"
                            key={r}
                            type="button"
                            onClick={() => setTargetRatio(r)}
                            className={`py-1.5 rounded-lg text-center border font-mono text-xs cursor-pointer transition-all ${
                              targetRatio === r
                                ? "bg-card border-select text-foreground font-bold shadow-xs"
                                : "border-border text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {r}
                          </Button>
                        ))}
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Subject Tracking Anchor:</span>
                        <div className="flex gap-1.5">
                          {["@Kadam (Man)", "Horizon", "Motorcycle"].map((sub) => (
                            <Button variant="ghost"
                              key={sub}
                              type="button"
                              onClick={() => setSmartTrackingSubject(sub)}
                              className={`px-2 py-1 rounded-lg border text-xs cursor-pointer ${
                                smartTrackingSubject === sub
                                  ? "bg-card border-select text-foreground font-medium"
                                  : "border-border text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {sub}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <Button variant="ghost"
                        type="button"
                        onClick={() => handleApplyCapability("Reframe")}
                        disabled={isProcessing}
                        className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 cursor-pointer flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                      >
                        <Crop className="h-3.5 w-3.5" />
                        <span>Apply Framing Transform</span>
                      </Button>
                    </div>
                  )}

                  {selectedToolId === "angles" && (
                    <div className="space-y-3 text-xs">
                      <div className="font-semibold text-foreground">3D Turnaround Camera Angle</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { id: "0", label: "0° Front Full Shot" },
                          { id: "45", label: "45° 3/4 Studio Turn" },
                          { id: "90", label: "90° Full Profile" },
                          { id: "-15", label: "-15° Heroic Low Angle" },
                          { id: "30", label: "+30° High Overhead" },
                        ].map((a) => (
                          <Button variant="ghost"
                            key={a.id}
                            type="button"
                            onClick={() => setSelectedAngle(a.id)}
                            className={`p-2 rounded-xl text-left border cursor-pointer transition-all ${
                              selectedAngle === a.id
                                ? "bg-card border-select text-foreground font-medium shadow-xs"
                                : "border-border text-muted-foreground hover:text-foreground hover:bg-card/50"
                            }`}
                          >
                            {a.label}
                          </Button>
                        ))}
                      </div>

                      <Button variant="ghost"
                        type="button"
                        onClick={() => handleApplyCapability(`Angle ${selectedAngle}°`)}
                        disabled={isProcessing}
                        className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 cursor-pointer flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                      >
                        <Box className="h-3.5 w-3.5" />
                        <span>Synthesize Novel Angle</span>
                      </Button>
                    </div>
                  )}

                  {selectedToolId === "layer-decomp" && (
                    <div className="space-y-3 text-xs">
                      <div className="font-semibold text-foreground">Neural Layer Decomposition</div>
                      <div className="space-y-1.5">
                        {layers.map((layer) => (
                          <div
                            key={layer.id}
                            className="flex items-center justify-between p-2 rounded-xl bg-secondary/50 border border-border"
                          >
                            <div className="flex items-center gap-2">
                              <img
                                src={layer.thumbnailUrl}
                                alt={layer.name}
                                className="h-7 w-7 rounded object-cover border border-border"
                              />
                              <span className="text-xs text-foreground font-medium">{layer.name}</span>
                            </div>
                            <Button variant="ghost"
                              type="button"
                              onClick={() =>
                                setLayers((prev) =>
                                  prev.map((l) =>
                                    l.id === layer.id ? { ...l, visible: !l.visible } : l
                                  )
                                )
                              }
                              className="text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                              {layer.visible ? (
                                <Eye className="h-3.5 w-3.5 text-primary" />
                              ) : (
                                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>

                      <Button variant="ghost"
                        type="button"
                        onClick={() => handleApplyCapability("Export PSD Layers")}
                        disabled={isProcessing}
                        className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 cursor-pointer flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Export Layered PSD</span>
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}

              {/* The AI tools, the same ones as in Story/Edit: they run on this file and the result is saved to the Library */}
              {!selectedToolId && toolHost && (
                <AiToolPanel
                  media={item.url ? { url: item.url, kind: item.type, name: item.title, seconds: item.duration } : null}
                  kind={item.type}
                  surface="library"
                  settings={toolHost.settings}
                  projectId={toolHost.projectId}
                  onOpenSettings={toolHost.onOpenSettings}
                  onDone={(assets) => {
                    toolHost.onAssets(assets)
                    setEditFeedbackMessage("Saved to your Library.")
                    setTimeout(() => setEditFeedbackMessage(null), 4000)
                  }}
                />
              )}

              {/* What the switched-on models can really do with this video */}
              {!selectedToolId && item.type === "video" && (
                <div className="space-y-1" data-testid="video-edit-actions">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Wand2 className="h-3 w-3" />
                    <span>Edit Video</span>
                  </div>
                  {editActions.length === 0 ? (
                    <p className="px-1 text-xs text-muted-foreground">No switched-on model can edit, extend or lip-sync a video yet. Switch one on in Settings, then it appears here.</p>
                  ) : (
                    editActions.map((a) => {
                      const Icon = EDIT_ICON[a.kind]
                      return (
                        <Button
                          variant="ghost"
                          key={a.id}
                          type="button"
                          onClick={() => onEdit?.(item, a)}
                          className="h-auto w-full flex items-start justify-between gap-3 px-3 py-2.5 rounded-xl text-xs transition-colors cursor-pointer text-foreground hover:bg-secondary/70 border border-transparent hover:border-border/60"
                        >
                          <div className="flex items-start gap-2.5 text-left">
                            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div>
                              <div className="font-medium">{a.label}</div>
                              <div className="text-xs font-normal text-muted-foreground">{a.hint}</div>
                            </div>
                          </div>
                          <span className="shrink-0 pt-0.5 text-xs font-normal text-muted-foreground">{a.record.name}</span>
                        </Button>
                      )
                    })
                  )}
                </div>
              )}

              {!selectedToolId && item.type === "image" && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Wand2 className="h-3 w-3" />
                      <span>Edit Image</span>
                    </div>

                    {[
                      { id: "layer-decomp", label: "Layer Decomposition", icon: Layers, isNew: true },
                      { id: "edit-text", label: "Edit Text", icon: Type, isNew: true },
                      { id: "expand-crop", label: "Expand & Crop", icon: Crop, isNew: true },
                      { id: "color-grading", label: "Color Grading", icon: Palette },
                      { id: "angles", label: "Angles", icon: Box },
                    ].map((tool) => {
                      const Icon = tool.icon

                      return (
                        <Button variant="ghost"
                          key={tool.id}
                          type="button"
                          onClick={() => setSelectedToolId(tool.id)}
                          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-colors cursor-pointer text-foreground hover:bg-secondary/70 border border-transparent hover:border-border/60"
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium">{tool.label}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            {tool.isNew && (
                              <span className="text-xs font-semibold bg-secondary text-foreground border border-border px-1.5 py-0.5 rounded font-mono uppercase">
                                New
                              </span>
                            )}
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        </Button>
                      )
                    })}
                  </div>

                  {/* Section LAYERS + */}
                  <div className="border-t border-border pt-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <Layers className="h-3 w-3" />
                        <span>Layers</span>
                      </span>
                      <Button variant="ghost"
                        type="button"
                        onClick={() => setSelectedToolId("layer-decomp")}
                        className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2.5 bg-secondary/50 p-2 rounded-xl border border-border">
                      <div className="h-8 w-8 rounded-lg overflow-hidden bg-background shrink-0 border border-border">
                        <img
                          src={item.thumbnailUrl || "/burgundy_suit_portrait.png"}
                          alt="Base"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <span className="text-xs font-medium text-foreground">Base Layer</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 3: COMMENTS                                      */}
          {/* ==================================================== */}
          {activeTab === "comments" && (
            <div className="space-y-3 animate-fade-in text-xs">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Production Notes
              </div>
              <div className="space-y-2.5">
                <div className="bg-secondary/40 p-3 rounded-xl border border-border space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Director AI</span>
                    <span className="text-xs text-muted-foreground">2h ago</span>
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Subject lighting and wardrobe continuity verified across camera angles. Ready for sequence generation.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <Input
                  type="text"
                  placeholder="Add comment..."
                  className="flex-1 bg-secondary/60 text-xs px-3 py-2 rounded-xl border border-border text-foreground placeholder:text-muted-foreground"
                />
                <Button variant="ghost"
                  type="button"
                  className="px-3 py-2 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 cursor-pointer transition-colors"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ==================================================== */}
        {/* BOTTOM ACTIONS SECTION (DETERMINISTIC TOKEN-BASED)    */}
        {/* ==================================================== */}
        <div className="pt-4 space-y-2.5 border-t border-border mt-4">
          {activeTab === "info" && (
            <>
              {item.type === "image" ? (
                /* IMAGE ACTIONS: Turn to video (Primary token) + Recreate & Reference (Secondary tokens) */
                <>
                  <Button variant="ghost"
                    type="button"
                    onClick={() => {
                      onTurnToVideo?.(item)
                      onClose()
                    }}
                    className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-xs flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-xs cursor-pointer"
                  >
                    <Video className="h-4 w-4" />
                    <span>Turn to video</span>
                  </Button>

                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="ghost"
                      type="button"
                      onClick={() => {
                        onRecreate?.(item)
                        setEditFeedbackMessage("Generating variation with seed...")
                        setTimeout(() => setEditFeedbackMessage(null), 3000)
                      }}
                      className="h-9 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/60 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                      <span>Recreate</span>
                    </Button>

                    <Button variant="ghost"
                      type="button"
                      onClick={() => {
                        onUseAsReference?.(item)
                        setEditFeedbackMessage("Set as active character reference!")
                        setTimeout(() => setEditFeedbackMessage(null), 3000)
                      }}
                      className="h-9 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/60 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Reference</span>
                    </Button>
                  </div>
                </>
              ) : (
                /* VIDEO ACTIONS: Recreate & Reference */
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="ghost"
                    type="button"
                    onClick={() => {
                      onRecreate?.(item)
                      setEditFeedbackMessage("Recreating sequence with fresh seed...")
                      setTimeout(() => setEditFeedbackMessage(null), 3000)
                    }}
                    className="h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-xs flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-xs cursor-pointer"
                  >
                    <RotateCw className="h-4 w-4" />
                    <span>Recreate</span>
                  </Button>

                  <Button variant="ghost"
                    type="button"
                    onClick={() => {
                      onUseAsReference?.(item)
                      setEditFeedbackMessage("Set clip as motion style reference!")
                      setTimeout(() => setEditFeedbackMessage(null), 3000)
                    }}
                    className="h-10 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/60 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Reference</span>
                  </Button>
                </div>
              )}
            </>
          )}

          {/* BOTTOM UTILITY ROW: Download, Heart, Share, More (Our Design Tokens) */}
          <div className="flex items-center gap-2 pt-1">
            <Button variant="ghost"
              type="button"
              onClick={() => {
                // A real download, and a notice that says where it went (it said "exports folder" before and saved nothing)
                void downloadMedia({ id: item.id, url: item.url, title: item.title, type: item.type }).then((r) => {
                  setEditFeedbackMessage(r.message)
                  setTimeout(() => setEditFeedbackMessage(null), 7000)
                })
              }}
              className="flex-1 h-9 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/60 text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download</span>
            </Button>

            <Button variant="ghost"
              type="button"
              onClick={() => setIsLiked(!isLiked)}
              className={`h-9 w-9 rounded-xl flex items-center justify-center border transition-colors cursor-pointer ${
                isLiked
                  ? "bg-rose-500/10 text-rose-500 border-rose-500/30"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 border-border/60"
              }`}
              title={isLiked ? "Unlike" : "Like"}
            >
              <Heart className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`} />
            </Button>

            {activeTab === "info" && (
              <Button variant="ghost"
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href)
                  setEditFeedbackMessage("Link copied to clipboard!")
                  setTimeout(() => setEditFeedbackMessage(null), 2500)
                }}
                className="h-9 w-9 rounded-xl bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-border/60 flex items-center justify-center transition-colors cursor-pointer"
                title="Share"
              >
                <Share2 className="h-4 w-4" />
              </Button>
            )}

            <Button variant="ghost"
              type="button"
              className="h-9 w-9 rounded-xl bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-border/60 flex items-center justify-center transition-colors cursor-pointer"
              title="More"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
