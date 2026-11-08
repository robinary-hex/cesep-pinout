/** Entrées d'un menu contextuel (voir ContextMenu.vue). */

export interface MenuSwatch {
  hex: string
  name: string
  current: boolean
}

export type MenuItem =
  | { kind: 'heading'; label: string }
  | { kind: 'separator' }
  | { kind: 'swatches'; swatches: MenuSwatch[]; pick: (hex: string) => void }
  | {
      kind: 'item'
      label: string
      /** Raccourci affiché à droite. */
      hint?: string
      disabled?: boolean
      danger?: boolean
      checked?: boolean
      action: () => void
    }

export const SEPARATOR: MenuItem = { kind: 'separator' }

export function heading(label: string): MenuItem {
  return { kind: 'heading', label }
}

export function item(
  label: string,
  action: () => void,
  options: { hint?: string; disabled?: boolean; danger?: boolean; checked?: boolean } = {}
): MenuItem {
  return { kind: 'item', label, action, ...options }
}
