const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export interface PngDimensions {
  width: number
  height: number
}

/** Lit largeur et hauteur dans l'en-tête IHDR ; null si ce n'est pas un PNG. */
export function pngDimensions(bytes: Uint8Array): PngDimensions | null {
  if (bytes.length < 24) return null
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null
  }
  const chunkType = String.fromCharCode(
    bytes[12] ?? 0,
    bytes[13] ?? 0,
    bytes[14] ?? 0,
    bytes[15] ?? 0
  )
  if (chunkType !== 'IHDR') return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const DATA_URL_PREFIX = 'data:image/png;base64,'

export function pngDataUrl(base64: string): string {
  return DATA_URL_PREFIX + base64
}

/** Partie base64 d'un data URL PNG ; lève une erreur sur tout autre contenu. */
export function dataUrlToBase64(dataUrl: string): string {
  if (!dataUrl.startsWith(DATA_URL_PREFIX)) {
    throw new Error('Image attendue au format data:image/png;base64')
  }
  return dataUrl.slice(DATA_URL_PREFIX.length)
}

/** Dimensions d'un PNG en data URL, lues dans son seul en-tête (24 octets, 32 caractères). */
export function pngDataUrlDimensions(dataUrl: string): PngDimensions | null {
  if (!dataUrl.startsWith(DATA_URL_PREFIX)) return null
  const header = dataUrl.slice(DATA_URL_PREFIX.length, DATA_URL_PREFIX.length + 32)
  try {
    return pngDimensions(base64ToBytes(header))
  } catch {
    return null
  }
}
