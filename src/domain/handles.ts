import type { Primitive, QuarterPoint } from './component'

/**
 * Poignées de modification d'une forme du mini-éditeur, en quarts de cellule :
 * coins et côtés d'un rectangle ou d'une ellipse, extrémités d'une ligne, sommets d'une polyligne.
 */

export interface Handle {
  id: string
  x: number
  y: number
}

/** Boîte à poignées (coins et côtés), dans n'importe quelle unité. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Les huit poignées d'une boîte : coins puis milieux des côtés. */
export function boxHandles(box: Box): Handle[] {
  const { x, y, w, h } = box
  return [
    { id: 'nw', x, y },
    { id: 'n', x: x + w / 2, y },
    { id: 'ne', x: x + w, y },
    { id: 'e', x: x + w, y: y + h / 2 },
    { id: 'se', x: x + w, y: y + h },
    { id: 's', x: x + w / 2, y: y + h },
    { id: 'sw', x, y: y + h },
    { id: 'w', x, y: y + h / 2 }
  ]
}

/** La boîte après glisser d'une poignée vers `target` ; une dimension ne descend jamais sous 1. */
export function resizeBox(box: Box, handleId: string, target: readonly [number, number]): Box {
  const [tx, ty] = target
  let x1 = box.x
  let y1 = box.y
  let x2 = box.x + box.w
  let y2 = box.y + box.h
  if (handleId.includes('w')) x1 = Math.min(tx, x2 - 1)
  if (handleId.includes('e')) x2 = Math.max(tx, x1 + 1)
  if (handleId.includes('n')) y1 = Math.min(ty, y2 - 1)
  if (handleId.includes('s')) y2 = Math.max(ty, y1 + 1)
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export function primitiveHandles(primitive: Primitive): Handle[] {
  switch (primitive.kind) {
    case 'rect':
    case 'text':
      return boxHandles(primitive)
    case 'dot':
      // Un point se déplace en le glissant ; sa taille se règle dans le panneau.
      return []
    case 'ellipse': {
      const { cx, cy, rx, ry } = primitive
      return [
        { id: 'w', x: cx - rx, y: cy },
        { id: 'e', x: cx + rx, y: cy },
        { id: 'n', x: cx, y: cy - ry },
        { id: 's', x: cx, y: cy + ry }
      ]
    }
    case 'line':
      return [
        { id: 'a', x: primitive.x1, y: primitive.y1 },
        { id: 'b', x: primitive.x2, y: primitive.y2 }
      ]
    case 'polyline':
      return primitive.points.map(([x, y], index) => ({ id: `v${index}`, x, y }))
  }
}

/** La forme après glisser d'une poignée vers `target` ; une dimension ne descend jamais sous 1. */
export function dragHandle(
  primitive: Primitive,
  handleId: string,
  target: QuarterPoint
): Primitive {
  const [tx, ty] = target
  switch (primitive.kind) {
    case 'rect':
    case 'text':
      return { ...primitive, ...resizeBox(primitive, handleId, target) }
    case 'dot':
      return primitive
    case 'ellipse':
      if (handleId === 'w' || handleId === 'e') {
        return { ...primitive, rx: Math.max(1, Math.abs(tx - primitive.cx)) }
      }
      return { ...primitive, ry: Math.max(1, Math.abs(ty - primitive.cy)) }
    case 'line':
      return handleId === 'a' ? { ...primitive, x1: tx, y1: ty } : { ...primitive, x2: tx, y2: ty }
    case 'polyline': {
      const index = Number(handleId.slice(1))
      return {
        ...primitive,
        points: primitive.points.map((point, i): QuarterPoint => (i === index ? [tx, ty] : point))
      }
    }
  }
}

/** Poignée la plus proche d'un point (quarts de cellule, flottant), ou null sans poignée. */
export function nearestHandle(primitive: Primitive, x: number, y: number): Handle | null {
  let best: Handle | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const handle of primitiveHandles(primitive)) {
    const distance = Math.hypot(handle.x - x, handle.y - y)
    if (distance < bestDistance) {
      best = handle
      bestDistance = distance
    }
  }
  return best
}
