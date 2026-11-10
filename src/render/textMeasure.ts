import {
  DIAGRAM_FONT_FAMILIES,
  estimatedNodeTextMeasurer,
  nodeTextAttrs,
  type DiagramStyle,
  type NodeTextMeasurer
} from '@/domain'

// Mesure du texte d'un nœud de diagramme, pour l'ajuster à ce qu'on y écrit : la vraie largeur,
// prise sur un canevas 2D hors écran, dans la police et la graisse du dessin. Sans navigateur
// (tests), l'estimation du domaine prend le relais.

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

/** Mesureur des lignes d'un nœud, en cellules, pour le style d'un diagramme. */
export function nodeTextMeasurer(style: DiagramStyle): NodeTextMeasurer {
  const ctx = measuringContext()
  if (!ctx) return estimatedNodeTextMeasurer(style)
  const family = DIAGRAM_FONT_FAMILIES[style.font]
  return (text, role) => {
    const attrs = nodeTextAttrs(role, style.font)
    const size = role === 'title' ? style.titleSize : style.subtitleSize
    ctx.font = `${attrs['font-style'] ?? 'normal'} ${attrs['font-weight'] ?? '400'} ${size}px ${family}`
    return ctx.measureText(text).width / style.cellPx
  }
}
