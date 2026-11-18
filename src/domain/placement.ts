import {
  isBoard,
  layoutTextBox,
  textLayoutBox,
  type ComponentDefinition,
  type TextAnchor,
  type TextBoxLayout,
  type TextPrimitive
} from './component'
import type { Box } from './handles'
import {
  rotateClockwise,
  rotateCounterClockwise,
  rotatedSize,
  type GridPoint,
  type LocalPoint,
  type Rotation,
  QUARTERS_PER_CELL
} from './grid'
import { instanceDefinition, type ComponentInstance, type Project, type TextLabel } from './project'
import { projectStyleSheet, styleOf } from './styles'
import { wireEndLabelBounds, wireEndLabelPlacement } from './wireEnds'

/** Rectangle en cellules, coin supérieur gauche + taille. */
export interface GridRect {
  x: number
  y: number
  width: number
  height: number
}

export type RotateDirection = 'cw' | 'ccw'
export type FlipAxis = 'horizontal' | 'vertical'

/** Boîte occupée par une instance posée, rotation comprise. */
export function instanceBounds(instance: ComponentInstance, def: ComponentDefinition): GridRect {
  const size = rotatedSize(def.size, instance.rotation)
  return { x: instance.x, y: instance.y, width: size.widthCells, height: size.heightCells }
}

export function rectsIntersect(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

export function rectContainsPoint(rect: GridRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
}

/** Vrai si `inner` tient en entier dans `outer`, bords compris. */
export function rectContainsRect(outer: GridRect, inner: GridRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

// Les deux faces d'une plaque à trous (voir boardFaces.ts) : le dessous se dessine à côté du
// dessus, retourné comme une page qu'on tourne. À sa droite au départ ; à sa gauche quand on a
// fait passer la plaque de l'autre côté de son pli (décision du 18 novembre 2026 : l'écart entre
// les faces porte un signe, négatif quand le dessous est à gauche).

/**
 * Écart entre le dessus et le dessous d'une plaque qui montre ses deux faces, en cellules : celui
 * d'une plaque qu'on n'a pas écartée de son pli, et le plus petit qu'elle puisse avoir.
 */
export const BOARD_FACES_GAP = 2

/** Ce composant posé est-il une plaque qui montre son dessous ? */
export function showsUnderside(
  instance: Pick<ComponentInstance, 'underside'>,
  def: ComponentDefinition
): boolean {
  return instance.underside === true && isBoard(def)
}

/**
 * Écart entre les deux faces d'une plaque posée, en cellules : le sien si on l'a écartée de son
 * pli (`facesGap`, décision du 18 novembre 2026 ; voir `spreadBoard`), sinon `BOARD_FACES_GAP`.
 * Positif, le dessous est à droite du dessus ; négatif, à sa gauche. Jamais plus petit, d'un côté
 * comme de l'autre, que `BOARD_FACES_GAP`.
 */
export function facesGap(instance: Pick<ComponentInstance, 'facesGap'>): number {
  const gap = instance.facesGap ?? BOARD_FACES_GAP
  return gap < 0 ? Math.min(-BOARD_FACES_GAP, gap) : Math.max(BOARD_FACES_GAP, gap)
}

/**
 * Boîte du dessous d'une plaque dont `top` est la boîte : de la même taille, à `gap` cellules,
 * à sa droite, ou à sa gauche quand `gap` est négatif.
 */
export function undersideBounds(top: GridRect, gap = BOARD_FACES_GAP): GridRect {
  return { ...top, x: gap < 0 ? top.x + gap - top.width : top.x + top.width + gap }
}

/**
 * Le miroir entre les deux faces : un point d'abscisse x du dessus se voit de dessous à
 * l'abscisse `facesFlip − x`, à la même hauteur (l'axe du miroir est au milieu de l'écart, du
 * côté où est le dessous).
 */
export function facesFlip(top: GridRect, gap = BOARD_FACES_GAP): number {
  return gap < 0 ? 2 * top.x + gap : 2 * (top.x + top.width) + gap
}

/**
 * Une plaque à deux faces déplacée par rapport à son pli (décision du 18 novembre 2026 : Ctrl
 * pendant qu'on la glisse). Le pli, l'axe du miroir, reste où il est : le dessus va de
 * (`dx`, `dy`) et le dessous, son reflet, de (−`dx`, `dy`). L'écart entre les faces change donc
 * du double de `dx` : la plaque s'écarte de son pli ou s'en rapproche, sans venir plus près que
 * `BOARD_FACES_GAP`. Poussée au-delà, elle passe de l'autre côté du pli dès que son milieu le
 * franchit : le dessus et le dessous échangent leurs côtés, au plus près du pli, puis s'en
 * écartent de nouveau. Rend la plaque à sa nouvelle place, avec son nouvel écart, dont le signe
 * dit de quel côté est le dessous ; null si elle ne montre pas son dessous ou si rien ne change.
 */
export function spreadBoard(
  instance: ComponentInstance,
  def: ComponentDefinition,
  dx: number,
  dy: number
): ComponentInstance | null {
  if (!showsUnderside(instance, def)) return null
  const top = instanceBounds(instance, def)
  const gap = facesGap(instance)
  const hinge = facesFlip(top, gap) / 2
  const reach = BOARD_FACES_GAP / 2
  const wanted = top.x + dx
  // De quel côté du pli le dessus se retrouve : celui de son milieu ; pile dessus, il y reste.
  const middle = wanted + top.width / 2
  const left = middle === hinge ? gap > 0 : middle < hinge
  // Jamais à cheval sur le pli : au plus près, de son côté.
  const x = left
    ? Math.min(wanted, Math.floor(hinge - reach) - top.width)
    : Math.max(wanted, Math.ceil(hinge + reach))
  const shift = x - top.x
  if (shift === 0 && dy === 0) return null
  const moved: ComponentInstance = { ...instance, x: instance.x + shift, y: instance.y + dy }
  const next = left ? 2 * (hinge - (x + top.width)) : -2 * (x - hinge)
  if (next === BOARD_FACES_GAP) delete moved.facesGap
  else moved.facesGap = next
  return moved
}

/**
 * Le pli entre les deux faces d'une plaque (décision du 17 novembre 2026) : un trait pointillé
 * au milieu de l'écart, sur l'axe du miroir, qui dépasse un peu la plaque en haut et en bas ; à
 * mi-hauteur, une petite flèche courbe va du dessus vers le dessous : vers la droite, ou vers la
 * gauche quand le dessous est de ce côté. Elle dit que l'une des deux plaques est l'autre,
 * retournée comme une page. Dessiné pareil à l'écran et à l'export.
 */
export interface FacesHinge {
  /** Abscisse du trait : l'axe du miroir entre les deux faces. */
  x: number
  /** Ses deux tronçons, au-dessus et au-dessous de la flèche : ordonnées de début et de fin. */
  spans: [number, number][]
  /** Tracé de l'arc de la flèche. */
  arc: string
  /** Sommets de sa pointe, du côté du dessous. */
  head: string
}

/** De combien le trait du pli dépasse la plaque, en haut et en bas, en cellules. */
export const HINGE_OVERSHOOT = 0.5
/** Allure du pli, en cellules : trait, tirets, arc de la flèche ; sa couleur à l'export. */
export const HINGE_STYLE = {
  width: 0.06,
  dash: '0.25 0.25',
  arrowWidth: 0.08,
  color: '#6e7781'
} as const

/**
 * Le pli d'une plaque dont `top` est la boîte du dessus, ses faces à `gap` cellules (négatif :
 * le dessous est à gauche, et la flèche pointe de ce côté).
 */
export function facesHinge(top: GridRect, gap = BOARD_FACES_GAP): FacesHinge {
  const round = (value: number): number => Math.round(value * 1000) / 1000
  const x = facesFlip(top, gap) / 2
  const middle = top.y + top.height / 2
  // Le sens de la flèche : du dessus vers le dessous.
  const side = gap < 0 ? -1 : 1
  // La flèche : un arc de 1,2 cellule, bombé vers le haut ; au bout, il descend à 45°.
  const half = 0.6
  const slope = Math.SQRT1_2
  const end = { x: x + side * half, y: middle }
  const tip = { x: end.x + side * 0.14 * slope, y: end.y + 0.14 * slope }
  const back = { x: end.x - side * 0.1 * slope, y: end.y - 0.1 * slope }
  const wing = 0.16 * slope
  const head = [
    tip,
    { x: back.x - side * wing, y: back.y + wing },
    { x: back.x + side * wing, y: back.y - wing }
  ]
  return {
    x,
    spans: [
      [top.y - HINGE_OVERSHOOT, round(middle - 0.7)],
      [round(middle + 0.5), top.y + top.height + HINGE_OVERSHOOT]
    ],
    arc: `M ${round(x - side * half)} ${round(middle)} Q ${round(x)} ${round(middle - half)} ${round(end.x)} ${round(end.y)}`,
    head: head.map((point) => `${round(point.x)},${round(point.y)}`).join(' ')
  }
}

/** Union des boîtes de tous les composants d'un projet ; null si le montage est vide. */
/** Plus petit rectangle contenant les deux. */
export function unionRects(a: GridRect, b: GridRect): GridRect {
  const x1 = Math.min(a.x, b.x)
  const y1 = Math.min(a.y, b.y)
  const x2 = Math.max(a.x + a.width, b.x + b.width)
  const y2 = Math.max(a.y + a.height, b.y + b.height)
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

/** Boîte d'une étiquette texte du montage, en cellules. */
export function textLabelBounds(label: { x: number; y: number; w: number; h: number }): GridRect {
  return { x: label.x, y: label.y, width: label.w, height: label.h }
}

/**
 * Lignes d'une étiquette du montage, en cellules (police en points / cellPx), dans sa boîte de
 * mise en page : la sienne, ou la même tournée d'un quart de tour si elle est verticale. `box`
 * remplace la boîte enregistrée (aperçu d'un déplacement ou d'une poignée).
 */
export function layoutLabel(label: TextLabel, cellPx: number, box: Box = label): TextBoxLayout {
  return layoutTextBox(
    textLayoutBox({ x: box.x, y: box.y, w: box.w, h: box.h, vertical: label.vertical }),
    label.text,
    label.size / cellPx,
    label.anchor
  )
}

/** Union des boîtes des composants, des sommets de fils et des étiquettes ; null si tout est vide. */
export function projectBounds(project: Project): GridRect | null {
  let result: GridRect | null = null
  const include = (bounds: GridRect): void => {
    result = result ? unionRects(result, bounds) : { ...bounds }
  }
  for (const instance of project.components) {
    const def = instanceDefinition(project, instance)
    if (!def) continue
    const bounds = instanceBounds(instance, def)
    include(bounds)
    // Une plaque qui montre son dessous occupe aussi la place de celui-ci, et celle du pli qui
    // dépasse entre ses deux faces.
    if (showsUnderside(instance, def)) {
      const gap = facesGap(instance)
      include(undersideBounds(bounds, gap))
      include({
        x: gap < 0 ? bounds.x + gap : bounds.x + bounds.width,
        y: bounds.y - HINGE_OVERSHOOT,
        width: Math.abs(gap),
        height: bounds.height + 2 * HINGE_OVERSHOOT
      })
    }
  }
  const sheet = projectStyleSheet(project)
  for (const wire of project.wires) {
    const style = styleOf(sheet, wire)
    const fontCells = style.endLabelFont.size / style.cellPx
    for (const [x, y] of wire.points) include({ x, y, width: 0, height: 0 })
    for (const endIndex of [0, wire.points.length - 1]) {
      const text = endIndex === 0 ? wire.endLabels.start : wire.endLabels.end
      const placement = text.length > 0 ? wireEndLabelPlacement(wire.points, endIndex) : null
      if (placement) include(wireEndLabelBounds(text, placement, fontCells))
    }
  }
  for (const label of project.labels) include(textLabelBounds(label))
  return result
}

/**
 * Rotation à l'écran d'un quart de tour, en gardant le centre de la boîte autant que la grille
 * le permet (décalage d'une demi-cellule quand largeur et hauteur n'ont pas la même parité).
 */
export function rotatedInstance(
  instance: ComponentInstance,
  def: ComponentDefinition,
  direction: RotateDirection
): ComponentInstance {
  const before = rotatedSize(def.size, instance.rotation)
  const rotation =
    direction === 'cw'
      ? rotateClockwise(instance.rotation)
      : rotateCounterClockwise(instance.rotation)
  const after = rotatedSize(def.size, rotation)
  return {
    ...instance,
    rotation,
    x: instance.x + Math.floor((before.widthCells - after.widthCells) / 2),
    y: instance.y + Math.floor((before.heightCells - after.heightCells) / 2)
  }
}

/**
 * Miroir à l'écran, gauche-droite ou haut-bas, la boîte restant en place.
 * Le modèle applique le miroir local avant la rotation ; un miroir d'écran revient donc à
 * basculer `mirror` et à inverser la rotation (horizontal : −θ ; vertical : 180° − θ).
 */
export function flippedInstance(instance: ComponentInstance, axis: FlipAxis): ComponentInstance {
  const rotation = ((axis === 'horizontal' ? 360 : 540) - instance.rotation) % 360
  return { ...instance, mirror: !instance.mirror, rotation: rotation as Rotation }
}

/** Matrice affine : x' = a·x + c·y + e, y' = b·x + d·y + f. */
export interface Matrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export const IDENTITY_MATRIX: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
const IDENTITY = IDENTITY_MATRIX

/** Composition p ∘ q : q s'applique d'abord. */
export function multiplyMatrices(p: Matrix, q: Matrix): Matrix {
  return {
    a: p.a * q.a + p.c * q.b,
    b: p.b * q.a + p.d * q.b,
    c: p.a * q.c + p.c * q.d,
    d: p.b * q.c + p.d * q.d,
    e: p.a * q.e + p.c * q.f + p.e,
    f: p.b * q.e + p.d * q.f + p.f
  }
}

export function applyMatrix(m: Matrix, point: LocalPoint): LocalPoint {
  return { x: m.a * point.x + m.c * point.y + m.e, y: m.b * point.x + m.d * point.y + m.f }
}

/**
 * Matrice du repère local du composant (cellules, non tourné) vers le repère du montage,
 * équivalente à `transformLocalPoint` suivie de la translation en (x, y). Sert au rendu SVG.
 */
export function instanceMatrix(instance: ComponentInstance, def: ComponentDefinition): Matrix {
  const w = def.size.widthCells
  const h = def.size.heightCells
  const mirror: Matrix = instance.mirror ? { a: -1, b: 0, c: 0, d: 1, e: w, f: 0 } : IDENTITY
  let rotation: Matrix
  switch (instance.rotation) {
    case 0:
      rotation = IDENTITY
      break
    case 90:
      rotation = { a: 0, b: 1, c: -1, d: 0, e: h, f: 0 }
      break
    case 180:
      rotation = { a: -1, b: 0, c: 0, d: -1, e: w, f: h }
      break
    case 270:
      rotation = { a: 0, b: -1, c: 1, d: 0, e: 0, f: w }
      break
  }
  const local = multiplyMatrices(rotation, mirror)
  return { ...local, e: local.e + instance.x, f: local.f + instance.y }
}

export function matrixToSvg(m: Matrix): string {
  return `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`
}

// Isométries de la grille : quarts de tour, miroirs et translations entières. Elles mènent une
// intersection sur une intersection ; c'est par elles qu'une plaque emmène ce qu'elle porte.

/** Sans zéro négatif : un entier de la grille. */
const tidy = (value: number): number => Math.round(value) + 0

/** Réciproque d'une isométrie de la grille. */
export function invertMatrix(m: Matrix): Matrix {
  const det = m.a * m.d - m.b * m.c
  const a = m.d / det
  const b = -m.b / det
  const c = -m.c / det
  const d = m.a / det
  return {
    a: a + 0,
    b: b + 0,
    c: c + 0,
    d: d + 0,
    e: -(a * m.e + c * m.f) + 0,
    f: -(b * m.e + d * m.f) + 0
  }
}

export function isIdentityMatrix(m: Matrix): boolean {
  return m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0
}

/** Une intersection de la grille, menée par une isométrie de la grille. */
export function transformedPoint(m: Matrix, point: GridPoint): GridPoint {
  const moved = applyMatrix(m, { x: point[0], y: point[1] })
  return [tidy(moved.x), tidy(moved.y)]
}

/** Un rectangle de la grille, mené par une isométrie de la grille : encore un rectangle. */
export function transformedRect(rect: GridRect, m: Matrix): GridRect {
  const a = applyMatrix(m, { x: rect.x, y: rect.y })
  const b = applyMatrix(m, { x: rect.x + rect.width, y: rect.y + rect.height })
  const x = tidy(Math.min(a.x, b.x))
  const y = tidy(Math.min(a.y, b.y))
  return { x, y, width: tidy(Math.max(a.x, b.x)) - x, height: tidy(Math.max(a.y, b.y)) - y }
}

/**
 * Un composant posé, mené par une isométrie de la grille : il se dessine comme si l'on avait
 * appliqué l'isométrie à son dessin. Un miroir d'écran d'abord s'il y en a un, puis des quarts de
 * tour, comme le font `flippedInstance` et `rotatedInstance` ; sa boîte va où l'isométrie la mène.
 */
export function transformedInstance(
  instance: ComponentInstance,
  def: ComponentDefinition,
  m: Matrix
): ComponentInstance {
  let next = instance
  const mirrored = m.a * m.d - m.b * m.c < 0
  if (mirrored) next = flippedInstance(next, 'horizontal')
  // Après le miroir, il reste une rotation : l'image de l'axe des x dit de combien de quarts.
  const ax = mirrored ? -m.a : m.a
  const ay = mirrored ? -m.b : m.b
  const turns = ax === 1 ? 0 : ay === 1 ? 1 : ax === -1 ? 2 : 3
  for (let turn = 0; turn < turns; turn++) next = rotatedInstance(next, def, 'cw')
  const box = transformedRect(instanceBounds(instance, def), m)
  return { ...next, x: box.x, y: box.y }
}

/** Prochain repère libre pour un préfixe : R1, R2… ; chaîne vide sans préfixe. */
export function nextLabel(prefix: string, taken: Iterable<string>): string {
  if (prefix.length === 0) return ''
  const used = new Set(taken)
  for (let n = 1; ; n++) {
    const candidate = `${prefix}${n}`
    if (!used.has(candidate)) return candidate
  }
}

/** Prochain identifiant libre de la forme préfixe + numéro. */
export function nextNumberedId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  for (let n = 1; ; n++) {
    const candidate = `${prefix}${n}`
    if (!used.has(candidate)) return candidate
  }
}

/** Texte d'un composant posé, tel que le montage le dessine : boîte, rotation, alignement. */
export interface InstanceTextPlacement {
  primitive: TextPrimitive
  /**
   * Boîte de mise en page, en cellules du montage. Pour un texte vertical, c'est sa boîte dans son
   * propre repère, tournée de `rotation` autour de son centre ; sinon la boîte droite que la
   * transformation lui donne.
   */
  box: Box
  /** Rotation horaire du texte : 0 ou 90, jamais tête en bas ; toujours 0 pour un texte horizontal. */
  rotation: Rotation
  /** Alignement effectif : inversé quand la transformation retourne l'axe de lecture du dessin. */
  anchor: TextAnchor
}

function flippedAnchor(anchor: TextAnchor): TextAnchor {
  return anchor === 'start' ? 'end' : anchor === 'end' ? 'start' : anchor
}

/**
 * Textes d'un composant posé, dessinés hors de la transformation de l'instance : les rotations
 * sont des quarts de tour, donc la boîte transformée reste un rectangle aligné sur la grille.
 * Un texte s'y met en page tel qu'il est dessiné, horizontal ou vertical. S'il suit la rotation,
 * un quart de tour du composant (90° ou 270°) échange les deux orientations : jamais à l'envers,
 * jamais en miroir. Quand la transformation retourne l'axe de lecture du dessin (miroir,
 * demi-tour), l'alignement gauche/droite s'inverse pour que le texte reste collé au même bord.
 */
export function instanceTextPlacements(
  instance: ComponentInstance,
  def: ComponentDefinition
): InstanceTextPlacement[] {
  const matrix = instanceMatrix(instance, def)
  return def.visual.primitives.flatMap((primitive): InstanceTextPlacement[] => {
    if (primitive.kind !== 'text') return []
    const { x, y, w, h } = primitive
    const corners = [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h]
    ].map(([qx = 0, qy = 0]) =>
      applyMatrix(matrix, { x: qx / QUARTERS_PER_CELL, y: qy / QUARTERS_PER_CELL })
    )
    const xs = corners.map((corner) => corner.x)
    const ys = corners.map((corner) => corner.y)
    const x1 = Math.min(...xs)
    const y1 = Math.min(...ys)
    const placed: Box = { x: x1, y: y1, w: Math.max(...xs) - x1, h: Math.max(...ys) - y1 }
    // Un texte vertical l'est au dessin ; s'il suit la rotation, un quart de tour du composant
    // l'échange (vertical devient horizontal, et inversement). Jamais à l'envers, jamais en miroir.
    const quarterTurn = instance.rotation === 90 || instance.rotation === 270
    const rotation: Rotation =
      primitive.vertical !== (primitive.followsRotation && quarterTurn) ? 90 : 0
    // Sens de lecture du dessin, transformé : s'il va à l'encontre du texte dessiné, l'alignement
    // s'inverse.
    const reading = primitive.vertical ? { x: matrix.c, y: matrix.d } : { x: matrix.a, y: matrix.b }
    const reversed = (rotation === 0 ? reading.x : reading.y) < 0
    const anchor = reversed ? flippedAnchor(primitive.anchor) : primitive.anchor
    if (rotation === 0) return [{ primitive, box: placed, rotation, anchor }]
    // Texte vertical : sa boîte dans son propre repère garde les proportions du dessin, centrée
    // là où la transformation l'a mise ; le quart de tour échange largeur et hauteur.
    const centerX = placed.x + placed.w / 2
    const centerY = placed.y + placed.h / 2
    return [
      {
        primitive,
        box: { x: centerX - placed.h / 2, y: centerY - placed.w / 2, w: placed.h, h: placed.w },
        rotation,
        anchor
      }
    ]
  })
}

/** Attribut `transform` SVG d'un texte posé : rotation autour du centre de sa boîte, sinon rien. */
export function textPlacementTransform(placement: InstanceTextPlacement): string | undefined {
  if (placement.rotation === 0) return undefined
  const { x, y, w, h } = placement.box
  return `rotate(${placement.rotation} ${x + w / 2} ${y + h / 2})`
}
