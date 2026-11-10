/** Tests : entrées du menu contextuel ouvert (ou de son sous-menu), dans l'ordre de l'écran. */
export function menuEntries(selector = '.context-menu:not(.sub-menu)'): HTMLButtonElement[] {
  return [...document.body.querySelectorAll<HTMLButtonElement>(`${selector} .entry`)]
}

/** Texte d'une entrée, sans son raccourci. */
function labelOf(entry: HTMLButtonElement): string {
  return entry.querySelector('.label')?.textContent?.trim() ?? ''
}

export function menuLabels(selector?: string): string[] {
  return menuEntries(selector).map(labelOf)
}

export function subMenuLabels(): string[] {
  return menuLabels('.context-menu.sub-menu')
}

/** Entrée du menu (ou du sous-menu ouvert) portant ce texte ; lève une erreur si elle manque. */
export function menuEntry(text: string): HTMLButtonElement {
  const found = menuEntries('.context-menu').find((candidate) => labelOf(candidate) === text)
  if (!found) throw new Error(`entrée « ${text} » introuvable`)
  return found
}

/** Clic droit à un point de l'écran sur un élément. */
export function rightClick(element: Element, clientX = 0, clientY = 0): void {
  element.dispatchEvent(
    new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX, clientY })
  )
}
