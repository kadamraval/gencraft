import { strFromU8, unzipSync } from "fflate"

/**
 * Reads the text of a PDF, a Word file or an Excel sheet so it can be sent with a chat message, the same way a text file is. The reader is loaded only
 * when a PDF is added, so it costs nothing until then. A scanned PDF (pictures of pages) has no text and says so.
 */

const MAX_PAGES = 60

export async function readPdfText(file: File): Promise<{ text: string; pages: number; cutAtPage?: number }> {
  const pdfjs = await import("pdfjs-dist")
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const parts: string[] = []
  const last = Math.min(doc.numPages, MAX_PAGES)
  for (let i = 1; i <= last; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const line = content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
    if (line) parts.push(`[Page ${i}] ${line}`)
  }
  const text = parts.join("\n\n")
  if (!text) throw new Error("This PDF has no readable text. It may be scanned pictures of pages.")
  return { text, pages: doc.numPages, cutAtPage: doc.numPages > MAX_PAGES ? MAX_PAGES : undefined }
}

const decode = (t: string) =>
  t
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")

const unzip = async (file: File, keep: (name: string) => boolean) => unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => keep(f.name) })

/** The text of a .docx: paragraphs, line breaks and tabs kept, formatting dropped */
export async function readDocxText(file: File): Promise<string> {
  const files = await unzip(file, (n) => n === "word/document.xml")
  const xml = files["word/document.xml"]
  if (!xml) throw new Error("This does not look like a Word (.docx) file.")
  const text = decode(
    strFromU8(xml)
      .replace(/<w:tab\s*\/>/g, "\t")
      .replace(/<w:br\b[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  if (!text) throw new Error("This Word file has no text in it.")
  return text
}

const MAX_ROWS = 400
const colIndex = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1

/** The cells of a .xlsx, one tab-separated block per sheet (the first 400 rows of each) */
export async function readXlsxText(file: File): Promise<string> {
  const files = await unzip(file, (n) => n === "xl/sharedStrings.xml" || n === "xl/workbook.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
  const sheets = Object.keys(files)
    .filter((n) => n.startsWith("xl/worksheets/"))
    .sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")))
  if (sheets.length === 0) throw new Error("This does not look like an Excel (.xlsx) file.")
  const shared = files["xl/sharedStrings.xml"] ? [...strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decode([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""))) : []
  const names = files["xl/workbook.xml"] ? [...strFromU8(files["xl/workbook.xml"]).matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((m) => decode(m[1]!)) : []
  const blocks: string[] = []
  for (const [i, path] of sheets.entries()) {
    const rows: string[] = []
    for (const row of strFromU8(files[path]!).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      if (rows.length >= MAX_ROWS) break
      const cells: string[] = []
      for (const c of row[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1] ?? ""
        const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1]
        const type = /\bt="(\w+)"/.exec(attrs)?.[1]
        const body = c[2] ?? ""
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
        const inline = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")
        const value = type === "s" && v !== undefined ? (shared[Number(v)] ?? "") : type === "inlineStr" ? decode(inline) : v !== undefined ? decode(v) : ""
        if (ref) cells[colIndex(ref)] = value
      }
      rows.push(Array.from(cells, (x) => x ?? "").join("\t").replace(/\t+$/, ""))
    }
    const body = rows.filter((r) => r.length > 0).join("\n")
    if (body) blocks.push(`[Sheet: ${names[i] ?? `Sheet${i + 1}`}]\n${body}`)
  }
  if (blocks.length === 0) throw new Error("This Excel file has no data in it.")
  return blocks.join("\n\n")
}
