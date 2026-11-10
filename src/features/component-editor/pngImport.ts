import { base64ToBytes, pngDataUrl, pngDimensions } from '@/domain'
import { bridge } from '@/io/bridge'
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
  if (path === null) return null
  const base64 = await bridge().readBinaryFile(path)
  const dimensions = pngDimensions(base64ToBytes(base64))
  if (!dimensions) throw new Error('Ce fichier n’est pas un PNG valide.')
  return { path, dataUrl: pngDataUrl(base64), ...dimensions }
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
    if (!picked) return
    store.importImage(picked.dataUrl, picked.width, picked.height)
    store.status = `Image de ${picked.width} × ${picked.height} px importée.`
  } catch (error) {
    store.status = `Import impossible : ${error instanceof Error ? error.message : String(error)}`
  }
}
