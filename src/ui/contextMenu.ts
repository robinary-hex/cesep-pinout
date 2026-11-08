import type { IconName } from './icons'

/** Entrées d'un menu contextuel ou déroulant (voir ContextMenu.vue). */

export interface MenuSwatch {
  hex: string
  name: string
  current: boolean
}

export interface MenuItemOptions {
  /** Raccourci affiché à droite. */
  hint?: string
  icon?: IconName
  disabled?: boolean
  danger?: boolean
  checked?: boolean
}

export type MenuItem =
  | { kind: 'heading'; label: string }
  | { kind: 'separator' }
  | { kind: 'swatches'; swatches: MenuSwatch[]; pick: (hex: string) => void }
  | ({ kind: 'item'; label: string; action: () => void } & MenuItemOptions)

export const SEPARATOR: MenuItem = { kind: 'separator' }

export function heading(label: string): MenuItem {
  return { kind: 'heading', label }
}

export function item(label: string, action: () => void, options: MenuItemOptions = {}): MenuItem {
  return { kind: 'item', label, action, ...options }
}
