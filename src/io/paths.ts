/**
 * Assemble des segments de chemin avec le séparateur du premier (« \ » pour un chemin
 * Windows, « / » sinon), pour que les chemins affichés restent homogènes ; Node accepte les deux.
 */
export function joinPath(...parts: string[]): string {
  const kept = parts.filter((part) => part.length > 0)
  const separator = kept[0]?.includes('\\') ? '\\' : '/'
  return kept
    .map((part, index) =>
      index === 0 ? part.replace(/[\\/]+$/, '') : part.replace(/^[\\/]+|[\\/]+$/g, '')
    )
    .join(separator)
}

export function baseName(path: string): string {
  const segments = path.split(/[\\/]/).filter((segment) => segment.length > 0)
  return segments.at(-1) ?? path
}
