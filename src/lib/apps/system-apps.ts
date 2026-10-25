import type { AppSpec } from "./types"

/**
 * The apps that come with the studio. They are recipes like any other, with no special code: the same app screen runs them,
 * and a person can remix one into their own. They name no model ("auto"), so they work with whatever the person has switched on.
 */

export const SYSTEM_APPS: AppSpec[] = [
  {
    id: "sys_pdf_summary",
    name: "PDF summary",
    icon: "file-text",
    color: "blue",
    description: "Upload a PDF and get a clear summary of it.",
    system: true,
    inputs: [
      { id: "file", label: "PDF", type: "pdf", icon: "file-text", required: true, hint: "Text PDFs only. Scanned pages cannot be read." },
      { id: "length", label: "Length", type: "select", options: ["Short", "Medium", "Detailed"], default: "Medium" },
      { id: "focus", label: "What to focus on", type: "text", placeholder: "Optional, for example the pricing" },
    ],
    steps: [
      { id: "read", title: "Reading the PDF", kind: "read_pdf", source: "file" },
      {
        id: "summary",
        title: "Writing the summary",
        kind: "text",
        system: "You summarise documents accurately. Use only what the document says. If something is not in it, do not guess.",
        prompt: "Summarise this document. Length: {length}. {focus}\n\nDocument:\n{read}",
      },
    ],
  },
  {
    id: "sys_product_photo",
    name: "Product photo studio",
    icon: "camera",
    color: "amber",
    description: "Turn a product picture into a professional photo.",
    system: true,
    inputs: [
      { id: "product", label: "Product picture", type: "image", kind: "product", icon: "package", required: true },
      { id: "scene", label: "Scene", type: "longtext", placeholder: "For example on a marble table next to a plant" },
      { id: "style", label: "Style", type: "select", options: ["Clean white background", "Lifestyle", "Dark and premium", "Colourful"], default: "Clean white background" },
    ],
    steps: [
      {
        id: "photo",
        title: "Making the photo",
        kind: "image",
        model: "auto",
        references: ["product"],
        prompt: "A professional product photograph of {product}. Keep the product exactly as it is. Style: {style}. {scene}",
      },
    ],
  },
  {
    id: "sys_architect_render",
    name: "Architect 3D render",
    icon: "building",
    color: "teal",
    description: "Turn a drawing or sketch into a realistic 3D render.",
    system: true,
    inputs: [
      { id: "drawing", label: "Drawing or sketch", type: "image", kind: "drawing", icon: "pen-tool", required: true, hint: "A plan, an elevation or a hand sketch." },
      { id: "style", label: "Style", type: "select", options: ["Modern", "Classic", "Minimal", "Industrial", "Tropical"], default: "Modern" },
      { id: "time", label: "Time of day", type: "select", options: ["Day", "Golden hour", "Night"], default: "Day" },
      { id: "notes", label: "Notes", type: "longtext", placeholder: "Materials, surroundings, mood" },
    ],
    steps: [
      {
        id: "render",
        title: "Making the render",
        kind: "image",
        model: "auto",
        references: ["drawing"],
        prompt: "A photorealistic 3D architectural render based closely on {drawing}. Style: {style}. Lighting: {time}. {notes}",
      },
    ],
  },
  {
    id: "sys_social_posts",
    name: "Social post writer",
    icon: "megaphone",
    color: "pink",
    description: "Write post ideas for any topic, ready to adjust.",
    system: true,
    inputs: [
      { id: "topic", label: "Topic", type: "longtext", required: true, placeholder: "What is the post about?" },
      { id: "tone", label: "Tone", type: "select", options: ["Friendly", "Professional", "Playful", "Bold"], default: "Friendly" },
      { id: "platform", label: "Platform", type: "select", options: ["Instagram", "LinkedIn", "X", "Facebook"], default: "Instagram" },
    ],
    steps: [
      {
        id: "posts",
        title: "Writing the posts",
        kind: "text",
        system: "You write social posts that sound human. No hashtags spam, no invented facts.",
        prompt: "Write 3 different post options for {platform} about: {topic}. Tone: {tone}. Fit the usual length for the platform.",
      },
    ],
  },
]
