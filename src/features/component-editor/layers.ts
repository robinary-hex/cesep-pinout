import type { IconName } from '@/ui/icons'
import type { ToolId } from './tools'

// Calques de travail de l'éditeur de composants (décision du 18 novembre 2026). Un composant a
// trois sortes de choses : son dessin (formes, textes, images), ses broches, ses empreintes.
// Les voir toutes à la fois se lit mal : un calque n'en garde qu'une sous la main. Le reste est
// estompé et hors d'atteinte (on clique et on entoure à travers) ; les empreintes, elles, ne se
// voient que sur leur calque ou quand on montre tout. Ce n'est qu'une façon de regarder : rien
// n'en est enregistré dans le composant.

export type EditorLayer = 'all' | 'drawing' | 'pins' | 'footprint'

export interface LayerInfo {
  id: EditorLayer
  label: string
  /** L'infobulle de son bouton : son nom, sans plus. */
  tip: string
  /** Ce que la barre d'état dit quand on y passe. */
  status: string
  icon: IconName
}

export const LAYERS: readonly LayerInfo[] = [
  {
    id: 'all',
    label: 'Tout',
    tip: 'Tous les calques',
    status: 'Tout le composant : dessin, broches et empreintes.',
    icon: 'layers'
  },
  {
    id: 'drawing',
    label: 'Dessin',
    tip: 'Calque Dessin',
    status: 'Calque Dessin : les broches sont estompées, les empreintes cachées.',
    icon: 'shapes'
  },
  {
    id: 'pins',
    label: 'Broches',
    tip: 'Calque Broches',
    status: 'Calque Broches : le dessin est estompé, les empreintes cachées.',
    icon: 'pins'
  },
  {
    id: 'footprint',
    label: 'Empreintes',
    tip: 'Calque Empreintes',
    status: 'Calque Empreintes : ce qu’on trace en devient une ; le reste est estompé.',
    icon: 'footprint'
  }
]

export function layerInfo(layer: EditorLayer): LayerInfo {
  return LAYERS.find((entry) => entry.id === layer) ?? (LAYERS[0] as LayerInfo)
}

/** Un outil a-t-il quelque chose à faire sur ce calque : ce qu'il pose s'y voit et s'y retouche ? */
export function toolFitsLayer(tool: ToolId, layer: EditorLayer): boolean {
  if (tool === 'select' || layer === 'all') return true
  if (tool === 'pin') return layer === 'pins'
  // Rectangle, ellipse, ligne et polyligne font aussi des empreintes.
  if (tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'polyline') {
    return layer !== 'pins'
  }
  return layer === 'drawing'
}

/** Calque où mène un outil qui n'a rien à faire sur celui qu'on regarde. */
export function layerForTool(tool: ToolId): EditorLayer {
  return tool === 'pin' ? 'pins' : 'drawing'
}
