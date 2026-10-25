/**
 * Brand images are kept inside the kit, so they are shrunk first: a logo to 256 px (kept as PNG so a clear
 * background stays clear), anything else to 720 px as JPEG.
 */
export function shrinkImage(file: File, kind: "logo" | "photo"): Promise<string> {
  const max = kind === "logo" ? 256 : 720
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
      const ctx = canvas.getContext("2d")
      if (!ctx) return reject(new Error("This window cannot read the image."))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(kind === "logo" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.82))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`"${file.name}" is not an image this window can open.`))
    }
    img.src = url
  })
}
