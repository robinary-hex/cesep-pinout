import { CAP_CENTER, TEXT_LINE_HEIGHT } from './component'
import {
  fittedNodeSize,
  NODE_SPECS,
  type DiagramFont,
  type DiagramNode,
  type DiagramStyle
} from './diagram'
import type { GridPoint, LocalPoint } from './grid'
import { boxHandles, resizeBox, type Box, type Handle } from './handles'
import type { GridRect } from './placement'
import { roundedPathData } from './roundedPath'

// Catalogue des formes d'un diagramme : ce que chaque nœud dessine (des tracés SVG en cellules,
// les mêmes à l'écran et à l'export), où se met son texte, de quelle couleur. Le canevas et
// l'export ne font que peindre ces descriptions.

/** Épaisseur d'une barre de fourche, en cellules. */
export const BAR_THICKNESS = 0.6
/**
 * Fond « teinté » : part de la couleur du nœud mêlée au papier. Sur papier clair le fond est plus
 * clair que le contour ; sur papier sombre, plus foncé, et il faut plus de couleur pour le voir.
 * L'écran lit ces parts dans `--node-tint` (style.css), l'export les calcule ici.
 */
export const TINT_SHARE = { light: 0.2, dark: 0.4 } as const
/**
 * Fond « plein » : le fond est la couleur même, et le contour s'en détache, éclairci sur une
 * couleur sombre, foncé sur une couleur claire. Part de la couleur gardée dans le contour.
 */
export const SOLID_BORDER_SHARE = 0.62
/** Rayon des pointes d'un losange, en parts du rayon des coins du diagramme (`nodeRadius`). */
export const DIAMOND_ROUNDING = 0.5
/**
 * Texte d'un nœud sans couleur propre : part de la couleur de la forme qu'il garde, le reste
 * étant l'encre du papier. À la couleur même de la forme, il se lisait mal sur son fond teinté
 * comme sur le papier ; à moitié encre, il en garde la teinte et ressort (contraste d'au moins
 * 5 sur papier clair avec la palette des diagrammes).
 */
export const NODE_TEXT_SHARE = 0.5
/** Le sous-titre s'efface un peu devant le titre. */
export const SUBTITLE_OPACITY = 0.75

function fmt(value: number): string {
  return Number(value.toFixed(4)).toString()
}

/** Profondeur de la pointe d'un envoi ou de l'encoche d'une réception, en cellules entières. */
export function signalDepth(box: { w: number; h: number }): number {
  return Math.max(1, Math.min(Math.floor(box.h / 2), Math.floor(box.w / 3)))
}

/** Côté du coin plié d'une note, en cellules entières. */
export function noteFold(box: { w: number; h: number }): number {
  return Math.max(1, Math.min(2, Math.floor(box.w / 2), Math.floor(box.h / 2)))
}

/** Retrait du haut (et du bas, à l'opposé) d'un parallélogramme d'entrée / sortie, en cellules. */
export function ioSlant(box: { w: number }): number {
  return Math.max(1, Math.min(2, Math.floor(box.w / 2)))
}

/** Profondeur des deux pointes d'un hexagone de préparation, en cellules entières. */
export function hexagonDepth(box: { w: number; h: number }): number {
  return Math.max(1, Math.min(Math.floor(box.h / 2), Math.floor(box.w / 4)))
}

/** Demi-hauteur des ellipses qui ferment un cylindre (base de données), en cellules. */
export function cylinderCap(box: { h: number }): number {
  return Math.max(0.5, Math.min(1, box.h / 6))
}

/** Écart des deux barres d'un sous-programme à ses bords, en cellules. */
export function subroutineInset(box: { w: number }): number {
  return Math.min(1, box.w / 4)
}

/** Part de la boîte d'un nuage où son texte se centre : sous le dôme, dans la partie large. */
export const CLOUD_TEXT = { left: 0.1, top: 0.3, width: 0.8, height: 0.7 } as const

/**
 * Nuage : deux lobes de côté et un dôme sur une base plate, dessinés dans une boîte de 20 × 14
 * puis étirés à celle du nœud (les arcs de cercle deviennent des arcs d'ellipse). Le sommet du
 * dôme et le milieu de la base tombent au milieu des côtés haut et bas.
 */
function cloudPath(x: number, y: number, w: number, h: number): string {
  const sx = w / 20
  const sy = h / 14
  const at = (px: number, py: number): string => `${fmt(x + px * sx)} ${fmt(y + py * sy)}`
  const arc = (radius: number, px: number, py: number): string =>
    `A ${fmt(radius * sx)} ${fmt(radius * sy)} 0 0 1 ${at(px, py)}`
  // Lobe gauche (rayon 5), dôme (rayon 6), lobe droit : les points de rencontre sont calculés.
  return `M ${at(5, 14)} ${arc(5, 4.3273, 4.0455)} ${arc(6, 15.6727, 4.0455)} ${arc(5, 15, 14)} Z`
}

function rectPath(x: number, y: number, w: number, h: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  if (r === 0) return `M ${fmt(x)} ${fmt(y)} h ${fmt(w)} v ${fmt(h)} h ${fmt(-w)} Z`
  const arc = (dx: number, dy: number): string =>
    `a ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(dx)} ${fmt(dy)}`
  return (
    `M ${fmt(x + r)} ${fmt(y)} h ${fmt(w - 2 * r)} ${arc(r, r)} v ${fmt(h - 2 * r)} ` +
    `${arc(-r, r)} h ${fmt(2 * r - w)} ${arc(-r, -r)} v ${fmt(2 * r - h)} ${arc(r, -r)} Z`
  )
}

function circlePath(cx: number, cy: number, r: number): string {
  return (
    `M ${fmt(cx - r)} ${fmt(cy)} a ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0 ` +
    `a ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0 Z`
  )
}

function polygonPath(points: readonly LocalPoint[], radius = 0): string {
  return roundedPathData(points, radius, true)
}

/**
 * Losange aux quatre pointes arrondies, qui passe quand même par ses accroches : les milieux des
 * côtés de sa boîte. Le contour est celui d'un losange plus petit, grossi du rayon tout autour :
 * chaque pointe est un arc de ce rayon dont le sommet reste sur l'accroche, quel que soit
 * l'angle. Arrondir par un arc tangent aux côtés d'un losange tracé de pointe à pointe ferait au
 * contraire reculer la pointe, d'autant plus que l'angle est aigu, et le lien qui s'y attache
 * semblerait s'arrêter dans le vide. Le rayon ne dépasse pas le quart d'une dimension.
 */
function diamondPath(
  cx: number,
  cy: number,
  halfWidth: number,
  halfHeight: number,
  radius: number
): string {
  const r = Math.max(0, Math.min(radius, halfWidth / 2, halfHeight / 2))
  // Demi-diagonales du losange intérieur, dont les sommets sont les centres des arcs.
  const p = halfWidth - r
  const q = halfHeight - r
  const side = Math.hypot(p, q)
  if (r === 0 || side === 0) {
    return polygonPath([
      { x: cx, y: cy - halfHeight },
      { x: cx + halfWidth, y: cy },
      { x: cx, y: cy + halfHeight },
      { x: cx - halfWidth, y: cy }
    ])
  }
  // Décalage d'un côté vers l'extérieur : sa normale, longue du rayon.
  const nx = (q / side) * r
  const ny = (p / side) * r
  const at = (px: number, py: number): string => `${fmt(px)} ${fmt(py)}`
  const arc = (px: number, py: number): string => `A ${fmt(r)} ${fmt(r)} 0 0 1 ${at(px, py)}`
  // Du haut, dans le sens horaire : un côté, puis l'arc de la pointe où il arrive.
  return (
    `M ${at(cx + nx, cy - q - ny)} ` +
    `L ${at(cx + p + nx, cy - ny)} ${arc(cx + p + nx, cy + ny)} ` +
    `L ${at(cx + nx, cy + q + ny)} ${arc(cx - nx, cy + q + ny)} ` +
    `L ${at(cx - p - nx, cy + ny)} ${arc(cx - p - nx, cy - ny)} ` +
    `L ${at(cx - nx, cy - q - ny)} ${arc(cx + nx, cy - q - ny)} Z`
  )
}

/** Un tracé d'un nœud et la façon de le peindre. */
export interface NodePart {
  d: string
  /** `body` : le fond du nœud selon son mode ; `color` : plein de sa couleur ; `none` : vide. */
  fill: 'body' | 'color' | 'none'
  /** Contour tracé de la couleur du nœud. */
  stroke: boolean
}

/** Tracés d'un nœud, en cellules, du fond vers le dessus. */
export function nodeParts(node: DiagramNode, style: DiagramStyle): NodePart[] {
  const { x, y, w, h } = node
  const cx = x + w / 2
  const cy = y + h / 2
  const r = Math.min(w, h) / 2
  switch (node.shape) {
    case 'rounded':
      return [{ d: rectPath(x, y, w, h, style.nodeRadius), fill: 'body', stroke: true }]
    case 'rect':
      return [{ d: rectPath(x, y, w, h, 0), fill: 'body', stroke: true }]
    case 'diamond':
      return [
        {
          d: diamondPath(cx, cy, w / 2, h / 2, style.nodeRadius * DIAMOND_ROUNDING),
          fill: 'body',
          stroke: true
        }
      ]
    case 'start':
      return [{ d: circlePath(cx, cy, r), fill: 'color', stroke: false }]
    case 'end':
      return [
        { d: circlePath(cx, cy, r), fill: 'body', stroke: true },
        { d: circlePath(cx, cy, r * 0.55), fill: 'color', stroke: false }
      ]
    case 'flow-end': {
      const reach = r * Math.SQRT1_2
      return [
        { d: circlePath(cx, cy, r), fill: 'body', stroke: true },
        {
          d:
            `M ${fmt(cx - reach)} ${fmt(cy - reach)} L ${fmt(cx + reach)} ${fmt(cy + reach)} ` +
            `M ${fmt(cx + reach)} ${fmt(cy - reach)} L ${fmt(cx - reach)} ${fmt(cy + reach)}`,
          fill: 'none',
          stroke: true
        }
      ]
    }
    case 'bar': {
      const half = BAR_THICKNESS / 2
      const d =
        h === 0
          ? rectPath(x, y - half, w, BAR_THICKNESS, 0)
          : rectPath(x - half, y, BAR_THICKNESS, h, 0)
      return [{ d, fill: 'color', stroke: false }]
    }
    case 'send': {
      const depth = signalDepth(node)
      return [
        {
          d: polygonPath([
            { x, y },
            { x: x + w - depth, y },
            { x: x + w, y: cy },
            { x: x + w - depth, y: y + h },
            { x, y: y + h }
          ]),
          fill: 'body',
          stroke: true
        }
      ]
    }
    case 'receive': {
      const depth = signalDepth(node)
      return [
        {
          d: polygonPath([
            { x, y },
            { x: x + w, y },
            { x: x + w, y: y + h },
            { x, y: y + h },
            { x: x + depth, y: cy }
          ]),
          fill: 'body',
          stroke: true
        }
      ]
    }
    case 'note': {
      const fold = noteFold(node)
      return [
        {
          d: polygonPath([
            { x, y },
            { x: x + w - fold, y },
            { x: x + w, y: y + fold },
            { x: x + w, y: y + h },
            { x, y: y + h }
          ]),
          fill: 'body',
          stroke: true
        },
        {
          d: `M ${fmt(x + w - fold)} ${fmt(y)} v ${fmt(fold)} h ${fmt(fold)}`,
          fill: 'none',
          stroke: true
        }
      ]
    }
    case 'terminal':
      // Bouts en demi-cercle : le rayon vaut la moitié du petit côté.
      return [{ d: rectPath(x, y, w, h, r), fill: 'body', stroke: true }]
    case 'io': {
      const slant = ioSlant(node)
      return [
        {
          d: polygonPath([
            { x: x + slant, y },
            { x: x + w, y },
            { x: x + w - slant, y: y + h },
            { x, y: y + h }
          ]),
          fill: 'body',
          stroke: true
        }
      ]
    }
    case 'subroutine': {
      const inset = subroutineInset(node)
      return [
        { d: rectPath(x, y, w, h, 0), fill: 'body', stroke: true },
        {
          d:
            `M ${fmt(x + inset)} ${fmt(y)} v ${fmt(h)} ` +
            `M ${fmt(x + w - inset)} ${fmt(y)} v ${fmt(h)}`,
          fill: 'none',
          stroke: true
        }
      ]
    }
    case 'preparation': {
      const depth = hexagonDepth(node)
      return [
        {
          d: polygonPath([
            { x: x + depth, y },
            { x: x + w - depth, y },
            { x: x + w, y: cy },
            { x: x + w - depth, y: y + h },
            { x: x + depth, y: y + h },
            { x, y: cy }
          ]),
          fill: 'body',
          stroke: true
        }
      ]
    }
    case 'connector':
      return [{ d: circlePath(cx, cy, r), fill: 'body', stroke: true }]
    case 'database': {
      const cap = cylinderCap(node)
      const rim = (sweep: 0 | 1, dx: number): string =>
        `a ${fmt(w / 2)} ${fmt(cap)} 0 0 ${sweep} ${fmt(dx)} 0`
      return [
        // Le corps : le dessus par l'arrière, un côté, le fond par l'avant, l'autre côté.
        {
          d: `M ${fmt(x)} ${fmt(y + cap)} ${rim(1, w)} v ${fmt(h - 2 * cap)} ${rim(1, -w)} Z`,
          fill: 'body',
          stroke: true
        },
        // Le bord avant du dessus.
        { d: `M ${fmt(x)} ${fmt(y + cap)} ${rim(0, w)}`, fill: 'none', stroke: true }
      ]
    }
    case 'cloud':
      return [{ d: cloudPath(x, y, w, h), fill: 'body', stroke: true }]
  }
}

/**
 * Boîte où le texte d'un nœud se centre : la sienne, moins la pointe ou l'encoche d'un signal, le
 * dessus d'un cylindre, le dôme d'un nuage.
 */
export function nodeTextBox(node: DiagramNode): Box {
  const { x, y, w, h } = node
  if (node.shape === 'database') {
    const cap = cylinderCap(node)
    return { x, y: y + 2 * cap, w, h: h - 2 * cap }
  }
  if (node.shape === 'cloud') {
    return {
      x: x + w * CLOUD_TEXT.left,
      y: y + h * CLOUD_TEXT.top,
      w: w * CLOUD_TEXT.width,
      h: h * CLOUD_TEXT.height
    }
  }
  if (node.shape === 'send') return { x, y, w: w - signalDepth(node), h }
  if (node.shape === 'receive') {
    const depth = signalDepth(node)
    return { x: x + depth, y, w: w - depth, h }
  }
  return { x, y, w, h }
}

/** Police effective d'un nœud : la sienne s'il en a choisi une, sinon celle du diagramme. */
export function nodeFont(node: Pick<DiagramNode, 'font'>, style: DiagramStyle): DiagramFont {
  return node.font ?? style.font
}

export interface NodeTextLine {
  text: string
  /** Ligne de base, en cellules. */
  y: number
  /** Hauteur de police, en cellules (multiplicateur du nœud compris). */
  size: number
  role: 'title' | 'subtitle'
  font: DiagramFont
  bold: boolean
  italic: boolean
  /** Valeur de `text-decoration` (souligné, barré), ou indéfini. */
  decoration: string | undefined
}

export interface NodeTextLayout {
  /** Abscisse du centre des lignes. */
  x: number
  font: DiagramFont
  lines: NodeTextLine[]
}

/**
 * Titre puis sous-titre d'un nœud, en un bloc centré dans sa boîte de texte (capitales centrées
 * sur chaque ligne) ; null pour une forme sans texte ou un nœud sans rien d'écrit. Le style du
 * nœud (gras, italique, souligné, barré) est celui de son titre ; le sous-titre reste une ligne
 * secondaire, maigre, en italique quand la police est à chasse fixe. La police et le
 * multiplicateur de taille du nœud valent pour les deux.
 */
export function layoutNodeText(node: DiagramNode, style: DiagramStyle): NodeTextLayout | null {
  if (!NODE_SPECS[node.shape].text) return null
  const font = nodeFont(node, style)
  const titleSize = (style.titleSize * node.textScale) / style.cellPx
  const subtitleSize = (style.subtitleSize * node.textScale) / style.cellPx
  const decorations: string[] = []
  if (node.underline) decorations.push('underline')
  if (node.strike) decorations.push('line-through')
  const newline = String.fromCharCode(10)
  const entries: Omit<NodeTextLine, 'y'>[] = [
    ...(node.title.length > 0
      ? node.title.split(newline).map((text) => ({
          text,
          size: titleSize,
          role: 'title' as const,
          font,
          bold: node.bold,
          italic: node.italic,
          decoration: decorations.length > 0 ? decorations.join(' ') : undefined
        }))
      : []),
    ...(node.subtitle.length > 0
      ? node.subtitle.split(newline).map((text) => ({
          text,
          size: subtitleSize,
          role: 'subtitle' as const,
          font,
          bold: false,
          italic: font === 'mono',
          decoration: undefined
        }))
      : [])
  ]
  if (entries.length === 0) return null
  const box = nodeTextBox(node)
  const total = entries.reduce((sum, entry) => sum + entry.size * TEXT_LINE_HEIGHT, 0)
  let top = box.y + box.h / 2 - total / 2
  const lines = entries.map((entry) => {
    const lineHeight = entry.size * TEXT_LINE_HEIGHT
    const line = { ...entry, y: top + lineHeight / 2 + CAP_CENTER * entry.size }
    top += lineHeight
    return line
  })
  return { x: box.x + box.w / 2, font, lines }
}

/** Graisse d'un texte de nœud en gras : demi-gras, lisible sans alourdir la boîte. */
export const NODE_BOLD_WEIGHT = '600'

/** Attributs SVG du style d'une ligne de texte de nœud. */
export function nodeLineAttrs(line: NodeTextLine): {
  'font-weight': string | undefined
  'font-style': string | undefined
  'text-decoration': string | undefined
} {
  return {
    'font-weight': line.bold ? NODE_BOLD_WEIGHT : undefined,
    'font-style': line.italic ? 'italic' : undefined,
    'text-decoration': line.decoration
  }
}

/** Une couleur est-elle assez sombre pour porter un texte clair ? */
export function isDarkColor(hex: string): boolean {
  const value = Number.parseInt(hex.slice(1), 16)
  const red = (value >> 16) & 0xff
  const green = (value >> 8) & 0xff
  const blue = value & 0xff
  return (red * 299 + green * 587 + blue * 114) / 1000 < 150
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/** Mélange de deux couleurs #rrggbb : `share` de la première, le reste de la seconde. */
export function mixColors(color: string, other: string, share: number): string {
  const a = channels(color)
  const b = channels(other)
  const mixed = a.map((value, index) => Math.round(value * share + (b[index] ?? 0) * (1 - share)))
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

/** Ce sur quoi un diagramme est peint : la couleur du papier et l'encre qui s'y lit. */
export interface DiagramGround {
  paper: string
  ink: string
  dark: boolean
}

export const LIGHT_GROUND: DiagramGround = { paper: '#ffffff', ink: '#000000', dark: false }
export const DARK_GROUND: DiagramGround = { paper: '#16181d', ink: '#e6edf3', dark: true }

/** Fond d'une couleur donnée : l'encre est claire sur un papier sombre, noire sinon. */
export function groundOf(paper: string): DiagramGround {
  const dark = isDarkColor(paper)
  return { paper, ink: dark ? DARK_GROUND.ink : LIGHT_GROUND.ink, dark }
}

/** Une couleur du document telle qu'on la peint : le noir pur devient l'encre du fond. */
export function inkColor(hex: string, ground: DiagramGround): string {
  return hex.toLowerCase() === '#000000' ? ground.ink : hex
}

/** Vers quoi tire le contour d'un fond plein : le blanc sur une couleur sombre, le noir sinon. */
export function solidBorderToward(color: string): string {
  return isDarkColor(color) ? '#ffffff' : '#000000'
}

/** Couleurs d'un nœud, en #rrggbb, pour un fond donné : ce que l'export écrit. */
export interface NodePaint {
  /** Contour, et traits intérieurs de la forme. */
  stroke: string
  /** Fond de la forme ; null pour un simple contour. */
  fill: string | null
  /** Parties toujours pleines : disque de départ, cœur de la fin, barre. */
  solid: string
  text: string
}

/**
 * Couleurs d'un nœud selon son fond. Contour : le trait a sa couleur, pas de fond. Teinté : le fond
 * est sa couleur mêlée au papier. Plein : le fond est sa couleur, et le contour s'en détache.
 *
 * Le texte prend la couleur de la forme, tirée vers l'encre du papier pour ressortir
 * (`NODE_TEXT_SHARE` ; décision du 11 novembre 2026) : plus foncée que la forme sur un papier
 * clair, plus claire sur un papier sombre, où la foncer l'effacerait. Sur un fond plein elle ne se
 * lirait pas sur elle-même : le texte y contraste avec le fond, noir ou blanc. Un nœud peut avoir
 * sa propre couleur de texte (`textColor`), reprise telle quelle ; son noir pur est l'encre du
 * papier, sauf sur un fond plein, où il reste noir.
 */
export function nodePaint(
  node: Pick<DiagramNode, 'color' | 'fill' | 'textColor'>,
  ground: DiagramGround
): NodePaint {
  const color = inkColor(node.color, ground)
  if (node.fill === 'solid') {
    return {
      stroke: mixColors(color, solidBorderToward(color), SOLID_BORDER_SHARE),
      fill: color,
      solid: color,
      text: node.textColor ?? (isDarkColor(color) ? '#ffffff' : '#000000')
    }
  }
  return {
    stroke: color,
    fill:
      node.fill === 'tint'
        ? mixColors(color, ground.paper, ground.dark ? TINT_SHARE.dark : TINT_SHARE.light)
        : null,
    solid: color,
    text:
      node.textColor === null
        ? mixColors(color, ground.ink, NODE_TEXT_SHARE)
        : inkColor(node.textColor, ground)
  }
}

/** Rectangle occupé par un nœud, épaisseur d'une barre comprise. */
export function nodeBounds(node: DiagramNode): GridRect {
  if (NODE_SPECS[node.shape].line) {
    const half = BAR_THICKNESS / 2
    return node.h === 0
      ? { x: node.x, y: node.y - half, width: node.w, height: BAR_THICKNESS }
      : { x: node.x - half, y: node.y, width: BAR_THICKNESS, height: node.h }
  }
  return { x: node.x, y: node.y, width: node.w, height: node.h }
}

/** Poignées d'un nœud : les huit de sa boîte, ou les deux bouts d'une barre. */
export function nodeHandles(node: DiagramNode): Handle[] {
  if (!NODE_SPECS[node.shape].line) return boxHandles(node)
  return node.h === 0
    ? [
        { id: 'w', x: node.x, y: node.y },
        { id: 'e', x: node.x + node.w, y: node.y }
      ]
    : [
        { id: 'n', x: node.x, y: node.y },
        { id: 's', x: node.x, y: node.y + node.h }
      ]
}

/**
 * Boîte d'un nœud après glisser d'une poignée vers `target`, ramenée à ce que sa forme permet ;
 * le bord opposé à la poignée reste en place.
 */
export function resizeNodeBox(node: DiagramNode, handleId: string, target: GridPoint): Box {
  const raw = resizeBox(node, handleId, target)
  const size = fittedNodeSize(node.shape, raw.w, raw.h, node)
  return {
    x: handleId.includes('w') ? node.x + node.w - size.w : node.x,
    y: handleId.includes('n') ? node.y + node.h - size.h : node.y,
    w: size.w,
    h: size.h
  }
}

/** Marge gardée entre le texte d'un nœud et son contour, en cellules. */
export const NODE_TEXT_PAD_X = 1.5
export const NODE_TEXT_PAD_Y = 1

/** Largeur d'une ligne de texte de nœud, en cellules. */
export type NodeTextMeasurer = (line: NodeTextLine) => number

/** Largeur moyenne d'un caractère, en multiple de la hauteur de police. */
const NODE_CHAR_WIDTH: Record<DiagramFont, number> = { sans: 0.55, mono: 0.6 }

/**
 * Mesure estimée, sans écran : un caractère moyen par lettre, un peu plus large en gras (pas en
 * chasse fixe, où chaque caractère a la même largeur). Les tests s'en servent.
 */
export const estimatedNodeTextWidth: NodeTextMeasurer = (line) =>
  line.text.length *
  NODE_CHAR_WIDTH[line.font] *
  line.size *
  (line.bold && line.font === 'sans' ? 1.06 : 1)

/**
 * Taille qu'il faut à un nœud pour contenir son texte, marges comprises, ramenée à ce que sa forme
 * permet ; null pour un nœud sans texte. Un losange n'offre à son texte que la moitié de chaque
 * dimension ; un signal perd la profondeur de sa pointe ou de son encoche, un hexagone celle de
 * ses deux pointes, un début / fin ses bouts arrondis, un parallélogramme et un sous-programme
 * leurs bords, un cylindre son dessus, un nuage son dôme et ses lobes.
 */
export function nodeSizeForText(
  node: DiagramNode,
  style: DiagramStyle,
  measure: NodeTextMeasurer
): { w: number; h: number } | null {
  const layout = layoutNodeText(node, style)
  if (!layout) return null
  const width = layout.lines.reduce((max, line) => Math.max(max, measure(line)), 0)
  const height = layout.lines.reduce((sum, line) => sum + line.size * TEXT_LINE_HEIGHT, 0)
  let w = width + 2 * NODE_TEXT_PAD_X
  let h = height + 2 * NODE_TEXT_PAD_Y
  if (node.shape === 'diamond') {
    w *= 2
    h *= 2
  } else if (node.shape === 'send' || node.shape === 'receive') {
    w += Math.max(1, Math.floor(Math.ceil(h) / 2))
  } else if (node.shape === 'preparation') {
    w += 2 * Math.max(1, Math.floor(Math.ceil(h) / 2))
  } else if (node.shape === 'terminal') {
    w += Math.ceil(h) / 2
  } else if (node.shape === 'io' || node.shape === 'subroutine') {
    w += 2
  } else if (node.shape === 'database') {
    h += 3
  } else if (node.shape === 'cloud') {
    w /= CLOUD_TEXT.width
    h /= CLOUD_TEXT.height
  }
  return fittedNodeSize(node.shape, Math.ceil(w), Math.ceil(h))
}

/**
 * Boîte d'un nœud ajustée à son texte, centre gardé (les écarts de taille sont pairs, pour que le
 * centre reste sur la grille). `onlyGrow` : la boîte ne fait que grandir, là où le texte déborde.
 * Null s'il n'y a rien à changer.
 */
export function nodeBoxForText(
  node: DiagramNode,
  style: DiagramStyle,
  measure: NodeTextMeasurer,
  onlyGrow: boolean
): Box | null {
  const needed = nodeSizeForText(node, style, measure)
  if (!needed) return null
  const even = (target: number, current: number): number => {
    const wanted = onlyGrow ? Math.max(target, current) : target
    return (wanted - current) % 2 === 0 ? wanted : wanted + 1
  }
  const w = even(needed.w, node.w)
  const h = even(needed.h, node.h)
  if (w === node.w && h === node.h) return null
  return { x: node.x - (w - node.w) / 2, y: node.y - (h - node.h) / 2, w, h }
}
