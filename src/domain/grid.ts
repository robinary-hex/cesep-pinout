import { z } from 'zod'

/**
 * Conventions de grille.
 * - Les composants occupent des cellules ; les broches et les fils vivent sur les intersections.
 * - Toutes les coordonnées du domaine sont des entiers en unités de grille (canevas infini,
 *   valeurs négatives permises).
 * - Les primitives du mini-éditeur de composants sont en entiers de quarts de cellule.
 * - Le zoom et la taille de cellule à l'écran (profil de style) ne concernent que le rendu.
 */

export const gridCoordSchema = z.number().int()
export const gridPointSchema = z.tuple([gridCoordSchema, gridCoordSchema])
/** Intersection de grille : [x, y]. */
export type GridPoint = z.infer<typeof gridPointSchema>

export const rotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
export type Rotation = z.infer<typeof rotationSchema>
export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270]

export const sizeSchema = z.object({
  widthCells: z.number().int().positive(),
  heightCells: z.number().int().positive()
})
export type Size = z.infer<typeof sizeSchema>

export interface LocalPoint {
  x: number
  y: number
}

/** Quarts de cellule par cellule : résolution des primitives dessinées. */
export const QUARTERS_PER_CELL = 4

/** Pixels par cellule dans un PNG de composant : convention 4× la cellule d'affichage de 20 px. */
export const PNG_PX_PER_CELL = 80

/** Arrondit une coordonnée de souris à l'intersection la plus proche. */
export function snap(value: number): number {
  return Math.round(value)
}

export function rotateClockwise(rotation: Rotation): Rotation {
  return ((rotation + 90) % 360) as Rotation
}

export function rotateCounterClockwise(rotation: Rotation): Rotation {
  return ((rotation + 270) % 360) as Rotation
}

/** Taille occupée après rotation : largeur et hauteur s'échangent à 90° et 270°. */
export function rotatedSize(size: Size, rotation: Rotation): Size {
  return rotation === 90 || rotation === 270
    ? { widthCells: size.heightCells, heightCells: size.widthCells }
    : { widthCells: size.widthCells, heightCells: size.heightCells }
}

/**
 * Transforme un point local du composant (origine = coin supérieur gauche, non tourné)
 * en point local de l'instance posée : miroir horizontal d'abord, puis rotation horaire,
 * la boîte englobante gardant son coin supérieur gauche à l'origine.
 * Le miroir vertical de l'interface (Maj+T) = miroir horizontal + rotation de 180°.
 */
export function transformLocalPoint(
  point: LocalPoint,
  size: Size,
  rotation: Rotation,
  mirror: boolean
): LocalPoint {
  const w = size.widthCells
  const h = size.heightCells
  const x = mirror ? w - point.x : point.x
  const y = point.y
  switch (rotation) {
    case 0:
      return { x, y }
    case 90:
      return { x: h - y, y: x }
    case 180:
      return { x: w - x, y: h - y }
    case 270:
      return { x: y, y: w - x }
  }
}

/** Vrai si le point est sur le bord de la boîte [0, w] × [0, h]. */
export function isOnBorder(point: LocalPoint, size: Size): boolean {
  const { x, y } = point
  const inside = x >= 0 && x <= size.widthCells && y >= 0 && y <= size.heightCells
  return inside && (x === 0 || x === size.widthCells || y === 0 || y === size.heightCells)
}
