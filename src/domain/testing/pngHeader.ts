/**
 * Data URL d'un « PNG » réduit à son en-tête (24 octets) : assez pour en lire les dimensions.
 * Pour les tests ; ce n'est pas une image affichable.
 */
export function pngHeaderDataUrl(width: number, height: number): string {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return 'data:image/png;base64,' + btoa(String.fromCharCode(...bytes))
}
