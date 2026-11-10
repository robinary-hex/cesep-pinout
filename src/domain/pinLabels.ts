import { primitiveBounds, type Primitive } from './component'
import { QUARTERS_PER_CELL, type LocalPoint, type Size } from './grid'
import type { Box } from './handles'

/**
 * Placement du repère d'une broche dans l'éditeur de composants. Les broches pouvant être
 * n'importe où dans la boîte, le repère cherche un côté où il ne recouvre aucune forme, du bord
 * le plus proche au plus lointain ; faute de côté libre, il se met du côté du bord le plus proche.
 * Les boîtes sont en cellules.
 */

export type LabelSide = 'top' | 'bottom' | 'left' | 'right'

/** Côtés dans l'ordre du bord le plus proche de la broche ; à égalité : haut, bas, gauche, droite. */
export function sidesByNearestBorder(point: LocalPoint, size: Size): LabelSide[] {
  const distances: [LabelSide, number][] = [
    ['top', point.y],
    ['bottom', size.heightCells - point.y],
    ['left', point.x],
    ['right', size.widthCells - point.x]
  ]
  return distances.sort((a, b) => a[1] - b[1]).map(([side]) => side)
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** Vrai si `inner` tient entièrement dans `outer`. */
function boxInside(inner: Box, outer: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

function pointInBox(point: LocalPoint, box: Box): boolean {
  return (
    point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h
  )
}

function orientation(p: LocalPoint, q: LocalPoint, r: LocalPoint): number {
  return Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x))
}

function segmentsCross(a: LocalPoint, b: LocalPoint, c: LocalPoint, d: LocalPoint): boolean {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  if (o1 !== o2 && o3 !== o4) return true
  // Segments alignés : ils se touchent si leurs projections se recouvrent.
  if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) {
    return (
      Math.max(a.x, b.x) >= Math.min(c.x, d.x) &&
      Math.max(c.x, d.x) >= Math.min(a.x, b.x) &&
      Math.max(a.y, b.y) >= Math.min(c.y, d.y) &&
      Math.max(c.y, d.y) >= Math.min(a.y, b.y)
    )
  }
  return false
}

/** Vrai si le segment [a, b] touche la boîte : une extrémité dedans, ou un côté traversé. */
export function segmentTouchesBox(a: LocalPoint, b: LocalPoint, box: Box): boolean {
  if (pointInBox(a, box) || pointInBox(b, box)) return true
  const corners: LocalPoint[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h }
  ]
  for (let i = 0; i < corners.length; i++) {
    const c = corners[i]
    const d = corners[(i + 1) % corners.length]
    if (c && d && segmentsCross(a, b, c, d)) return true
  }
  return false
}

/** Marge autour du repère, pour ne pas frôler un trait, en cellules. */
const STROKE_MARGIN = 0.1

function grow(box: Box, margin: number): Box {
  return { x: box.x - margin, y: box.y - margin, w: box.w + 2 * margin, h: box.h + 2 * margin }
}

/**
 * Vrai si la forme touche la boîte. Un rectangle ou une ellipse sans remplissage ne compte que par
 * son contour : un repère entièrement à l'intérieur reste libre.
 */
export function primitiveTouchesBox(primitive: Primitive, box: Box): boolean {
  const q = QUARTERS_PER_CELL
  const b = primitiveBounds(primitive)
  const bounds: Box = { x: b.x1 / q, y: b.y1 / q, w: (b.x2 - b.x1) / q, h: (b.y2 - b.y1) / q }
  const target = grow(box, STROKE_MARGIN)
  switch (primitive.kind) {
    case 'text':
    case 'dot':
    case 'image':
      return boxesOverlap(bounds, target)
    case 'rect':
    case 'ellipse':
      if (!boxesOverlap(bounds, target)) return false
      return primitive.style.fill !== 'none' || !boxInside(target, bounds)
    case 'line':
      return segmentTouchesBox(
        { x: primitive.x1 / q, y: primitive.y1 / q },
        { x: primitive.x2 / q, y: primitive.y2 / q },
        target
      )
    case 'polyline': {
      if (primitive.closed && primitive.style.fill !== 'none' && boxesOverlap(bounds, target)) {
        return true
      }
      const points = primitive.points.map(([x, y]) => ({ x: x / q, y: y / q }))
      const segments = primitive.closed ? points.length : points.length - 1
      for (let i = 0; i < segments; i++) {
        const a = points[i]
        const next = points[(i + 1) % points.length]
        if (a && next && segmentTouchesBox(a, next, target)) return true
      }
      return false
    }
  }
}

/**
 * Côté du repère d'une broche : le premier, du bord le plus proche au plus lointain, dont la boîte
 * (donnée par `boxFor`) ne touche aucune forme ; sinon le bord le plus proche.
 */
export function pinLabelSide(
  point: LocalPoint,
  size: Size,
  primitives: readonly Primitive[],
  boxFor: (side: LabelSide) => Box
): LabelSide {
  const sides = sidesByNearestBorder(point, size)
  const free = sides.find((side) => {
    const box = boxFor(side)
    return !primitives.some((primitive) => primitiveTouchesBox(primitive, box))
  })
  return free ?? sides[0] ?? 'bottom'
}
