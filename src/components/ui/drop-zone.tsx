import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface DropZoneProps {
  /** What the box takes, for example "image/*" or "application/pdf" */
  accept: string
  multiple?: boolean
  /** Called with the files that were dropped or chosen, already limited to what is accepted */
  onFiles: (files: File[]) => void
  /** Shown inside the box when it is empty, for example "Drop a picture here or click to choose" */
  children: React.ReactNode
  label: string
  className?: string
  /** When given, a click opens this (for example the studio's picture picker) instead of the device's file chooser. Dropping files still works. */
  onOpen?: () => void
}

const matches = (file: File, accept: string) =>
  accept
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .some((a) => (a.endsWith("/*") ? file.type.toLowerCase().startsWith(a.slice(0, -1)) : a.startsWith(".") ? file.name.toLowerCase().endsWith(a) : file.type.toLowerCase() === a))

/** A dashed box that takes files by dropping them on it, or by clicking it. */
export function DropZone({ accept, multiple, onFiles, children, label, className, onOpen }: DropZoneProps) {
  const open = () => (onOpen ? onOpen() : input.current?.click())
  const input = React.useRef<HTMLInputElement>(null)
  const [over, setOver] = React.useState(false)

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => matches(f, accept))
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1))
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={open}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open())}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        take(e.dataTransfer.files)
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-5 text-center text-xs text-muted-foreground transition-colors",
        over ? "border-select bg-secondary text-foreground" : "border-border bg-secondary/40 hover:border-select/60 hover:bg-secondary",
        className,
      )}
    >
      {children}
      <Input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          take(e.target.files)
          e.target.value = ""
        }}
      />
    </div>
  )
}
