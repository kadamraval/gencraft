import * as React from "react"
import { Play, Pause, RotateCcw, Download, X, Film, Check } from "lucide-react"
import { VideoSceneBeat, MediaAsset } from "@/types"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface VideoStitcherPlayerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scenes?: VideoSceneBeat[]
  singleAsset?: MediaAsset
}

export function VideoStitcherPlayer({
  open,
  onOpenChange,
  scenes,
  singleAsset,
}: VideoStitcherPlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [currentSceneIndex, setCurrentSceneIndex] = React.useState(0)
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [exportSuccess, setExportSuccess] = React.useState(false)

  const activeScene = scenes ? scenes[currentSceneIndex] : undefined
  const videoSrc = activeScene?.videoUrl || singleAsset?.url || ""

  React.useEffect(() => {
    if (open) {
      setCurrentSceneIndex(0)
      setIsPlaying(true)
      setExportSuccess(false)
    }
  }, [open])

  const handleVideoEnded = () => {
    if (scenes && currentSceneIndex < scenes.length - 1) {
      setCurrentSceneIndex(currentSceneIndex + 1)
    } else {
      setIsPlaying(false)
    }
  }

  const togglePlay = () => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
      setIsPlaying(false)
    } else {
      videoRef.current.play()
      setIsPlaying(true)
    }
  }

  const handleSimulateExport = () => {
    setExportSuccess(true)
    setTimeout(() => setExportSuccess(false), 3000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-2xl bg-card text-card-foreground border border-border shadow-none select-none">
        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-foreground" />
            <span className="text-xs font-semibold text-foreground">
              {scenes
                ? `Seamless Stitched Storyboard (${scenes.length * 10}s Continuous Timeline)`
                : singleAsset?.title || "Video Player"}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground h-7 w-7 rounded-lg"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Video Canvas Container */}
        <div className="relative aspect-video w-full bg-black flex items-center justify-center">
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              autoPlay
              playsInline
              onEnded={handleVideoEnded}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-muted-foreground text-xs">No video stream loaded</div>
          )}

          {/* Large Center Play Overlay if paused */}
          {!isPlaying && (
            <Button
              type="button"
              variant="default"
              size="icon"
              onClick={togglePlay}
              className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/80 hover:bg-primary text-primary-foreground transition-transform hover:scale-105"
            >
              <Play className="h-6 w-6 fill-current ml-1" />
            </Button>
          )}

          {/* Current 10s Timecode Overlay */}
          {activeScene && (
            <div className="absolute top-3 left-3 bg-background/80 backdrop-blur-sm px-2.5 py-1 rounded-lg text-xs font-mono text-foreground flex items-center gap-2 border border-border/50">
              <span className="font-bold">Beat #{activeScene.sceneNumber}</span>
              <span className="text-muted-foreground">{activeScene.timeRange}</span>
            </div>
          )}
        </div>

        {/* Multi-Chunk 10s Timeline Segment Bar */}
        {scenes && scenes.length > 1 && (
          <div className="px-5 pt-3 pb-1 bg-secondary/50 border-t border-border">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Continuous 10s Storyboard Timeline</span>
              <span>Total: {scenes.length * 10} seconds</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {scenes.map((sc, idx) => (
                <Button
                  key={sc.id}
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setCurrentSceneIndex(idx)
                    setIsPlaying(true)
                  }}
                  className={`p-2 h-auto flex flex-col justify-start rounded-xl text-left transition-all ${
                    currentSceneIndex === idx
                      ? "bg-primary text-primary-foreground font-medium"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="text-xs font-semibold flex items-center justify-between">
                    <span>Beat #{sc.sceneNumber}</span>
                    <span className="font-mono text-xs">{sc.timeRange}</span>
                  </div>
                  <div className="text-xs opacity-80 truncate mt-0.5">
                    {sc.originalBeatPrompt}
                  </div>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Controls Bar */}
        <div className="px-5 py-3 flex items-center justify-between bg-card">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={togglePlay}
              className="h-8 w-8 p-0 text-foreground"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = 0
                  videoRef.current.play()
                  setIsPlaying(true)
                }
              }}
              className="h-8 w-8 p-0 text-foreground"
              title="Replay from start"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleSimulateExport}
              className="h-8 gap-1.5 text-xs px-3"
            >
              {exportSuccess ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Exported to MP4</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  <span>Stitch & Export MP4</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
