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

/** Dossier d'un chemin de fichier (sans le séparateur final) ; le chemin lui-même sans séparateur. */
export function dirOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index > 0 ? path.slice(0, index) : path
}

/** Même fichier ? Windows ne distingue ni la casse ni le sens des séparateurs. */
export function samePath(a: string, b: string): boolean {
  const normalize = (path: string): string => path.replace(/\\/g, '/').toLowerCase()
  return normalize(a) === normalize(b)
}

export function baseName(path: string): string {
  const segments = path.split(/[\\/]/).filter((segment) => segment.length > 0)
  return segments.at(-1) ?? path
}
