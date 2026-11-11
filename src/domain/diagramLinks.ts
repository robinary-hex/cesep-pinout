import { layoutTextBox, TEXT_LINE_HEIGHT, type TextAnchor, type TextBoxLayout } from './component'
import type { PinRef } from './connectivity'
import {
  NODE_SPECS,
  type Diagram,
  type DiagramFont,
  type DiagramLink,
  type DiagramNode,
  type DiagramStyle
} from './diagram'
import {
  BAR_THICKNESS,
  cylinderCap,
  hexagonDepth,
  ioSlant,
  nodeBounds,
  noteFold,
  signalDepth
} from './diagramShapes'
import { wiresFollowingPins } from './elastic'
import type { GridPoint, LocalPoint } from './grid'
import type { Box } from './handles'
import { textLabelBounds, unionRects, type GridRect } from './placement'
import {
  dedupeConsecutive,
  horizontalFirstFor,
  isUTurn,
  moveSegment,
  pointsEqual,
  routeL,
  routeLAuto,
  segmentStep,
  simplifyPoints,
  wireBounds
} from './wires'

// Liens d'un diagramme : où ils s'accrochent aux nœuds, comment ils les suivent, leurs pointes de
// flèche et leur étiquette. Un lien a la géométrie d'un fil du montage (`wires.ts`) ; l'accroche
// se déduit de la géométrie : une extrémité posée sur un point d'accroche d'un nœud le suit.

const pointKey = (point: GridPoint): string => `${point[0]},${point[1]}`

/**
 * Points d'accroche d'un nœud : les intersections de la grille qui sont sur son contour. Un
 * rectangle les offre sur tout son tour ; un losange, un disque ou un nuage, au milieu de ses
 * quatre côtés ; une barre, tout du long ; les autres formes, là où leur contour suit leur boîte
 * (côtés droits d'un début / fin, d'un hexagone, d'un parallélogramme, d'un cylindre), et à leurs
 * pointes.
 */
export function nodeAnchors(node: DiagramNode): GridPoint[] {
  const { x, y, w, h } = node
  const points: GridPoint[] = []
  if (NODE_SPECS[node.shape].line) {
    if (h === 0) for (let i = 0; i <= w; i++) points.push([x + i, y])
    else for (let j = 0; j <= h; j++) points.push([x, y + j])
    return points
  }
  const midX = w % 2 === 0 ? x + w / 2 : null
  const midY = h % 2 === 0 ? y + h / 2 : null
  if (
    node.shape === 'diamond' ||
    node.shape === 'start' ||
    node.shape === 'end' ||
    node.shape === 'flow-end' ||
    node.shape === 'connector' ||
    node.shape === 'cloud'
  ) {
    if (midX !== null) points.push([midX, y], [midX, y + h])
    if (midY !== null) points.push([x, midY], [x + w, midY])
    return points
  }
  if (node.shape === 'terminal') {
    // Bouts arrondis : les deux côtés droits, et la pointe de chaque arrondi.
    const radius = Math.ceil(Math.min(w, h) / 2)
    if (w >= h) {
      for (let i = radius; i <= w - radius; i++) points.push([x + i, y], [x + i, y + h])
      if (midY !== null) points.push([x, midY], [x + w, midY])
    } else {
      for (let j = radius; j <= h - radius; j++) points.push([x, y + j], [x + w, y + j])
      if (midX !== null) points.push([midX, y], [midX, y + h])
    }
    return points
  }
  if (node.shape === 'preparation') {
    // Hexagone : le haut et le bas entre les pointes, et les deux pointes.
    const depth = hexagonDepth(node)
    for (let i = depth; i <= w - depth; i++) points.push([x + i, y], [x + i, y + h])
    if (midY !== null) points.push([x, midY], [x + w, midY])
    return points
  }
  if (node.shape === 'io') {
    // Parallélogramme : le haut est décalé vers la droite, le bas vers la gauche ; les côtés
    // penchés n'offrent que leur milieu, quand il tombe sur la grille.
    const slant = ioSlant(node)
    for (let i = slant; i <= w; i++) points.push([x + i, y])
    for (let i = 0; i <= w - slant; i++) points.push([x + i, y + h])
    if (midY !== null && slant % 2 === 0) {
      points.push([x + slant / 2, midY], [x + w - slant / 2, midY])
    }
    return points
  }
  if (node.shape === 'database') {
    // Cylindre : le sommet du dessus, le bas du fond, et les deux côtés droits.
    const cap = cylinderCap(node)
    if (midX !== null) points.push([midX, y], [midX, y + h])
    for (let j = Math.ceil(cap); j <= Math.floor(h - cap); j++) {
      points.push([x, y + j], [x + w, y + j])
    }
    return points
  }
  // Formes qui suivent leur boîte : le tour, moins ce que la forme entame.
  const depth = node.shape === 'send' || node.shape === 'receive' ? signalDepth(node) : 0
  const fold = node.shape === 'note' ? noteFold(node) : 0
  const lastTop = node.shape === 'send' ? w - depth : node.shape === 'note' ? w - fold : w
  const lastBottom = node.shape === 'send' ? w - depth : w
  for (let i = 0; i <= lastTop; i++) points.push([x + i, y])
  for (let i = 0; i <= lastBottom; i++) points.push([x + i, y + h])
  if (node.shape === 'receive') {
    // Côté gauche : seule la pointe de l'encoche, à l'intérieur de la boîte.
    if (midY !== null) points.push([x + depth, midY])
  } else {
    for (let j = 1; j < h; j++) points.push([x, y + j])
  }
  if (node.shape === 'send') {
    // Côté droit : seule la pointe.
    if (midY !== null) points.push([x + w, midY])
  } else {
    for (let j = Math.max(1, fold); j < h; j++) points.push([x + w, y + j])
  }
  return points
}

/** Point d'accroche et le nœud qui le porte. */
export interface NodeAnchor {
  nodeId: string
  point: GridPoint
}

export function diagramAnchors(nodes: readonly DiagramNode[]): NodeAnchor[] {
  return nodes.flatMap((node) => nodeAnchors(node).map((point) => ({ nodeId: node.id, point })))
}

/**
 * Où va un point d'accroche quand la boîte de son nœud passe de `before` à `after`. Sur chaque
 * axe : un point posé sur un bord suit ce bord ; sans changement de taille, il suit le
 * déplacement ; le milieu d'un côté reste au milieu ; sinon il garde sa place, bornée à la
 * nouvelle boîte.
 */
export function movedAnchor(before: Box, after: Box, point: GridPoint): GridPoint {
  const along = (
    value: number,
    start: number,
    size: number,
    newStart: number,
    newSize: number
  ): number => {
    if (size === newSize) return value + (newStart - start)
    if (value === start) return newStart
    if (value === start + size) return newStart + newSize
    if (2 * (value - start) === size && newSize % 2 === 0) return newStart + newSize / 2
    return Math.min(Math.max(value, newStart), newStart + newSize)
  }
  return [
    along(point[0], before.x, before.w, after.x, after.w),
    along(point[1], before.y, before.h, after.y, after.h)
  ]
}

function nearestPoint(points: readonly GridPoint[], target: GridPoint): GridPoint {
  let best = target
  let bestDistance = Number.POSITIVE_INFINITY
  for (const point of points) {
    const distance = Math.abs(point[0] - target[0]) + Math.abs(point[1] - target[1])
    if (distance < bestDistance) {
      best = point
      bestDistance = distance
    }
  }
  return best
}

function sameNode(a: DiagramNode, b: DiagramNode): boolean {
  return a.shape === b.shape && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

/**
 * Liens après un changement de nœuds (déplacement, redimensionnement, changement de forme) : les
 * extrémités posées sur un point d'accroche suivent leur nœud, l'extrémité emmenant son segment.
 * `translated` donne, par identifiant, le vecteur des liens déplacés en bloc : leurs extrémités
 * posées sur un nœud resté immobile y restent. Un lien inchangé est retourné tel quel.
 */
export function linksFollowingNodes(
  links: readonly DiagramLink[],
  nodesBefore: readonly DiagramNode[],
  nodesAfter: readonly DiagramNode[],
  translated: ReadonlyMap<string, GridPoint> = new Map()
): DiagramLink[] {
  const ends = new Set<string>()
  for (const link of links) {
    const first = link.points[0]
    const last = link.points.at(-1)
    if (first) ends.add(pointKey(first))
    if (last) ends.add(pointKey(last))
  }
  const afterById = new Map(nodesAfter.map((node) => [node.id, node]))
  const pinsBefore: PinRef[] = []
  const pinsAfter: PinRef[] = []
  for (const node of nodesBefore) {
    const next = afterById.get(node.id)
    if (!next) continue
    const unchanged = sameNode(node, next)
    const nextAnchors = unchanged ? [] : nodeAnchors(next)
    const nextKeys = new Set(nextAnchors.map(pointKey))
    for (const anchor of nodeAnchors(node)) {
      const pinId = pointKey(anchor)
      if (!ends.has(pinId)) continue
      let target = anchor
      if (!unchanged) {
        const moved = movedAnchor(node, next, anchor)
        // La nouvelle forme n'a pas forcément d'accroche là : la plus proche prend le relais.
        target = nextKeys.has(pointKey(moved)) ? moved : nearestPoint(nextAnchors, moved)
      }
      const key = `${node.id}@${pinId}`
      pinsBefore.push({ key, instanceId: node.id, pinId, point: anchor })
      pinsAfter.push({ key, instanceId: node.id, pinId, point: target })
    }
  }
  if (pinsBefore.length === 0 && translated.size === 0) return [...links]
  return wiresFollowingPins(links, pinsBefore, pinsAfter, translated)
}

// Départ et arrivée d'un lien qu'on trace

/**
 * Directions par lesquelles un lien quitte un point d'accroche : vers l'extérieur du nœud, à
 * angle droit du côté qui porte l'accroche. Un coin de boîte en offre deux ; une barre, ses deux
 * faces.
 */
export function anchorNormals(node: DiagramNode, point: GridPoint): GridPoint[] {
  const { x, y, w, h } = node
  if (NODE_SPECS[node.shape].line) {
    return h === 0
      ? [
          [0, -1],
          [0, 1]
        ]
      : [
          [-1, 0],
          [1, 0]
        ]
  }
  const normals: GridPoint[] = []
  if (point[1] <= y) normals.push([0, -1])
  if (point[1] >= y + h) normals.push([0, 1])
  if (point[0] <= x) normals.push([-1, 0])
  if (point[0] >= x + w) normals.push([1, 0])
  // Accroche en retrait de la boîte (encoche d'une réception, côté penché d'un parallélogramme) :
  // elle regarde le bord le plus proche.
  if (normals.length === 0) normals.push(point[0] - x <= x + w - point[0] ? [-1, 0] : [1, 0])
  return normals
}

/** Bout d'un lien qu'on trace : son point, et par où il peut le quitter (rien pour un point libre). */
export interface LinkEnd {
  point: GridPoint
  normals: readonly GridPoint[]
}

/** Nœud qui a une accroche en ce point : le dernier dessiné s'il y en a plusieurs, sinon null. */
export function anchoredNode(nodes: readonly DiagramNode[], point: GridPoint): DiagramNode | null {
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index]
    if (node && nodeAnchors(node).some((anchor) => pointsEqual(anchor, point))) return node
  }
  return null
}

/** Bout d'un lien posé en `point` : attaché au nœud qui a là une accroche, sinon libre. */
export function linkEndAt(nodes: readonly DiagramNode[], point: GridPoint): LinkEnd {
  const node = anchoredNode(nodes, point)
  return { point, normals: node ? anchorNormals(node, point) : [] }
}

/** Un lien dont un bout est posé sur une note : il se trace en pointillés. */
export function touchesNote(nodes: readonly DiagramNode[], points: readonly GridPoint[]): boolean {
  const first = points[0]
  const last = points[points.length - 1]
  return [first, last].some(
    (end) => end !== undefined && anchoredNode(nodes, end)?.shape === 'note'
  )
}

/** Longueur du bout de lien qui sort tout droit d'une accroche avant de tourner, en cellules. */
export const LINK_STUB = 2

/** Façons de relier deux points : les deux L (l'axe dominant d'abord), puis les deux Z par le milieu. */
function connections(a: GridPoint, b: GridPoint): GridPoint[][] {
  const horizontalFirst = horizontalFirstFor(a, b)
  const midX = Math.round((a[0] + b[0]) / 2)
  const midY = Math.round((a[1] + b[1]) / 2)
  const acrossX: GridPoint[] = [a, [midX, a[1]], [midX, b[1]], b]
  const acrossY: GridPoint[] = [a, [a[0], midY], [b[0], midY], b]
  return [
    routeL(a, b, horizontalFirst),
    routeL(a, b, !horizontalFirst),
    ...(horizontalFirst ? [acrossX, acrossY] : [acrossY, acrossX])
  ]
}

function direction(from: GridPoint, to: GridPoint): GridPoint {
  return [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1])]
}

/**
 * Trajet d'un lien qu'on trace, de `from` à `to`. Un bout attaché à une forme la quitte à angle
 * droit, et y arrive de face : jamais le long de son bord, où le trait se confondrait avec le
 * contour (décision du 11 novembre 2026). Le plus souvent c'est un L ; quand un L ne peut pas
 * respecter les deux bouts, le trajet prend un ou deux coudes de plus : un Z par le milieu, un U,
 * ou une sortie droite de `LINK_STUB` cellules avant de tourner. Parmi les trajets possibles, le
 * plus simple (moins de sommets, puis le plus court) ; `invert` (Maj) donne le suivant. Entre deux
 * points libres, c'est le L de `routeLAuto`. Ce n'est qu'un tracé de départ : les coudes se
 * reprennent ensuite à la main.
 */
export function routeLink(from: LinkEnd, to: LinkEnd, invert = false): GridPoint[] {
  if (pointsEqual(from.point, to.point)) return [from.point]
  const out = (point: GridPoint, normal: GridPoint): GridPoint => [
    point[0] + normal[0] * LINK_STUB,
    point[1] + normal[1] * LINK_STUB
  ]
  const heads: GridPoint[][] = [
    [from.point],
    ...from.normals.map((normal) => [from.point, out(from.point, normal)])
  ]
  const tails: GridPoint[][] = [
    [to.point],
    ...to.normals.map((normal) => [out(to.point, normal), to.point])
  ]
  const leaves = (a: GridPoint, b: GridPoint, normals: readonly GridPoint[]): boolean => {
    const [dx, dy] = direction(a, b)
    return normals.length === 0 || normals.some((normal) => normal[0] === dx && normal[1] === dy)
  }
  const found: { points: GridPoint[]; length: number }[] = []
  const seen = new Set<string>()
  for (const head of heads) {
    for (const tail of tails) {
      const a = head[head.length - 1]
      const b = tail[0]
      if (!a || !b) continue
      for (const middle of connections(a, b)) {
        const raw = dedupeConsecutive([...head, ...middle, ...tail])
        const first = raw[0]
        const second = raw[1]
        const last = raw[raw.length - 1]
        const beforeLast = raw[raw.length - 2]
        if (!first || !second || !last || !beforeLast) continue
        // Pas de demi-tour, et chaque bout attaché part ou arrive de face.
        const turnsBack = raw.some((point, index) => {
          const previous = raw[index - 1]
          const next = raw[index + 1]
          return previous !== undefined && next !== undefined && isUTurn(previous, point, next)
        })
        if (turnsBack) continue
        if (!leaves(first, second, from.normals) || !leaves(last, beforeLast, to.normals)) continue
        const points = simplifyPoints(raw)
        const key = points.map((point) => point.join(',')).join(' ')
        if (seen.has(key)) continue
        seen.add(key)
        const length = points.reduce((sum, point, index) => {
          const previous = points[index - 1]
          return previous
            ? sum + Math.abs(point[0] - previous[0]) + Math.abs(point[1] - previous[1])
            : sum
        }, 0)
        found.push({ points, length })
      }
    }
  }
  // Tri stable : à égalité, l'ordre d'essai (sans sortie droite d'abord, axe dominant d'abord).
  found.sort((a, b) => a.points.length - b.points.length || a.length - b.length)
  const chosen = (invert ? found[1] : undefined) ?? found[0]
  return chosen ? chosen.points : routeLAuto(from.point, to.point, invert)
}

/**
 * Abscisses (ou ordonnées) où le bout attaché d'un segment peut glisser : celles des accroches du
 * même côté de sa forme. Null si le bout n'est pas attaché, ou s'il ne quitte pas sa forme de face.
 */
function slideSlots(
  nodes: readonly DiagramNode[],
  end: GridPoint,
  neighbour: GridPoint
): number[] | null {
  const node = anchoredNode(nodes, end)
  if (!node) return null
  const [dx, dy] = direction(end, neighbour)
  const lateral = dx === 0 ? 0 : 1
  const along = 1 - lateral
  const leaves = (point: GridPoint): boolean =>
    anchorNormals(node, point).some((normal) => normal[0] === dx && normal[1] === dy)
  if (!leaves(end)) return null
  return nodeAnchors(node)
    .filter((anchor) => anchor[along] === end[along] && leaves(anchor))
    .map((anchor) => anchor[lateral] ?? 0)
}

/**
 * Déplace un segment de lien parallèlement à lui-même, comme `moveSegment`, à une différence
 * près : le segment qui sort d'une forme (ou y arrive) de face emmène son point d'attache, qui
 * glisse le long du côté d'une accroche à l'autre, au lieu de rester sur place avec un coude qui
 * longerait la forme (décision du 11 novembre 2026). Au bout du côté, il s'arrête. Un bout libre,
 * ou attaché là où la forme n'a pas d'autre accroche, garde le comportement de `moveSegment`.
 */
export function moveLinkSegment(
  points: readonly GridPoint[],
  index: number,
  coordinate: number,
  nodes: readonly DiagramNode[]
): GridPoint[] {
  const a = points[index]
  const b = points[index + 1]
  const step = a && b ? segmentStep(a, b) : null
  if (!a || !b || !step) return [...points]
  const lateral = step[0] === 0 ? 0 : 1
  const current = a[lateral] ?? 0
  const startSlots = index === 0 ? slideSlots(nodes, a, b) : null
  const endSlots = index === points.length - 2 ? slideSlots(nodes, b, a) : null
  const slots = startSlots ?? endSlots
  const target = slots
    ? slots.reduce(
        (best, value) =>
          Math.abs(value - coordinate) < Math.abs(best - coordinate) ? value : best,
        current
      )
    : coordinate
  let moved = moveSegment(points, index, target)
  if (target === current) return moved
  const shifted = (point: GridPoint): GridPoint =>
    lateral === 0 ? [target, point[1]] : [point[0], target]
  // `moveSegment` laisse chaque bout du lien en place, relié au segment par un coude : le bout qui
  // peut glisser perd ce coude et se pose sur l'accroche d'en face.
  const head = moved[0]
  const afterHead = moved[1]
  if (
    startSlots?.includes(target) &&
    head &&
    afterHead &&
    pointsEqual(head, a) &&
    pointsEqual(afterHead, shifted(a))
  ) {
    moved = moved.slice(1)
  }
  const tail = moved[moved.length - 1]
  const beforeTail = moved[moved.length - 2]
  if (
    endSlots?.includes(target) &&
    tail &&
    beforeTail &&
    pointsEqual(tail, b) &&
    pointsEqual(beforeTail, shifted(b))
  ) {
    moved = moved.slice(0, -1)
  }
  return moved
}

// Dessin

/** Côté d'une pointe de flèche, un triangle équilatéral, en cellules. */
export function linkArrowSize(lineWidth: number): number {
  return Math.max(0.7, lineWidth * 4.5)
}

/** Hauteur d'un triangle équilatéral, pour un côté de 1. */
const EQUILATERAL_HEIGHT = Math.sqrt(3) / 2

/** Hauteur d'une pointe de flèche, de sa base à son sommet, en cellules. */
export function linkArrowLength(lineWidth: number): number {
  return linkArrowSize(lineWidth) * EQUILATERAL_HEIGHT
}

/**
 * Pointe de flèche pleine : un petit triangle équilatéral (décision du 11 novembre 2026), un
 * sommet en `tip`, le côté opposé en travers du lien. Polygone coin, pointe, coin, dans la
 * direction `from` → `tip` ; null si les deux points sont confondus.
 */
export function linkArrowHead(
  from: LocalPoint,
  tip: LocalPoint,
  lineWidth: number
): LocalPoint[] | null {
  const dx = tip.x - from.x
  const dy = tip.y - from.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return null
  const ux = dx / length
  const uy = dy / length
  const half = linkArrowSize(lineWidth) / 2
  const height = linkArrowLength(lineWidth)
  const baseX = tip.x - ux * height
  const baseY = tip.y - uy * height
  return [
    { x: baseX - uy * half, y: baseY + ux * half },
    { x: tip.x, y: tip.y },
    { x: baseX + uy * half, y: baseY - ux * half }
  ]
}

/** Attribut `stroke-dasharray` d'un lien pointillé, en cellules ; indéfini pour un trait plein. */
export function linkDashArray(link: DiagramLink, lineWidth: number): string | undefined {
  const round = (value: number): number => Math.round(value * 1000) / 1000
  return link.dash === 'dashed' ? `${round(lineWidth * 4)} ${round(lineWidth * 3)}` : undefined
}

/**
 * Espace laissé, au dessin seulement, entre une pointe de flèche et le point où le lien finit :
 * la pointe ne touche pas la forme sur laquelle elle arrive. En cellules.
 */
export function linkArrowGap(lineWidth: number): number {
  return Math.max(0.4, lineWidth * 2.5)
}

/**
 * Sommets d'un lien tels qu'on le voit, bouts des pointes compris. Ce sont ses sommets, à deux
 * retraits près, purement visuels : une extrémité qui arrive de face sur une barre s'arrête à son
 * bord (demi-épaisseur de la barre), et une extrémité qui porte une pointe de flèche s'arrête un
 * peu avant, pour laisser un espace devant la pointe. Un retrait ne dépasse jamais la moitié de
 * son segment.
 */
export function linkRenderPoints(
  link: DiagramLink,
  nodes: readonly DiagramNode[],
  lineWidth: number
): GridPoint[] {
  const points = link.points.map((point): GridPoint => [point[0], point[1]])
  const bars = nodes.filter((node) => NODE_SPECS[node.shape].line)
  const gap = linkArrowGap(lineWidth)
  const pullBack = (endIndex: number, neighborIndex: number, arrow: boolean): void => {
    const end = points[endIndex]
    const neighbor = points[neighborIndex]
    if (!end || !neighbor) return
    const vertical = end[0] === neighbor[0]
    const onBar = bars.some((bar) => {
      const flat = bar.h === 0
      // De face : un segment vertical sur une barre couchée, horizontal sur une barre debout.
      if (flat !== vertical) return false
      return flat
        ? end[1] === bar.y && end[0] >= bar.x && end[0] <= bar.x + bar.w
        : end[0] === bar.x && end[1] >= bar.y && end[1] <= bar.y + bar.h
    })
    const wanted = (onBar ? BAR_THICKNESS / 2 : 0) + (arrow ? gap : 0)
    if (wanted === 0) return
    const length = Math.abs(vertical ? neighbor[1] - end[1] : neighbor[0] - end[0])
    const back = Math.min(wanted, length / 2)
    const sign = Math.sign(vertical ? neighbor[1] - end[1] : neighbor[0] - end[0])
    points[endIndex] = vertical ? [end[0], end[1] + sign * back] : [end[0] + sign * back, end[1]]
  }
  pullBack(0, 1, link.startArrow)
  pullBack(points.length - 1, points.length - 2, link.endArrow)
  return points
}

/** Ce qu'on dessine d'un lien. */
export interface LinkShape {
  /** Sommets visibles, bouts des pointes compris : pour la sélection et la zone cliquable. */
  points: GridPoint[]
  /** Sommets du trait : sous une pointe il s'arrête dedans, pour ne pas en dépasser. */
  stroke: GridPoint[]
  /** Pointes de flèche, un polygone chacune. */
  heads: LocalPoint[][]
}

/** Arc qui arrondit un coude d'un tracé. */
interface CornerArc {
  start: GridPoint
  end: GridPoint
  center: GridPoint
  radius: number
  /** Angle dont le tracé tourne, en radians : positif dans le sens horaire à l'écran. */
  sweep: number
  /** Longueur prise sur chacun des deux segments. */
  reach: number
}

/** L'arc d'un coude, tel que `wirePathData` le trace ; null pour un sommet qui reste vif. */
function cornerArc(
  previous: GridPoint,
  vertex: GridPoint,
  next: GridPoint,
  cornerRadius: number
): CornerArc | null {
  const inLength = Math.hypot(vertex[0] - previous[0], vertex[1] - previous[1])
  const outLength = Math.hypot(next[0] - vertex[0], next[1] - vertex[1])
  if (cornerRadius <= 0 || inLength === 0 || outLength === 0) return null
  const inX = (vertex[0] - previous[0]) / inLength
  const inY = (vertex[1] - previous[1]) / inLength
  const outX = (next[0] - vertex[0]) / outLength
  const outY = (next[1] - vertex[1]) / outLength
  const cross = inX * outY - inY * outX
  if (Math.abs(cross) < 1e-9) return null
  const tanHalf = Math.abs(cross) / (1 + inX * outX + inY * outY)
  const reach = Math.min(cornerRadius * tanHalf, inLength / 2, outLength / 2)
  const radius = reach / tanHalf
  const side = cross > 0 ? 1 : -1
  const start: GridPoint = [vertex[0] - inX * reach, vertex[1] - inY * reach]
  return {
    start,
    end: [vertex[0] + outX * reach, vertex[1] + outY * reach],
    center: [start[0] - inY * side * radius, start[1] + inX * side * radius],
    radius,
    sweep: side * 2 * Math.atan(tanHalf),
    reach
  }
}

/** Écart d'angle entre deux points pris sur un arc, en radians. */
const ARC_STEP = Math.PI / 12

/** Le tracé tel qu'on le voit, coudes arrondis : chaque arc est remplacé par des points pris dessus. */
function flattenedPath(points: readonly GridPoint[], cornerRadius: number): GridPoint[] {
  const curve: GridPoint[] = []
  points.forEach((vertex, index) => {
    const previous = points[index - 1]
    const next = points[index + 1]
    const arc = previous && next ? cornerArc(previous, vertex, next, cornerRadius) : null
    if (!arc) {
      curve.push([vertex[0], vertex[1]])
      return
    }
    const steps = Math.max(1, Math.ceil(Math.abs(arc.sweep) / ARC_STEP))
    const from = Math.atan2(arc.start[1] - arc.center[1], arc.start[0] - arc.center[0])
    curve.push(arc.start)
    for (let step = 1; step < steps; step++) {
      const angle = from + (arc.sweep * step) / steps
      curve.push([
        arc.center[0] + arc.radius * Math.cos(angle),
        arc.center[1] + arc.radius * Math.sin(angle)
      ])
    }
    curve.push(arc.end)
  })
  return curve
}

/**
 * Longueur de la partie droite par laquelle un tracé finit, après l'arc de son dernier coude.
 * Infinie pour un seul segment : rien n'y tourne.
 */
function straightEnd(points: readonly GridPoint[], cornerRadius: number): number {
  const tip = points[points.length - 1]
  const corner = points[points.length - 2]
  const before = points[points.length - 3]
  if (!tip || !corner) return 0
  if (!before) return Infinity
  const run = Math.hypot(tip[0] - corner[0], tip[1] - corner[1])
  return run - (cornerArc(before, corner, tip, cornerRadius)?.reach ?? 0)
}

/**
 * Où la base d'une pointe se pose sur le tracé qui mène à son sommet, le dernier point : le
 * premier point rencontré en le remontant qui soit à une hauteur de pointe du sommet, à vol
 * d'oiseau. `kept` : combien de points du tracé restent avant la base. Un tracé plus court que la
 * pointe la laisse sur son premier point.
 */
function arrowSeat(
  track: readonly GridPoint[],
  length: number
): { kept: number; point: GridPoint } {
  const tip = track[track.length - 1]
  for (let index = track.length - 2; tip && index >= 0; index--) {
    const near = track[index + 1]
    const far = track[index]
    if (!near || !far) continue
    const dx = far[0] - near[0]
    const dy = far[1] - near[1]
    const ox = near[0] - tip[0]
    const oy = near[1] - tip[1]
    // Le point du segment à `length` du sommet : near + s × (far − near), s entre 0 et 1.
    const a = dx * dx + dy * dy
    const b = 2 * (dx * ox + dy * oy)
    const c = ox * ox + oy * oy - length * length
    const root = b * b - 4 * a * c
    if (a === 0 || root < 0) continue
    const s = (-b + Math.sqrt(root)) / (2 * a)
    if (s >= 0 && s <= 1) return { kept: index + 1, point: [near[0] + dx * s, near[1] + dy * s] }
  }
  const first = track[0] ?? [0, 0]
  return { kept: 0, point: [first[0], first[1]] }
}

/**
 * Trait et pointes d'un lien, en cellules ; l'écran et l'export dessinent la même chose.
 * `cornerRadius` : le rayon des coudes du diagramme, avec lequel le trait sera tracé.
 *
 * Une pointe se dessine dans l'axe du dernier tronçon tant qu'il est assez long pour la porter.
 * Sinon elle déborderait de la ligne, plantée en travers du tronçon précédent : elle penche alors
 * (décision du 11 novembre 2026). Son sommet ne bouge pas ; sa base se pose sur le tracé arrondi,
 * là où il passe à une hauteur de pointe du sommet, et elle vise son sommet depuis ce point. Le
 * trait suit le tracé jusqu'à la base : le coude que la pointe remplace n'est plus dessiné.
 */
export function linkShape(
  link: DiagramLink,
  nodes: readonly DiagramNode[],
  lineWidth: number,
  cornerRadius = 0
): LinkShape {
  const points = linkRenderPoints(link, nodes, lineWidth)
  const heads: LocalPoint[][] = []
  const length = linkArrowLength(lineWidth)
  // À un demi-côté du sommet, la pointe est déjà bien plus large que le trait.
  const inset = linkArrowSize(lineWidth) / 2
  const backwards = [...points].reverse()
  const leans =
    (link.endArrow && straightEnd(points, cornerRadius) < length) ||
    (link.startArrow && straightEnd(backwards, cornerRadius) < length)

  if (!leans) {
    const stroke = points.map((point): GridPoint => [point[0], point[1]])
    const arrow = (tipIndex: number, fromIndex: number): void => {
      const tip = points[tipIndex]
      const from = points[fromIndex]
      if (!tip || !from) return
      const head = linkArrowHead({ x: from[0], y: from[1] }, { x: tip[0], y: tip[1] }, lineWidth)
      if (!head) return
      heads.push(head)
      // Le trait s'arrête dans la pointe : son bout carré ne dépasse pas du bout effilé.
      const run = Math.hypot(tip[0] - from[0], tip[1] - from[1])
      const back = Math.min(inset, run * 0.9)
      stroke[tipIndex] = [
        tip[0] + ((from[0] - tip[0]) / run) * back,
        tip[1] + ((from[1] - tip[1]) / run) * back
      ]
    }
    if (link.startArrow) arrow(0, 1)
    if (link.endArrow) arrow(points.length - 1, points.length - 2)
    return { points, stroke, heads }
  }

  // Une pointe penche : tout se mesure sur le tracé arrondi, celui qu'on voit.
  const curve = flattenedPath(points, cornerRadius)
  const last = curve.length - 1
  /** Pointe au bout d'un tracé : son polygone, sa base sur le tracé, le bout du trait dedans. */
  const mount = (
    track: readonly GridPoint[]
  ): { kept: number; base: GridPoint[]; inner: GridPoint; tip: GridPoint } | null => {
    const tip = track[track.length - 1]
    if (!tip) return null
    const seat = arrowSeat(track, length)
    const from = seat.point
    const run = Math.hypot(tip[0] - from[0], tip[1] - from[1])
    const head = linkArrowHead({ x: from[0], y: from[1] }, { x: tip[0], y: tip[1] }, lineWidth)
    if (!head || run === 0) return null
    heads.push(head)
    const back = Math.min(inset, run * 0.9)
    return {
      kept: seat.kept,
      // Sur la partie droite du bout, la base est dans l'alignement : pas de sommet de plus.
      base: seat.kept === track.length - 1 ? [] : [from],
      inner: [
        tip[0] + ((from[0] - tip[0]) / run) * back,
        tip[1] + ((from[1] - tip[1]) / run) * back
      ],
      tip
    }
  }
  const start = link.startArrow ? mount([...curve].reverse()) : null
  const end = link.endArrow ? mount(curve) : null
  // Ce qui reste du tracé entre les deux bases (ou jusqu'au bout sans pointe).
  const lo = start ? last - start.kept + 1 : 0
  const hi = end ? end.kept - 1 : last
  const middle = lo <= hi ? curve.slice(lo, hi + 1) : []
  return {
    points: [
      ...(start ? [start.tip, ...start.base] : []),
      ...middle,
      ...(end ? [...end.base, end.tip] : [])
    ],
    stroke: [
      ...(start ? [start.inner, ...start.base] : []),
      ...middle,
      ...(end ? [...end.base, end.inner] : [])
    ],
    heads
  }
}

// Étiquette : elle longe le tracé, d'un côté ou de l'autre, toujours à la même distance du trait.

/** Distance entre le trait et le bord de son étiquette, en cellules. */
export const LINK_LABEL_GAP = 0.6
/** Pas de la position d'une étiquette le long du tracé, en cellules. */
const LABEL_STEP = 0.5

function pathLength(points: readonly GridPoint[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (a && b) total += Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])
  }
  return total
}

/** Point d'un tracé à une fraction de sa longueur (0 = départ, 1 = arrivée), et sens du segment qui le porte. */
export function pathPointAt(
  points: readonly GridPoint[],
  fraction: number
): { point: LocalPoint; horizontal: boolean } {
  const first = points[0] ?? [0, 0]
  let remaining = pathLength(points) * Math.min(1, Math.max(0, fraction))
  let last = { point: { x: first[0], y: first[1] }, horizontal: true }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (!a || !b) continue
    const length = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])
    if (length === 0) continue
    const horizontal = a[1] === b[1]
    if (remaining <= length) {
      const t = remaining / length
      return { point: { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t }, horizontal }
    }
    remaining -= length
    last = { point: { x: b[0], y: b[1] }, horizontal }
  }
  return last
}

/** Point à mi-longueur d'un tracé, et sens du segment qui le porte. */
export function pathMidpoint(points: readonly GridPoint[]): {
  point: LocalPoint
  horizontal: boolean
} {
  return pathPointAt(points, 0.5)
}

/** Côté d'un trait : -1 au-dessus (segment horizontal) ou à gauche (vertical), 1 en dessous ou à droite. */
export type LinkLabelSide = -1 | 1

/**
 * Position le long d'un tracé la plus proche d'un point : fraction de la longueur (au pas d'une
 * demi-cellule) et côté du trait où le point se trouve. C'est ce que donne le glisser d'une
 * étiquette : elle suit le pointeur le long du lien et change de côté quand il traverse le trait.
 */
export function nearestOnPath(
  points: readonly GridPoint[],
  target: LocalPoint
): { at: number; side: LinkLabelSide } {
  const total = pathLength(points)
  let best = { distance: Number.POSITIVE_INFINITY, along: 0, side: 1 as LinkLabelSide }
  let before = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (!a || !b) continue
    const length = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])
    if (length === 0) continue
    const horizontal = a[1] === b[1]
    // Projection sur le segment, bornée à ses extrémités.
    const offset = horizontal
      ? Math.min(Math.max((target.x - a[0]) * Math.sign(b[0] - a[0]), 0), length)
      : Math.min(Math.max((target.y - a[1]) * Math.sign(b[1] - a[1]), 0), length)
    const x = horizontal ? a[0] + Math.sign(b[0] - a[0]) * offset : a[0]
    const y = horizontal ? a[1] : a[1] + Math.sign(b[1] - a[1]) * offset
    const distance = Math.hypot(target.x - x, target.y - y)
    if (distance < best.distance) {
      const across = horizontal ? target.y - a[1] : target.x - a[0]
      best = { distance, along: before + offset, side: across < 0 ? -1 : 1 }
    }
    before += length
  }
  if (total === 0) return { at: 0.5, side: best.side }
  const snapped = Math.min(total, Math.max(0, Math.round(best.along / LABEL_STEP) * LABEL_STEP))
  return { at: snapped / total, side: best.side }
}

/** Côté d'une étiquette qu'on vient d'écrire : au-dessus d'un segment horizontal, à droite d'un vertical. */
export function defaultLabelSide(points: readonly GridPoint[], at: number): LinkLabelSide {
  return pathPointAt(points, at).horizontal ? -1 : 1
}

/** Largeur moyenne d'un caractère, en multiple de la hauteur de police. */
const CHAR_WIDTH: Record<DiagramFont, number> = { sans: 0.52, mono: 0.6 }

/** Taille estimée d'un texte de plusieurs lignes, en cellules. */
export function estimatedTextSize(
  text: string,
  fontHeight: number,
  font: DiagramFont
): { w: number; h: number } {
  const lines = text.split(String.fromCharCode(10))
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0)
  return {
    w: longest * CHAR_WIDTH[font] * fontHeight,
    h: lines.length * TEXT_LINE_HEIGHT * fontHeight
  }
}

/** Où se pose l'étiquette d'un lien : sa boîte, et de quel bord son texte part. */
export interface LinkLabelPlacement {
  /** Boîte du texte ; sa largeur est estimée, mais le bord tourné vers le trait est exact. */
  box: Box
  anchor: TextAnchor
}

/**
 * Place de l'étiquette d'un lien, toujours à `LINK_LABEL_GAP` du trait : centrée au-dessus ou en
 * dessous d'un segment horizontal ; à droite d'un segment vertical (le texte part du trait) ou à
 * gauche (il y finit). Null sans étiquette.
 */
export function linkLabelPlacement(
  link: DiagramLink,
  style: DiagramStyle
): LinkLabelPlacement | null {
  if (link.label.length === 0) return null
  const size = estimatedTextSize(link.label, style.labelSize / style.cellPx, style.font)
  const { point, horizontal } = pathPointAt(link.points, link.labelAt)
  const gap = LINK_LABEL_GAP + style.lineWidth / 2
  if (horizontal) {
    const y = link.labelSide < 0 ? point.y - gap - size.h : point.y + gap
    return { box: { x: point.x - size.w / 2, y, w: size.w, h: size.h }, anchor: 'middle' }
  }
  const x = link.labelSide < 0 ? point.x - gap - size.w : point.x + gap
  return {
    box: { x, y: point.y - size.h / 2, w: size.w, h: size.h },
    anchor: link.labelSide < 0 ? 'end' : 'start'
  }
}

/** Boîte de l'étiquette d'un lien (sélection, limites du diagramme) ; null sans étiquette. */
export function linkLabelBox(link: DiagramLink, style: DiagramStyle): Box | null {
  return linkLabelPlacement(link, style)?.box ?? null
}

/** Lignes de l'étiquette d'un lien et leur alignement ; null sans étiquette. */
export function layoutLinkLabel(
  link: DiagramLink,
  style: DiagramStyle
): (TextBoxLayout & { anchor: TextAnchor }) | null {
  const placement = linkLabelPlacement(link, style)
  if (!placement) return null
  const layout = layoutTextBox(
    placement.box,
    link.label,
    style.labelSize / style.cellPx,
    placement.anchor
  )
  return { ...layout, anchor: placement.anchor }
}

// Limites

/** Union des nœuds, des liens, de leurs étiquettes et des textes libres ; null si tout est vide. */
export function diagramBounds(diagram: Diagram): GridRect | null {
  let result: GridRect | null = null
  const include = (bounds: GridRect | null): void => {
    if (bounds) result = result ? unionRects(result, bounds) : { ...bounds }
  }
  for (const node of diagram.nodes) include(nodeBounds(node))
  for (const link of diagram.links) {
    include(wireBounds(link.points))
    const box = linkLabelBox(link, diagram.style)
    if (box) include({ x: box.x, y: box.y, width: box.w, height: box.h })
  }
  for (const text of diagram.texts) include(textLabelBounds(text))
  return result
}
