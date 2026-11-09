import { slugify } from '@/domain'
import { bridge } from './bridge'
import { baseName, dirOf, joinPath } from './paths'

export type ExportKind = 'png' | 'svg'

/** Nom de fichier proposé : celui du projet enregistré, sinon le nom du montage en slug. */
export function defaultExportName(
  projectName: string,
  projectPath: string | null,
  kind: ExportKind
): string {
  const base = projectPath
    ? baseName(projectPath)
        .replace(/\.pinout\.json$/i, '')
        .replace(/\.json$/i, '')
    : slugify(projectName)
  return `${base}.${kind}`
}

/** Dialogue d'enregistrement de l'image, à côté du projet s'il est enregistré. */
export async function chooseExportPath(
  kind: ExportKind,
  projectName: string,
  projectPath: string | null
): Promise<string | null> {
  const name = defaultExportName(projectName, projectPath, kind)
  const dir = projectPath ? dirOf(projectPath) : (await bridge().getAppPaths()).documents
  const path = await bridge().showSaveDialog({
    title: kind === 'png' ? 'Exporter en PNG' : 'Exporter en SVG',
    defaultPath: joinPath(dir, name),
    filters: [
      kind === 'png'
        ? { name: 'Image PNG', extensions: ['png'] }
        : { name: 'Image SVG', extensions: ['svg'] }
    ]
  })
  if (path === null) return null
  return path.toLowerCase().endsWith(`.${kind}`) ? path : `${path}.${kind}`
}
