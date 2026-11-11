/**
 * Lit un code de couleur tapé ou collé : « #d62828 », « d62828 », ou la forme courte « #d28 »,
 * majuscules ou minuscules, espaces autour permis. Rend la forme que l'application garde
 * (#rrggbb, en minuscules), ou null si ce n'en est pas un.
 */
export function parseHexColor(text: string): string | null {
  const digits = text.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{6}$/.test(digits)) return `#${digits}`
  if (/^[0-9a-f]{3}$/.test(digits)) {
    return `#${[...digits].map((digit) => digit + digit).join('')}`
  }
  return null
}
