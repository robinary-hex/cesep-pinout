/** Assemble des segments de chemin avec « / » ; Node accepte ce séparateur aussi sous Windows. */
export function joinPath(...parts: string[]): string {
  return parts
    .filter((part) => part.length > 0)
    .map((part, index) =>
      index === 0 ? part.replace(/[\\/]+$/, '') : part.replace(/^[\\/]+|[\\/]+$/g, '')
    )
    .join('/')
}

export function baseName(path: string): string {
  const segments = path.split(/[\\/]/).filter((segment) => segment.length > 0)
  return segments.at(-1) ?? path
}
