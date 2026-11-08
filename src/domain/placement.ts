import type { ComponentDefinition } from './component'
import {
  rotateClockwise,
  rotateCounterClockwise,
  rotatedSize,
  type LocalPoint,
  type Rotation
} from './grid'
import type { ComponentInstance, Project } from './project'

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

/** Encombrement approché d'une étiquette texte, arrondi à la cellule (hauteur = taille en points / cellPx). */
export function textLabelBounds(
  label: { x: number; y: number; text: string; size: number },
  cellPx: number
): GridRect {
  const height = label.size / cellPx
  const width = Math.max(1, Math.ceil(label.text.length * 0.6 * height))
  return { x: label.x, y: Math.floor(label.y - height), width, height: Math.ceil(height) }
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
  for (const wire of project.wires) {
    for (const [x, y] of wire.points) include({ x, y, width: 0, height: 0 })
  }
  for (const label of project.labels) include(textLabelBounds(label, project.profile.cellPx))
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
