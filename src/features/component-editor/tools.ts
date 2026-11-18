import type { IconName } from '@/ui/icons'

export type ToolId =
  'select' | 'rect' | 'ellipse' | 'line' | 'polyline' | 'dot' | 'text' | 'pin' | 'holes'

export interface ToolInfo {
  id: ToolId
  /** Le nom de l'outil : son infobulle, avec sa touche. */
  label: string
  /** Touche (lettre gravée, clavier AZERTY belge). Dans cet éditeur, R = rectangle. */
  key: string
  icon: IconName
}

export const TOOLS: readonly ToolInfo[] = [
  { id: 'select', label: 'Sélection', key: 'v', icon: 'cursor' },
  { id: 'rect', label: 'Rectangle', key: 'r', icon: 'square' },
  { id: 'ellipse', label: 'Ellipse', key: 'o', icon: 'circle' },
  { id: 'dot', label: 'Point', key: 'n', icon: 'dot' },
  { id: 'line', label: 'Ligne', key: 'l', icon: 'line' },
  { id: 'polyline', label: 'Polyligne', key: 'p', icon: 'polyline' },
  { id: 'text', label: 'Texte', key: 'e', icon: 'type' },
  { id: 'pin', label: 'Broche', key: 'b', icon: 'pin' },
  { id: 'holes', label: 'Grille de trous', key: 'g', icon: 'holes' }
]

export const TOOL_BY_KEY: Readonly<Record<string, ToolId>> = Object.fromEntries(
  TOOLS.map((tool) => [tool.key, tool.id])
)
