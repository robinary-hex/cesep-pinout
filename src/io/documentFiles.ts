import { bridge } from './bridge'
import { joinPath } from './paths'

// Fichiers d'un dossier de documents : ceux de `Montages` ou de `Diagrammes`, dans le dossier de
// Pinout, que l'onglet « Fichiers » du panneau latéral propose d'ouvrir d'un clic (décision du
// 18 novembre 2026). Les sous-dossiers comptent : on y range ses montages par cours ou par projet.

/** Un fichier de montage ou de diagramme rangé dans le dossier des documents. */
export interface DocumentFile {
  path: string
  /** Nom du fichier, sans son extension. */
  name: string
  /** Sous-dossier qui le contient, relatif au dossier des documents ; vide à sa racine. */
  folder: string
}

/** Extensions des fichiers d'un genre de document ; les anciens montages `.pinout.json` comptent. */
const FILE_PATTERNS = {
  montage: /\.pinout(\.json)?$/i,
  diagram: /\.pinuml$/i
} as const

/** Profondeur des sous-dossiers parcourus : de quoi ranger, sans se perdre dans un dossier égaré. */
const MAX_DEPTH = 4

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' })

/**
 * Les fichiers de ce genre dans un dossier et ses sous-dossiers, par sous-dossier (la racine
 * d'abord) puis par nom. Un dossier absent ou illisible ne donne rien.
 */
export async function listDocumentFiles(
  dir: string,
  kind: keyof typeof FILE_PATTERNS
): Promise<DocumentFile[]> {
  const pattern = FILE_PATTERNS[kind]
  const files: DocumentFile[] = []
  const walk = async (current: string, folder: string, depth: number): Promise<void> => {
    let entries: Awaited<ReturnType<ReturnType<typeof bridge>['readDir']>>
    try {
      entries = await bridge().readDir(current)
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const path = joinPath(current, entry.name)
      if (entry.isDirectory) {
        if (depth < MAX_DEPTH) {
          await walk(path, folder.length > 0 ? `${folder}/${entry.name}` : entry.name, depth + 1)
        }
      } else if (pattern.test(entry.name)) {
        files.push({ path, name: entry.name.replace(pattern, ''), folder })
      }
    }
  }
  await walk(dir, '', 0)
  return files.sort(
    (a, b) => collator.compare(a.folder, b.folder) || collator.compare(a.name, b.name)
  )
}
