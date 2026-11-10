import { describe, expect, it } from 'vitest'
import {
  base64ToBytes,
  dataUrlToBase64,
  pngDataUrl,
  pngDataUrlDimensions,
  pngDimensions
} from './png'
import { pngHeaderDataUrl } from './testing/pngHeader'

// PNG de 1 × 1 pixel, le même que dans le fixture de projet.
const ONE_PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('lecture de PNG', () => {
  it('lit les dimensions dans l’en-tête', () => {
    expect(pngDimensions(base64ToBytes(ONE_PIXEL))).toEqual({ width: 1, height: 1 })
  })

  it('rejette ce qui n’est pas un PNG', () => {
    expect(pngDimensions(new Uint8Array([1, 2, 3]))).toBeNull()
    expect(pngDimensions(base64ToBytes(btoa('GIF89a' + 'x'.repeat(30))))).toBeNull()
  })

  it('convertit entre base64 et data URL', () => {
    const url = pngDataUrl(ONE_PIXEL)
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
    expect(dataUrlToBase64(url)).toBe(ONE_PIXEL)
    expect(() => dataUrlToBase64('data:image/jpeg;base64,abc')).toThrow(/png/i)
  })
})

describe('dimensions d’un PNG en data URL', () => {
  it('se lisent dans son seul en-tête', () => {
    expect(pngDataUrlDimensions(pngDataUrl(ONE_PIXEL))).toEqual({ width: 1, height: 1 })
    expect(pngDataUrlDimensions(pngHeaderDataUrl(160, 240))).toEqual({ width: 160, height: 240 })
  })

  it('sont nulles pour tout autre contenu', () => {
    expect(pngDataUrlDimensions('data:image/jpeg;base64,AAAA')).toBeNull()
    expect(pngDataUrlDimensions('data:image/png;base64,!!!')).toBeNull()
    expect(pngDataUrlDimensions('data:image/png;base64,AAAA')).toBeNull()
  })
})
