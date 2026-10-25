import { Play, Film } from "lucide-react"
import { MediaAsset } from "@/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface ListViewProps {
  assets: MediaAsset[]
  onPlayAsset: (asset: MediaAsset) => void
}

export function ListView({ assets, onPlayAsset }: ListViewProps) {
  if (assets.length === 0) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-center p-8 select-none">
        <Film className="h-10 w-10 text-muted-foreground/60 mb-2" />
        <h3 className="text-sm font-semibold text-foreground">No Production Assets</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          Your generated scenes, image batches, and stitched video cues will be tabulated here.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-y-auto p-6 select-none">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Production Cue Sheet ({assets.length} Entries)
          </h2>
          <span className="text-xs text-muted-foreground font-mono">
            Total Computations: {assets.length} tasks
          </span>
        </div>

        <div className="overflow-hidden rounded-xl bg-card border border-border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/60 text-xs uppercase font-semibold text-muted-foreground">
                <th className="py-3 px-4">Preview</th>
                <th className="py-3 px-3">Title & Prompt</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Engine</th>
                <th className="py-3 px-3">Duration</th>
                <th className="py-3 px-3">Cost</th>
                <th className="py-3 px-3">Created</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assets.map((asset) => (
                <tr key={asset.id} className="hover:bg-secondary/40 transition-colors">
                  {/* Thumbnail */}
                  <td className="py-2.5 px-4">
                    <div className="h-10 w-16 rounded-lg overflow-hidden bg-secondary border border-border/60 relative flex items-center justify-center">
                      <img
                        src={asset.thumbnailUrl}
                        alt={asset.title}
                        className="h-full w-full object-cover"
                      />
                      {asset.type === "video" && (
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <Play className="h-3 w-3 fill-white text-white" />
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Title & Prompt */}
                  <td className="py-2.5 px-3 max-w-xs">
                    <div className="font-semibold text-foreground truncate">{asset.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{asset.prompt}</div>
                  </td>

                  {/* Type */}
                  <td className="py-2.5 px-3">
                    <Badge variant="zinc" className="text-xs uppercase font-mono">
                      {asset.type}
                    </Badge>
                  </td>

                  {/* Engine */}
                  <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground">
                    {asset.model}
                  </td>

                  {/* Duration */}
                  <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground">
                    {asset.duration ? `${asset.duration}s` : "Static"}
                  </td>

                  {/* Cost */}
                  <td className="py-2.5 px-3 font-mono text-foreground font-medium">
                    {asset.cost}
                  </td>

                  {/* Created */}
                  <td className="py-2.5 px-3 text-xs text-muted-foreground font-mono">
                    {asset.createdAt}
                  </td>

                  {/* Action */}
                  <td className="py-2.5 px-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onPlayAsset(asset)}
                      className="h-7 px-2.5 text-xs text-foreground hover:bg-secondary"
                    >
                      <span>Play</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
