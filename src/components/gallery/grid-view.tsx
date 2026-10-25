import { Play, Film, Image as ImageIcon } from "lucide-react"
import { MediaAsset } from "@/types"
import { Button } from "@/components/ui/button"

interface GridViewProps {
  assets: MediaAsset[]
  onPlayAsset: (asset: MediaAsset) => void
}

export function GridView({ assets, onPlayAsset }: GridViewProps) {
  if (assets.length === 0) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-center p-8 select-none">
        <Film className="h-10 w-10 text-muted-foreground/60 mb-2" />
        <h3 className="text-sm font-semibold text-foreground">No Media Generated Yet</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          Start generating 10s video storyboards or image batches in the chat view to see your gallery.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-y-auto p-6 select-none">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">
            Media Library ({assets.length} Assets)
          </h2>
          <span className="text-xs text-muted-foreground">Hover for video loop preview</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="group relative rounded-xl bg-card border border-border p-2.5 transition-colors hover:bg-secondary/40 animate-fade-in flex flex-col justify-between"
            >
              {/* Media Container */}
              <div className="relative aspect-video rounded-lg overflow-hidden bg-secondary border border-border/60 flex items-center justify-center">
                {asset.type === "video" ? (
                  <>
                    <video
                      src={asset.url}
                      poster={asset.thumbnailUrl}
                      className="w-full h-full object-cover"
                      loop
                      muted
                      playsInline
                      onMouseEnter={(e) => e.currentTarget.play()}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause()
                        e.currentTarget.currentTime = 0
                      }}
                    />
                    <Button
                      type="button"
                      size="icon"
                      onClick={() => onPlayAsset(asset)}
                      className="absolute inset-0 m-auto flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:scale-105"
                      title="Play Full Video"
                    >
                      <Play className="h-4 w-4 fill-current ml-0.5" />
                    </Button>
                    {asset.duration && (
                      <span className="absolute bottom-1.5 right-1.5 bg-background/80 text-foreground text-xs px-1.5 py-0.5 rounded font-mono border border-border/40">
                        {asset.duration}s
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <img
                      src={asset.url}
                      alt={asset.title}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    <a
                      href={asset.url}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute inset-0 bg-background/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-foreground"
                    >
                      <ImageIcon className="h-5 w-5" />
                    </a>
                  </>
                )}
              </div>

              {/* Meta Info */}
              <div className="mt-2.5 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground truncate max-w-36">
                    {asset.title}
                  </span>
                  <span className="font-mono text-muted-foreground">{asset.cost}</span>
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {asset.prompt}
                </p>

                <div className="pt-1 flex items-center justify-between text-xs text-muted-foreground border-t border-border/40">
                  <span className="capitalize font-mono">{asset.model}</span>
                  <span className="uppercase font-mono">{asset.aspectRatio}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
