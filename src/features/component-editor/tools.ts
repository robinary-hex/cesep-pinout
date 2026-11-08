export type ToolId = 'select' | 'rect' | 'ellipse' | 'line' | 'polyline' | 'text' | 'pin'

export interface ToolInfo {
  id: ToolId
  label: string
  /** Touche (lettre gravée, clavier AZERTY belge). Dans cet éditeur, R = rectangle. */
  key: string
  hint: string
}

export const TOOLS: readonly ToolInfo[] = [
  {
    id: 'select',
    label: 'Sélection',
    key: 'v',
    hint: 'Cliquer une forme ou une broche ; glisser pour déplacer'
  },
  { id: 'rect', label: 'Rectangle', key: 'r', hint: 'Glisser pour tracer' },
  { id: 'ellipse', label: 'Ellipse', key: 'o', hint: 'Glisser pour tracer' },
  { id: 'line', label: 'Ligne', key: 'l', hint: 'Glisser du départ à l’arrivée' },
  {
    id: 'polyline',
    label: 'Polyligne',
    key: 'p',
    hint: 'Cliquer chaque sommet ; double-clic ou Entrée pour terminer'
  },
  { id: 'text', label: 'Texte', key: 'e', hint: 'Cliquer pour poser un texte' },
  { id: 'pin', label: 'Broche', key: 'b', hint: 'Cliquer une intersection du bord' }
]

export const TOOL_BY_KEY: Readonly<Record<string, ToolId>> = Object.fromEntries(
  TOOLS.map((tool) => [tool.key, tool.id])
)
