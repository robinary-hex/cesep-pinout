import { base64ToBytes, pngDataUrl, pngDimensions } from '@/domain'
import { bridge } from '@/io/bridge'

export interface PickedPng {
  path: string
  dataUrl: string
  width: number
  height: number
}

/** Ouvre le dialogue, lit le PNG et ses dimensions ; null si l'utilisateur annule. */
export async function pickPng(): Promise<PickedPng | null> {
  const path = await bridge().showOpenDialog({
    title: 'Importer une image PNG (80 px par cellule)',
    filters: [{ name: 'Image PNG', extensions: ['png'] }]
  })
  if (path === null) return null
  const base64 = await bridge().readBinaryFile(path)
  const dimensions = pngDimensions(base64ToBytes(base64))
  if (!dimensions) throw new Error('Ce fichier n’est pas un PNG valide.')
  return { path, dataUrl: pngDataUrl(base64), ...dimensions }
}

/** Rééchantillonne une image PNG aux dimensions voulues, via un canvas du navigateur. */
export function resizePng(dataUrl: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Canvas 2D indisponible'))
        return
      }
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, width, height)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => reject(new Error('Image illisible'))
    image.src = dataUrl
  })
}
