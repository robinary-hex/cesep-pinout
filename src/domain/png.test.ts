import { describe, expect, it } from 'vitest'
import { base64ToBytes, dataUrlToBase64, fitPngToCells, pngDataUrl, pngDimensions } from './png'

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

describe('ajustement d’un PNG à la grille', () => {
  it('accepte un multiple exact de 80 px', () => {
    expect(fitPngToCells(480, 1120)).toEqual({
      widthCells: 6,
      heightCells: 14,
      exact: true,
      targetWidth: 480,
      targetHeight: 1120
    })
  })

  it('propose la taille entière la plus proche sinon', () => {
    const fit = fitPngToCells(500, 1100)
    expect(fit.exact).toBe(false)
    expect([fit.widthCells, fit.heightCells]).toEqual([6, 14])
    expect([fit.targetWidth, fit.targetHeight]).toEqual([480, 1120])
  })

  it('ne descend jamais sous une cellule', () => {
    expect(fitPngToCells(10, 10).widthCells).toBe(1)
  })
})
