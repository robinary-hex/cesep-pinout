import {
  DIAGRAM_FONT_FAMILIES,
  estimatedNodeTextWidth,
  NODE_BOLD_WEIGHT,
  type NodeTextMeasurer
} from '@/domain'

// Mesure du texte d'un nœud de diagramme, pour l'ajuster à ce qu'on y écrit : la vraie largeur,
// prise sur un canevas 2D hors écran, dans la police, la graisse et la taille de chaque ligne.
// Sans navigateur (tests), l'estimation du domaine prend le relais.

let context: CanvasRenderingContext2D | null | undefined

function measuringContext(): CanvasRenderingContext2D | null {
  if (context !== undefined) return context
  // jsdom annonce un canevas mais ne sait pas le dessiner : on ne lui demande rien.
  if (typeof document === 'undefined' || navigator.userAgent.includes('jsdom')) {
    context = null
    return context
  }
  context = document.createElement('canvas').getContext('2d')
  return context
}

/** Mesureur des lignes d'un nœud, en cellules, pour une taille de cellule à 100 %. */
export function nodeTextMeasurer(cellPx: number): NodeTextMeasurer {
  const ctx = measuringContext()
  if (!ctx) return estimatedNodeTextWidth
  return (line) => {
    const style = line.italic ? 'italic' : 'normal'
    const weight = line.bold ? NODE_BOLD_WEIGHT : '400'
    ctx.font = `${style} ${weight} ${line.size * cellPx}px ${DIAGRAM_FONT_FAMILIES[line.font]}`
    return ctx.measureText(line.text).width / cellPx
  }
}
