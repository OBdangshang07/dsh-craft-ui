import { validRegion, type Region, type ViewedImage } from '../../workbench.ts'
import type { ImageLoader } from './images.tsx'

/** A bounded, explicitly derived download. Never overwrites or reattaches a source. */
export async function markedImage(image: ViewedImage, region: Region, load: ImageLoader): Promise<Blob> {
  if (!validRegion(region)) throw new Error('Invalid image region')
  const url = await load(image.attachment)
  const bitmap = new Image()
  bitmap.src = url
  await bitmap.decode()
  const width = bitmap.naturalWidth, height = bitmap.naturalHeight
  if (!width || !height || width * height > 40_000_000) throw new Error('Image is too large to export')
  const scale = Math.min(1, 4096 / Math.max(width, height), Math.sqrt(4_000_000 / (width * height)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale))
  try {
    const paint = canvas.getContext('2d')
    if (!paint) throw new Error('Canvas unavailable')
    paint.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const x = region.x * canvas.width, y = region.y * canvas.height, w = region.width * canvas.width, h = region.height * canvas.height
    paint.lineWidth = Math.max(1, Math.min(5, canvas.width / 300))
    paint.strokeStyle = '#ff433d'; paint.strokeRect(x, y, w, h)
    const labelSize = Math.min(22, Math.max(10, canvas.width / 30))
    paint.fillStyle = '#a81414'; paint.fillRect(x, y, labelSize, labelSize)
    paint.font = `bold ${Math.round(labelSize * 0.75)}px monospace`; paint.fillStyle = '#fff'
    paint.fillText('1', x + labelSize * 0.25, y + labelSize * 0.8)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png'))
  } finally { canvas.width = 1; canvas.height = 1 }
}

export function downloadImage(blob: Blob) {
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = 'craft-annotated-derived.png'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
