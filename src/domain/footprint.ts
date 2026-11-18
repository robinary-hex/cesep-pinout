import { isFootprint, primitiveBounds, type Primitive, type StyledPrimitive } from './component'
import { QUARTERS_PER_CELL } from './grid'
import { roundedPathData } from './roundedPath'

// Empreinte d'un composant (décision du 18 novembre 2026) : la place qu'il prend de l'autre côté
// d'une plaque à trous. Ses formes d'empreinte (`footprint`) ne disent que cette place : une
// empreinte a partout la même allure, quels que soient le trait et le remplissage des formes.
// Un voile sombre la remplit, un filet sombre que recouvrent des tirets clairs la cerne : elle se
// lit sur une plaque claire comme sur une plaque sombre, sans rivaliser avec les fils ni avec
// les pattes. Sur le montage, les formes d'empreinte d'un composant se fondent en une seule
// silhouette (svg.ts, FootprintGraphic.vue) ; l'éditeur de composants les montre une à une.

/** Allure d'une empreinte ; les longueurs sont en cellules. */
export const FOOTPRINT_STYLE = {
  /** Épaisseur du contour. */
  width: 0.07,
  /** Tirets clairs du contour, et l'intervalle où le filet sombre se voit. */
  dash: [0.24, 0.18],
  light: '#ffffff',
  dark: '#0b0f14',
  /** Opacité du filet sombre sous les tirets. */
  darkOpacity: 0.6,
  /** Opacité du voile qui remplit la silhouette. */
  shadowOpacity: 0.16,
  /**
   * Trait qui déborde des formes pleines, de leur couleur : deux formes bord à bord se
   * recouvrent, sans filet de fond entre elles.
   */
  seam: 0.03
} as const

const fmt = (value: number): string => String(Math.round(value * 1000) / 1000)

/** Attribut `stroke-dasharray` des tirets d'une empreinte ; `scale` : unités du dessin par cellule. */
export function footprintDashArray(scale = 1): string {
  return FOOTPRINT_STYLE.dash.map((length) => fmt(length * scale)).join(' ')
}

/** Tracé d'une forme d'empreinte ; `closed` : elle entoure une surface. */
export interface FootprintPath {
  d: string
  closed: boolean
}

/**
 * Tracé SVG d'une forme, sans son style : c'est ainsi que se dessine une empreinte. `scale` :
 * unités du dessin par cellule (1 sur le montage, la taille d'une cellule dans l'éditeur).
 */
export function footprintPath(primitive: StyledPrimitive, scale = 1): FootprintPath {
  const q = (value: number): number => (value * scale) / QUARTERS_PER_CELL
  switch (primitive.kind) {
    case 'rect': {
      const x = q(primitive.x)
      const y = q(primitive.y)
      const w = q(primitive.w)
      const h = q(primitive.h)
      const r = Math.min(q(primitive.rx), w / 2, h / 2)
      if (r <= 0) {
        return {
          d: `M ${fmt(x)} ${fmt(y)} H ${fmt(x + w)} V ${fmt(y + h)} H ${fmt(x)} Z`,
          closed: true
        }
      }
      const arc = (toX: number, toY: number): string =>
        `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(toX)} ${fmt(toY)}`
      return {
        d: [
          `M ${fmt(x + r)} ${fmt(y)}`,
          `H ${fmt(x + w - r)}`,
          arc(x + w, y + r),
          `V ${fmt(y + h - r)}`,
          arc(x + w - r, y + h),
          `H ${fmt(x + r)}`,
          arc(x, y + h - r),
          `V ${fmt(y + r)}`,
          arc(x + r, y),
          'Z'
        ].join(' '),
        closed: true
      }
    }
    case 'ellipse': {
      const cx = q(primitive.cx)
      const cy = q(primitive.cy)
      const rx = q(primitive.rx)
      const ry = q(primitive.ry)
      const half = (toX: number): string => `A ${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(toX)} ${fmt(cy)}`
      return {
        d: `M ${fmt(cx - rx)} ${fmt(cy)} ${half(cx + rx)} ${half(cx - rx)} Z`,
        closed: true
      }
    }
    case 'line':
      return {
        d: `M ${fmt(q(primitive.x1))} ${fmt(q(primitive.y1))} L ${fmt(q(primitive.x2))} ${fmt(q(primitive.y2))}`,
        closed: false
      }
    case 'polyline':
      return {
        d: roundedPathData(
          primitive.points.map(([x, y]) => ({ x: q(x), y: q(y) })),
          q(primitive.radius),
          primitive.closed
        ),
        closed: primitive.closed
      }
  }
}

/** L'empreinte d'un dessin : ses formes d'empreinte, et la boîte qui les contient largement. */
export interface FootprintDrawing {
  shapes: FootprintPath[]
  /** Boîte des formes, une cellule de marge comprise : la zone d'un masque. */
  box: { x: number; y: number; width: number; height: number }
}

/** Les formes d'empreinte d'un dessin, en cellules ; null s'il n'en a pas. */
export function footprintDrawing(primitives: readonly Primitive[]): FootprintDrawing | null {
  const shapes: FootprintPath[] = []
  let x1 = Number.POSITIVE_INFINITY
  let y1 = Number.POSITIVE_INFINITY
  let x2 = Number.NEGATIVE_INFINITY
  let y2 = Number.NEGATIVE_INFINITY
  for (const primitive of primitives) {
    if (!isFootprint(primitive) || !('style' in primitive)) continue
    shapes.push(footprintPath(primitive))
    const bounds = primitiveBounds(primitive)
    x1 = Math.min(x1, bounds.x1)
    y1 = Math.min(y1, bounds.y1)
    x2 = Math.max(x2, bounds.x2)
    y2 = Math.max(y2, bounds.y2)
  }
  if (shapes.length === 0) return null
  const margin = 1
  return {
    shapes,
    box: {
      x: x1 / QUARTERS_PER_CELL - margin,
      y: y1 / QUARTERS_PER_CELL - margin,
      width: (x2 - x1) / QUARTERS_PER_CELL + 2 * margin,
      height: (y2 - y1) / QUARTERS_PER_CELL + 2 * margin
    }
  }
}
