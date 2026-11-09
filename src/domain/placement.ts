import {
  layoutTextBox,
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
  type LocalPoint,
  type Rotation,
  QUARTERS_PER_CELL
} from './grid'
import type { ComponentInstance, Project, TextLabel } from './project'
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

/** Lignes d'une étiquette du montage dans sa boîte, en cellules (police en points / cellPx). */
export function layoutLabel(label: TextLabel, cellPx: number): TextBoxLayout {
  return layoutTextBox(label, label.text, label.size / cellPx, label.anchor)
}

/** Union des boîtes des composants, des sommets de fils et des étiquettes ; null si tout est vide. */
export function projectBounds(project: Project): GridRect | null {
  let result: GridRect | null = null
  const include = (bounds: GridRect): void => {
    result = result ? unionRects(result, bounds) : { ...bounds }
  }
  for (const instance of project.components) {
    const def = project.embeddedDefs[instance.defId]
    if (def) include(instanceBounds(instance, def))
  }
  const fontCells = project.profile.endLabelFont.size / project.profile.cellPx
  for (const wire of project.wires) {
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

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

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

/** Rotation d'un texte qui suit le composant : vertical aux quarts de tour, horizontal sinon. */
function textRotation(rotation: Rotation): Rotation {
  return rotation === 90 || rotation === 270 ? 90 : 0
}

function flippedAnchor(anchor: TextAnchor): TextAnchor {
  return anchor === 'start' ? 'end' : anchor === 'end' ? 'start' : anchor
}

/**
 * Textes d'un composant posé, dessinés hors de la transformation de l'instance : les rotations
 * sont des quarts de tour, donc la boîte transformée reste un rectangle aligné sur la grille.
 * Un texte horizontal est mis en page dans cette boîte. Un texte qui suit la rotation est vertical
 * quand le composant est tourné d'un quart de tour (90° ou 270°), horizontal sinon : jamais à
 * l'envers, jamais en miroir. Quand la transformation retourne l'axe de lecture du dessin (miroir,
 * demi-tour), l'alignement gauche/droite s'inverse pour que le texte reste collé au même bord.
 */
export function instanceTextPlacements(
  instance: ComponentInstance,
  def: ComponentDefinition
): InstanceTextPlacement[] {
  if (def.visual.kind !== 'drawing') return []
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
    const rotation = primitive.followsRotation ? textRotation(instance.rotation) : 0
    // L'axe x du dessin, transformé, va-t-il à l'encontre du sens de lecture du texte dessiné ?
    const reversed = (rotation === 0 ? matrix.a : matrix.b) < 0
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
