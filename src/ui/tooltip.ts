import { isKeyCombo } from './keyCombo'

// Infobulles de l'application (décision du 18 novembre 2026) : `TooltipHost.vue` les dessine à
// la place de celles de Windows. Ici, ce qui se calcule sans fenêtre : ce qu'une infobulle dit,
// et où elle se pose.
//
// Une infobulle s'écrit toujours dans l'attribut `title` (ou `data-tip` sur un élément SVG,
// où `title` ne dit rien) : quelques mots, puis le raccourci entre parenthèses, « Fil nu (N) ».
// Le raccourci se dessine, une touche par capuchon.

/** Longueur qu'une infobulle ne dépasse pas, raccourci à part : elle nomme, elle n'explique pas. */
export const TIP_MAX_LENGTH = 40

/** Ce que montre une infobulle : son texte, et le raccourci écrit à sa suite entre parenthèses. */
export interface TipContent {
  text: string
  /** Combinaisons équivalentes (« S / Échap » en donne deux) ; aucune s'il n'y a pas de raccourci. */
  combos: string[]
}

/**
 * Sépare le texte d'une infobulle de son raccourci : la parenthèse finale, quand elle ne contient
 * que des touches et des gestes de souris connus (`isKeyCombo`), « / » séparant deux façons de
 * faire. Toute autre parenthèse fait partie du texte.
 */
export function tipContent(title: string): TipContent {
  const whole = title.trim()
  const match = /^(.*?)\s*\(([^()]+)\)$/.exec(whole)
  const head = match?.[1]
  const tail = match?.[2]
  if (head !== undefined && tail !== undefined) {
    const combos = tail.split(' / ').map((combo) => combo.trim())
    if (combos.every(isKeyCombo)) return { text: head.trim(), combos }
  }
  return { text: whole, combos: [] }
}

/** Une boîte à l'écran, en pixels de la fenêtre. */
export interface ScreenBox {
  left: number
  top: number
  right: number
  bottom: number
}

/** Écart entre une infobulle et ce qu'elle désigne, et marge qu'elle garde au bord de la fenêtre. */
const TIP_GAP_PX = 8
const TIP_MARGIN_PX = 6

/**
 * Où poser une infobulle : centrée sous ce qu'elle désigne, sans sortir de la fenêtre ; au-dessus
 * quand la place manque dessous.
 */
export function tipPlace(
  anchor: ScreenBox,
  size: { width: number; height: number },
  viewport: { width: number; height: number }
): { left: number; top: number } {
  const centered = (anchor.left + anchor.right) / 2 - size.width / 2
  const left = Math.max(
    TIP_MARGIN_PX,
    Math.min(centered, viewport.width - size.width - TIP_MARGIN_PX)
  )
  const below = anchor.bottom + TIP_GAP_PX
  const above = anchor.top - TIP_GAP_PX - size.height
  const fitsBelow = below + size.height <= viewport.height - TIP_MARGIN_PX
  return {
    left: Math.round(left),
    top: Math.round(fitsBelow || above < TIP_MARGIN_PX ? below : above)
  }
}
