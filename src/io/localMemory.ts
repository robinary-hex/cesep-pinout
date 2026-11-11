// Mémoire de l'interface, propre à cette machine : de petites choses à retrouver d'un lancement à
// l'autre qui ne sont pas des réglages (le dossier de la dernière image importée). Elles vivent
// dans le stockage local de la fenêtre, pas dans les fichiers de paramètres : rien à migrer, et
// rien qui parte vers les autres machines avec les paramètres partagés.

const PREFIX = 'pinout.'

/** Valeur gardée sous cette clé, ou null si rien n'a été gardé (ou sans stockage local). */
export function recall(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

/** Garde une valeur pour les prochains lancements ; sans stockage local, on s'en passe. */
export function remember(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PREFIX + key, value)
  } catch {
    // Stockage plein ou refusé : ce n'est qu'un confort.
  }
}
