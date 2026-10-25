import * as React from "react"
import { Button } from "@/components/ui/button"
import { GenerationMode } from "@/types"

interface SliderItem {
  id: string
  title: string
  fileName: string
  mode: GenerationMode
  defaultPrompt: string
}

const SLIDER_ITEMS: SliderItem[] = [
  {
    id: "item-01",
    title: "Image",
    fileName: "01_image.png",
    mode: "image",
    defaultPrompt: "Cinematic portrait with 35mm anamorphic lens, dramatic chiaroscuro lighting, photorealistic 8k",
  },
  {
    id: "item-02",
    title: "Video",
    fileName: "02_video.png",
    mode: "video",
    defaultPrompt: "Cyberpunk courier running across rain-slicked neon street, camera tracking low angle 35mm",
  },
  {
    id: "item-03",
    title: "Audio",
    fileName: "03_audio.png",
    mode: "audio",
    defaultPrompt: "Deep atmospheric cinematic cello score with subtle electronic pulses and rain foley",
  },
  {
    id: "item-04",
    title: "Agent",
    fileName: "04_agent.png",
    mode: "plan",
    defaultPrompt: "Decompose a sci-fi orbital mystery narrative into 3 continuous 10s visual beats",
  },
  {
    id: "item-05",
    title: "Batch",
    fileName: "05_batch-generation.png",
    mode: "image",
    defaultPrompt: "Character turnaround study, 4-angle frontal, profile, 45-degree, and action poses",
  },
  {
    id: "item-06",
    title: "Brand",
    fileName: "06_brand.png",
    mode: "image",
    defaultPrompt: "Modern architectural glass pavilion in Scandinavian mist, minimalist brand signature",
  },
  {
    id: "item-07",
    title: "Skills",
    fileName: "07_skills.png",
    mode: "video",
    defaultPrompt: "Lone astronaut inspecting crystalline alien flora on red soil, terminal frame bridged",
  },
  {
    id: "item-08",
    title: "Story",
    fileName: "08_story.png",
    mode: "video",
    defaultPrompt: "Establishing drone flyover above ancient mist-shrouded temple, transitioning into courtyard",
  },
]

interface HomeHeroSliderProps {
  isDark: boolean
  onSelectPrompt: (prompt: string, mode?: GenerationMode) => void
}

/**
 * Magnetic Card with tactile cursor-following physics:
 * Pulls towards the cursor, scales smoothly, tilts in 3D perspective,
 * and uses the exact dark/light background of the 3D graphic.
 */
function MagneticCard({
  item,
  isDark,
  isDraggingRef,
  onSelectPrompt,
}: {
  item: SliderItem
  isDark: boolean
  isDraggingRef: React.RefObject<boolean>
  onSelectPrompt: (prompt: string, mode?: GenerationMode) => void
}) {
  const cardRef = React.useRef<HTMLButtonElement>(null)
  const [transform, setTransform] = React.useState("")
  const [isHovered, setIsHovered] = React.useState(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    // Distance normalized (-1 to 1)
    const deltaX = (e.clientX - centerX) / (rect.width / 2)
    const deltaY = (e.clientY - centerY) / (rect.height / 2)

    // Magnetic pull in direction of cursor (up to 9px)
    const pullX = (deltaX * 9).toFixed(1)
    const pullY = (deltaY * 9).toFixed(1)

    // 3D perspective tilt
    const tiltX = (-deltaY * 13).toFixed(1)
    const tiltY = (deltaX * 13).toFixed(1)

    setTransform(
      `perspective(600px) translate3d(${pullX}px, ${pullY}px, 0) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.1, 1.1, 1)`
    )
  }

  const handleMouseEnter = () => {
    setIsHovered(true)
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    setTransform("perspective(600px) translate3d(0px, 0px, 0px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)")
    setTimeout(() => setTransform(""), 220)
  }

  const folder = isDark ? "dark" : "light"
  const imgPath = `/home/${folder}/${item.fileName}`

  return (
    <Button
      ref={cardRef}
      variant="ghost"
      type="button"
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={() => {
        if (!isDraggingRef.current) {
          onSelectPrompt(item.defaultPrompt, item.mode)
        }
      }}
      className={`group/card relative flex-shrink-0 w-28 p-0 h-auto bg-transparent border-0 shadow-none hover:bg-transparent flex flex-col items-center cursor-pointer transition-transform ${
        isHovered ? "duration-75 ease-out z-20" : "duration-300 ease-out z-10"
      }`}
      style={transform ? { transform } : undefined}
    >
      {/* Big 3D Image Icon Container - Exact background match with image render */}
      <div
        className={`relative w-28 h-28 rounded-2xl overflow-hidden shadow-md group-hover/card:shadow-2xl transition-all duration-300 flex items-center justify-center border border-border/40 ${
          isDark ? "bg-black" : "bg-secondary"
        }`}
      >
        <img
          src={imgPath}
          alt={item.title}
          className="w-full h-full object-cover pointer-events-none transition-transform duration-300 group-hover/card:scale-105"
          loading="lazy"
        />
      </div>

      {/* Clean Single Word Label */}
      <div className="pt-2 text-center w-full">
        <span className="text-xs font-semibold text-foreground tracking-tight block truncate transition-colors group-hover/card:text-primary">
          {item.title}
        </span>
      </div>
    </Button>
  )
}

export function HomeHeroSlider({ isDark, onSelectPrompt }: HomeHeroSliderProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const isDraggingRef = React.useRef(false)
  const startXRef = React.useRef(0)
  const scrollLeftRef = React.useRef(0)
  const isHoveredRef = React.useRef(false)
  const [isDragging, setIsDragging] = React.useState(false)

  // Duplicated items for smooth infinite seamless wrap
  const doubledItems = React.useMemo(() => [...SLIDER_ITEMS, ...SLIDER_ITEMS], [])

  // Auto-scrolling loop with requestAnimationFrame that pauses on hover or user drag
  React.useEffect(() => {
    let animId: number
    const speed = 0.55 // Continuous smooth scroll speed (pixels per frame)

    const step = () => {
      if (containerRef.current && !isHoveredRef.current && !isDraggingRef.current) {
        const el = containerRef.current
        el.scrollLeft += speed

        // Infinite loop wrap check
        const halfWidth = el.scrollWidth / 2
        if (el.scrollLeft >= halfWidth) {
          el.scrollLeft = 0
        }
      }
      animId = requestAnimationFrame(step)
    }

    animId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(animId)
  }, [])

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return
    isDraggingRef.current = true
    setIsDragging(true)
    startXRef.current = e.pageX - containerRef.current.offsetLeft
    scrollLeftRef.current = containerRef.current.scrollLeft
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return
    e.preventDefault()
    const x = e.pageX - containerRef.current.offsetLeft
    const walk = (x - startXRef.current) * 1.5
    containerRef.current.scrollLeft = scrollLeftRef.current - walk
  }

  const handleMouseUpOrLeave = () => {
    isDraggingRef.current = false
    setIsDragging(false)
  }

  const handleMouseEnter = () => {
    isHoveredRef.current = true
  }

  const handleMouseLeaveContainer = () => {
    isHoveredRef.current = false
    isDraggingRef.current = false
    setIsDragging(false)
  }

  return (
    <div className="w-full flex flex-col items-center justify-center text-center animate-fade-in select-none py-3">
      {/* 1. TOP HERO TITLE (Universal Imagination) - Clean, no top badge */}
      <div className="space-y-1 mb-5 px-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          Universal Imagination
        </h1>
        <p className="text-xs text-muted-foreground max-w-lg mx-auto">
          Describe what you want, pick a model, and keep your characters consistent with Elements
        </p>
      </div>

      {/* 2. INFINITE CONTINUOUS DRAGGABLE SLIDER - Zero scrollbar, zero bottom slide track */}
      <div
        className="relative w-full overflow-hidden group"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeaveContainer}
      >
        {/* Left Vignette Edge Blur */}
        <div className="absolute left-0 top-0 bottom-0 w-24 md:w-36 bg-gradient-to-r from-background via-background/80 to-transparent z-10 pointer-events-none" />

        {/* Right Vignette Edge Blur */}
        <div className="absolute right-0 top-0 bottom-0 w-24 md:w-36 bg-gradient-to-l from-background via-background/80 to-transparent z-10 pointer-events-none" />

        {/* Scrollable Track - No scrollbar visible */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          className={`flex gap-4 overflow-x-auto no-scrollbar py-3 px-8 md:px-16 ${
            isDragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {doubledItems.map((item, idx) => (
            <MagneticCard
              key={`${item.id}-${idx}`}
              item={item}
              isDark={isDark}
              isDraggingRef={isDraggingRef}
              onSelectPrompt={onSelectPrompt}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
