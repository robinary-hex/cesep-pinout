import { z } from 'zod'
import { hexColorSchema } from './color'
import { gridCoordSchema, gridPointSchema } from './grid'
import { textLabelSchema, wireGeometryProblem } from './project'

// Diagramme « boîtes et flèches » (organigramme, diagramme d'activité, schéma de communication).
// Des nœuds posés sur la grille, dont la forme vient d'un catalogue en dur ; des liens qui ont
// la géométrie des fils du montage (sommets sur les intersections, segments horizontaux ou
// verticaux) ; des textes libres. Rien ne dit dans le fichier qu'un lien est accroché à un nœud :
// cela se déduit de la géométrie (une extrémité posée sur un point d'accroche du nœud).

export const DIAGRAM_SCHEMA_VERSION = 3

/** Formes du catalogue, dans l'ordre de la bibliothèque. */
export const NODE_SHAPES = [
  'rounded',
  'rect',
  'diamond',
  'start',
  'end',
  'flow-end',
  'bar',
  'send',
  'receive',
  'note'
] as const
export const nodeShapeSchema = z.enum(NODE_SHAPES)
export type NodeShape = z.infer<typeof nodeShapeSchema>

/** Fond d'un nœud : contour seul, teinte légère de sa couleur, ou couleur pleine. */
export const NODE_FILLS = ['none', 'tint', 'solid'] as const
export const nodeFillSchema = z.enum(NODE_FILLS)
export type NodeFill = z.infer<typeof nodeFillSchema>

export interface NodeSpec {
  /** Nom dans la bibliothèque. */
  label: string
  /** Taille d'un nœud qu'on vient de poser, en cellules. */
  defaultSize: { w: number; h: number }
  /**
   * Pas des dimensions : 2 pour les formes dont les pointes sont au milieu des côtés, qui doivent
   * tomber sur une intersection pour qu'un lien s'y accroche.
   */
  step: 1 | 2
  /** Porte un titre et un sous-titre. */
  text: boolean
  /** Trait épais : une des deux dimensions est nulle. */
  line: boolean
  /** Largeur et hauteur égales. */
  square: boolean
}

export const NODE_SPECS: Record<NodeShape, NodeSpec> = {
  rounded: {
    label: 'Action',
    defaultSize: { w: 16, h: 6 },
    step: 1,
    text: true,
    line: false,
    square: false
  },
  rect: {
    label: 'Rectangle',
    defaultSize: { w: 16, h: 6 },
    step: 1,
    text: true,
    line: false,
    square: false
  },
  diamond: {
    label: 'Décision',
    defaultSize: { w: 4, h: 4 },
    step: 2,
    text: true,
    line: false,
    square: false
  },
  start: {
    label: 'Départ',
    defaultSize: { w: 2, h: 2 },
    step: 2,
    text: false,
    line: false,
    square: true
  },
  end: {
    label: 'Fin',
    defaultSize: { w: 2, h: 2 },
    step: 2,
    text: false,
    line: false,
    square: true
  },
  'flow-end': {
    label: 'Fin de flot',
    defaultSize: { w: 2, h: 2 },
    step: 2,
    text: false,
    line: false,
    square: true
  },
  bar: {
    label: 'Fourche',
    defaultSize: { w: 16, h: 0 },
    step: 1,
    text: false,
    line: true,
    square: false
  },
  send: {
    label: 'Envoi',
    defaultSize: { w: 16, h: 6 },
    step: 1,
    text: true,
    line: false,
    square: false
  },
  receive: {
    label: 'Réception',
    defaultSize: { w: 16, h: 6 },
    step: 1,
    text: true,
    line: false,
    square: false
  },
  note: {
    label: 'Note',
    defaultSize: { w: 16, h: 6 },
    step: 1,
    text: true,
    line: false,
    square: false
  }
}

export const DIAGRAM_FONTS = ['sans', 'mono'] as const
export const diagramFontSchema = z.enum(DIAGRAM_FONTS)
export type DiagramFont = z.infer<typeof diagramFontSchema>

/** Familles de police : normale, ou à chasse fixe pour les organigrammes de code. */
export const DIAGRAM_FONT_FAMILIES: Record<DiagramFont, string> = {
  sans: "'Segoe UI', sans-serif",
  mono: "Consolas, 'Cascadia Mono', monospace"
}

/** Multiplicateurs de taille proposés pour le texte d'un nœud. */
export const NODE_TEXT_SCALES = [1, 1.5, 2, 2.5, 3] as const

/** Nœud : une boîte en cellules, (x, y) = coin supérieur gauche. */
export const diagramNodeSchema = z.object({
  id: z.string().min(1),
  shape: nodeShapeSchema,
  x: gridCoordSchema,
  y: gridCoordSchema,
  w: z.number().int().nonnegative(),
  h: z.number().int().nonnegative(),
  /** Texte principal, retours à la ligne permis ; ignoré par les formes sans texte. */
  title: z.string(),
  subtitle: z.string(),
  /** Couleur du contour ; le noir pur prend l'encre du thème à l'écran. */
  color: hexColorSchema,
  fill: nodeFillSchema,
  /** Police de ce nœud ; null = celle du diagramme. */
  font: diagramFontSchema.nullable(),
  // Style du titre ; le sous-titre reste une ligne secondaire, maigre.
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
  strike: z.boolean(),
  /** Multiplicateur des tailles de texte du diagramme, pour ce nœud (titre et sous-titre). */
  textScale: z.number().positive()
})
export type DiagramNode = z.infer<typeof diagramNodeSchema>

/** Style du texte d'un nœud. */
export type NodeTextStyle = Pick<
  DiagramNode,
  'font' | 'bold' | 'italic' | 'underline' | 'strike' | 'textScale'
>

export const LINK_DASHES = ['solid', 'dashed'] as const
export const linkDashSchema = z.enum(LINK_DASHES)
export type LinkDash = z.infer<typeof linkDashSchema>

/** Lien : une ligne brisée à angles droits, comme un fil du montage. */
export const diagramLinkSchema = z
  .object({
    id: z.string().min(1),
    points: z.array(gridPointSchema).min(2),
    color: hexColorSchema,
    dash: linkDashSchema,
    startArrow: z.boolean(),
    endArrow: z.boolean(),
    /** Étiquette du lien ; vide = aucune. Elle longe le tracé, à distance fixe du trait. */
    label: z.string(),
    /** Où elle se tient le long du tracé : fraction de sa longueur, de 0 (départ) à 1 (arrivée). */
    labelAt: z.number().min(0).max(1),
    /**
     * De quel côté du trait : -1 au-dessus d'un segment horizontal ou à gauche d'un vertical,
     * 1 en dessous ou à droite.
     */
    labelSide: z.union([z.literal(-1), z.literal(1)])
  })
  .superRefine((link, ctx) => {
    const problem = wireGeometryProblem(link.points)
    if (problem !== null) ctx.addIssue({ code: 'custom', message: problem, path: ['points'] })
  })
export type DiagramLink = z.infer<typeof diagramLinkSchema>

/** Style d'un diagramme, enregistré avec lui. Longueurs en cellules, tailles de texte en points. */
export const diagramStyleSchema = z.object({
  /** Pixels par cellule à 100 % : la grille d'un diagramme est plus fine que celle d'un montage. */
  cellPx: z.number().int().positive(),
  /** Épaisseur des contours et des liens. */
  lineWidth: z.number().positive(),
  /** Rayon des coudes des liens. */
  cornerRadius: z.number().nonnegative(),
  /** Rayon des coins des rectangles arrondis. */
  nodeRadius: z.number().nonnegative(),
  font: diagramFontSchema,
  titleSize: z.number().positive(),
  subtitleSize: z.number().positive(),
  /** Taille des étiquettes de lien et des textes libres qu'on pose. */
  labelSize: z.number().positive()
})
export type DiagramStyle = z.infer<typeof diagramStyleSchema>

export const DEFAULT_DIAGRAM_STYLE: DiagramStyle = {
  cellPx: 10,
  lineWidth: 0.15,
  cornerRadius: 0.8,
  nodeRadius: 1,
  font: 'sans',
  titleSize: 14,
  subtitleSize: 12,
  labelSize: 12
}

const diagramShape = z.object({
  schemaVersion: z.literal(DIAGRAM_SCHEMA_VERSION),
  name: z.string(),
  style: diagramStyleSchema,
  /** Dans l'ordre d'empilement : le dernier est au-dessus. */
  nodes: z.array(diagramNodeSchema),
  links: z.array(diagramLinkSchema),
  /** Textes libres : le même modèle que les étiquettes texte du montage. */
  texts: z.array(textLabelSchema),
  /** Couleurs propres à ce diagramme, ajoutées par le « + » de la palette. */
  customColors: z.array(hexColorSchema)
})
export type Diagram = z.infer<typeof diagramShape>

/** Ce qui cloche dans la taille d'un nœud pour sa forme, ou null. */
export function nodeSizeProblem(node: Pick<DiagramNode, 'shape' | 'w' | 'h'>): string | null {
  const spec = NODE_SPECS[node.shape]
  if (spec.line) {
    const flat = node.h === 0 && node.w >= 1
    const upright = node.w === 0 && node.h >= 1
    return flat || upright ? null : 'Une barre a une longueur et une épaisseur nulle'
  }
  if (node.w < spec.step || node.h < spec.step) return 'Nœud trop petit'
  if (node.w % spec.step !== 0 || node.h % spec.step !== 0) {
    return 'Les dimensions de cette forme sont paires'
  }
  if (spec.square && node.w !== node.h) return 'Cette forme est aussi large que haute'
  return null
}

export const diagramSchema = diagramShape.superRefine((diagram, ctx) => {
  const check = (items: readonly { id: string }[], path: string, what: string): void => {
    const seen = new Set<string>()
    items.forEach((entry, i) => {
      if (seen.has(entry.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Identifiant de ${what} en double : ${entry.id}`,
          path: [path, i, 'id']
        })
      }
      seen.add(entry.id)
    })
  }
  check(diagram.nodes, 'nodes', 'nœud')
  check(diagram.links, 'links', 'lien')
  check(diagram.texts, 'texts', 'texte')
  diagram.nodes.forEach((node, i) => {
    const problem = nodeSizeProblem(node)
    if (problem !== null) ctx.addIssue({ code: 'custom', message: problem, path: ['nodes', i] })
  })
})

export function createEmptyDiagram(
  name: string,
  style: DiagramStyle = DEFAULT_DIAGRAM_STYLE
): Diagram {
  return {
    schemaVersion: DIAGRAM_SCHEMA_VERSION,
    name,
    style: { ...style },
    nodes: [],
    links: [],
    texts: [],
    customColors: []
  }
}

/**
 * Style de texte d'un nœud qu'on vient de poser : la police du diagramme, taille ×1, et un titre
 * en gras en police normale, maigre en chasse fixe (les organigrammes de code).
 */
export function defaultNodeTextStyle(style: DiagramStyle): NodeTextStyle {
  return {
    font: null,
    bold: style.font !== 'mono',
    italic: false,
    underline: false,
    strike: false,
    textScale: 1
  }
}

/** Nœud neuf d'une forme, à sa taille par défaut, sans texte ; (x, y) = coin supérieur gauche. */
export function createNode(
  id: string,
  shape: NodeShape,
  x: number,
  y: number,
  style: DiagramStyle = DEFAULT_DIAGRAM_STYLE
): DiagramNode {
  const size = NODE_SPECS[shape].defaultSize
  return {
    id,
    shape,
    x,
    y,
    w: size.w,
    h: size.h,
    title: '',
    subtitle: '',
    color: '#000000',
    fill: 'tint',
    ...defaultNodeTextStyle(style)
  }
}

export function isEmptyDiagram(diagram: Diagram): boolean {
  return diagram.nodes.length === 0 && diagram.links.length === 0 && diagram.texts.length === 0
}

/**
 * Taille d'un nœud ramenée à ce que sa forme permet : au moins un pas, multiples du pas, carrée
 * s'il le faut (le plus grand côté l'emporte) ; une barre garde son épaisseur nulle.
 */
export function fittedNodeSize(
  shape: NodeShape,
  w: number,
  h: number,
  current?: { w: number; h: number }
): { w: number; h: number } {
  const spec = NODE_SPECS[shape]
  if (spec.line) {
    // Une barre reste dans son sens ; à défaut, couchée.
    const upright = current ? current.w === 0 : w === 0 && h > 0
    return upright ? { w: 0, h: Math.max(1, h) } : { w: Math.max(1, w), h: 0 }
  }
  const fit = (value: number): number =>
    Math.max(spec.step, Math.round(value / spec.step) * spec.step)
  if (spec.square) {
    const side = fit(Math.max(w, h))
    return { w: side, h: side }
  }
  return { w: fit(w), h: fit(h) }
}
