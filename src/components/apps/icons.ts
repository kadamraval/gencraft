import { BookOpen, Box, Link2, MapPin, SlidersHorizontal, Type, User, Video, Building2, Camera, Car, Coffee, FileText, Film, Globe, Heart, Home, Image as ImageIcon, Images, LayoutTemplate, Mail, Map, Megaphone, MessageSquare, Music, Package, PenTool, Palette, Plane, Scissors, Shirt, ShoppingBag, Sparkles, Star, Utensils, Wand2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"

/** The icon names an app may use (see ICONS in lib/apps/types.ts), as the icons they draw */
const MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  image: ImageIcon,
  images: Images,
  film: Film,
  music: Music,
  "file-text": FileText,
  wand: Wand2,
  palette: Palette,
  building: Building2,
  home: Home,
  shirt: Shirt,
  "shopping-bag": ShoppingBag,
  camera: Camera,
  megaphone: Megaphone,
  mail: Mail,
  "message-square": MessageSquare,
  "book-open": BookOpen,
  "pen-tool": PenTool,
  layout: LayoutTemplate,
  box: Box,
  package: Package,
  scissors: Scissors,
  heart: Heart,
  star: Star,
  coffee: Coffee,
  utensils: Utensils,
  car: Car,
  plane: Plane,
  map: Map,
  globe: Globe,
  user: User,
  "map-pin": MapPin,
  video: Video,
  link: Link2,
  type: Type,
  sliders: SlidersHorizontal,
}

export const appIcon = (name: string): LucideIcon => MAP[name] ?? Sparkles

/** The tint behind an app's icon. Whole class names, so they are kept when the styles are built. */
const COLOR: Record<string, string> = {
  slate: "bg-secondary text-foreground",
  red: "bg-red-500/15 text-red-500",
  orange: "bg-orange-500/15 text-orange-500",
  amber: "bg-amber-500/15 text-amber-500",
  green: "bg-emerald-500/15 text-emerald-500",
  teal: "bg-teal-500/15 text-teal-500",
  blue: "bg-sky-500/15 text-sky-500",
  violet: "bg-violet-500/15 text-violet-500",
  pink: "bg-pink-500/15 text-pink-500",
}

export const appColor = (name: string | undefined): string => COLOR[name ?? ""] ?? COLOR.slate!
