import type { Theme } from '@/domain'

/** Applique le thème à la racine du document ; les variables CSS de style.css font le reste. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme
}
