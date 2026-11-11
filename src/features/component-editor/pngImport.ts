import { base64ToBytes, pngDataUrl, pngDimensions } from '@/domain'
import { bridge } from '@/io/bridge'
import { baseName } from '@/io/paths'
import type { useComponentEditorStore } from './store'

export interface PickedPng {
  path: string
  dataUrl: string
  width: number
  height: number
}

/** Ouvre le dialogue, lit le PNG et ses dimensions ; null si l'utilisateur annule. */
export async function pickPng(): Promise<PickedPng | null> {
  const path = await bridge().showOpenDialog({
    title: 'Importer une image PNG (80 px par cellule)',
    filters: [{ name: 'Image PNG', extensions: ['png'] }]
  })
  return path === null ? null : readPng(path)
}

/** Lit un PNG et ses dimensions ; lève une erreur si le fichier n'en est pas un. */
export async function readPng(path: string): Promise<PickedPng> {
  const base64 = await bridge().readBinaryFile(path)
  const dimensions = pngDimensions(base64ToBytes(base64))
  if (!dimensions) throw new Error('Ce fichier n’est pas un PNG valide.')
  return { path, dataUrl: pngDataUrl(base64), ...dimensions }
}

/** Fichier d'image, d'après son nom : ce qu'on peut vouloir déposer dans un composant. */
export function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(path)
}

/**
 * Importer une image : le dialogue, puis l'image posée comme une forme du composant affiché. Un
 * fichier illisible le dit dans la barre d'état.
 */
export async function importImage(
  store: ReturnType<typeof useComponentEditorStore>
): Promise<void> {
  try {
    const picked = await pickPng()
    if (picked) place(store, picked)
  } catch (error) {
    store.status = `Import impossible : ${error instanceof Error ? error.message : String(error)}`
  }
}

/**
 * Importer l'image d'un fichier donné (déposé dans la fenêtre) : posée comme par le bouton Image,
 * sans dialogue. Seul le PNG s'importe ; une autre image, ou un fichier illisible, le dit dans la
 * barre d'état.
 */
export async function importImageFile(
  store: ReturnType<typeof useComponentEditorStore>,
  path: string
): Promise<void> {
  if (!/\.png$/i.test(path)) {
    store.status = `Import impossible : seules les images PNG s’importent (${baseName(path)}).`
    return
  }
  try {
    place(store, await readPng(path))
  } catch (error) {
    store.status = `Import impossible : ${error instanceof Error ? error.message : String(error)}`
  }
}

function place(store: ReturnType<typeof useComponentEditorStore>, picked: PickedPng): void {
  store.importImage(picked.dataUrl, picked.width, picked.height)
  store.status = `Image de ${picked.width} × ${picked.height} px importée.`
}
