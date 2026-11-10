import type { IconName } from '@/ui/icons'

export type ToolId = 'select' | 'rect' | 'ellipse' | 'line' | 'polyline' | 'dot' | 'text' | 'pin'

export interface ToolInfo {
  id: ToolId
  label: string
  /** Touche (lettre gravée, clavier AZERTY belge). Dans cet éditeur, R = rectangle. */
  key: string
  hint: string
  icon: IconName
}

export const TOOLS: readonly ToolInfo[] = [
  {
    id: 'select',
    label: 'Sélection',
    key: 'v',
    hint: 'Cliquer une forme ou une broche ; glisser pour déplacer',
    icon: 'cursor'
  },
  { id: 'rect', label: 'Rectangle', key: 'r', hint: 'Glisser pour tracer', icon: 'square' },
  { id: 'ellipse', label: 'Ellipse', key: 'o', hint: 'Glisser pour tracer', icon: 'circle' },
  { id: 'line', label: 'Ligne', key: 'l', hint: 'Glisser du départ à l’arrivée', icon: 'line' },
  {
    id: 'polyline',
    label: 'Polyligne',
    key: 'p',
    hint: 'Cliquer chaque sommet ; double-clic ou Entrée pour terminer',
    icon: 'polyline'
  },
  { id: 'dot', label: 'Point', key: 'n', hint: 'Cliquer pour poser un point', icon: 'dot' },
  { id: 'text', label: 'Texte', key: 'e', hint: 'Cliquer pour poser un texte', icon: 'type' },
  { id: 'pin', label: 'Broche', key: 'b', hint: 'Cliquer une intersection du bord', icon: 'pin' }
]

export const TOOL_BY_KEY: Readonly<Record<string, ToolId>> = Object.fromEntries(
  TOOLS.map((tool) => [tool.key, tool.id])
)
