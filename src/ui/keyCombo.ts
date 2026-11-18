// Combinaisons de touches et de gestes de souris, telles qu'on les écrit (« Ctrl+Maj+G »,
// « Alt+glisser ») et telles qu'on les dessine : une touche par capuchon, un geste de souris
// par pastille (`KeyCombo.vue`). L'aide (F1) et les infobulles parlent ainsi la même langue.

/** Geste de souris : ce que dit sa pastille, le bouton qui travaille, s'il glisse ou clique deux fois. */
export interface MouseGesture {
  text: string
  button: 'left' | 'right' | 'middle' | 'wheel'
  drag?: boolean
  double?: boolean
}

/**
 * Les gestes de souris qu'on sait dessiner, par leur nom dans une combinaison. Un double-clic se
 * dit « ×2 », plus court ; « déposer », c'est glisser un fichier dans la fenêtre.
 */
export const MOUSE_GESTURES: Record<string, MouseGesture> = {
  clic: { text: 'clic', button: 'left' },
  'double-clic': { text: 'clic ×2', button: 'left', double: true },
  'clic droit': { text: 'clic droit', button: 'right' },
  'clic milieu': { text: 'clic milieu', button: 'middle' },
  'double-clic milieu': { text: 'milieu ×2', button: 'middle', double: true },
  glisser: { text: 'glisser', button: 'left', drag: true },
  'glisser milieu': { text: 'glisser milieu', button: 'middle', drag: true },
  déposer: { text: 'déposer', button: 'left', drag: true },
  molette: { text: 'molette', button: 'wheel' }
}

/** Ce qu'on écrit sur une touche quand ce n'est pas son nom. */
const KEY_FACES: Record<string, string> = { Flèches: '← ↑ ↓ →' }

/** Les touches qui ont un nom, en plus des lettres, des chiffres et de F1 à F12. */
const NAMED_KEYS: ReadonlySet<string> = new Set([
  'Ctrl',
  'Maj',
  'Alt',
  'Suppr',
  'Échap',
  'Entrée',
  'Espace',
  'Tab',
  'Retour arrière',
  'Page haut',
  'Page bas',
  'Flèches'
])

/** Un morceau de combinaison : une touche (`mouse` nul) ou un geste de souris. */
export interface KeyToken {
  text: string
  mouse: MouseGesture | null
}

/** Les touches et gestes d'une combinaison, dans l'ordre où on les fait. */
export function comboTokens(combo: string): KeyToken[] {
  return combo.split('+').map((part) => {
    const name = part.trim()
    const mouse = MOUSE_GESTURES[name] ?? null
    return { text: mouse?.text ?? KEY_FACES[name] ?? name, mouse }
  })
}

/** Ce nom est-il celui d'une touche : une lettre, un chiffre, F1 à F12, ou une touche nommée ? */
function isKeyName(name: string): boolean {
  return /^[A-Z0-9]$/.test(name) || /^F([1-9]|1[0-2])$/.test(name) || NAMED_KEYS.has(name)
}

/**
 * Ce texte est-il une combinaison qu'on sait dessiner : rien que des touches et des gestes de
 * souris connus, joints par « + » ? C'est ce qui distingue le raccourci d'une infobulle
 * (« (Ctrl+N) ») d'une simple précision entre parenthèses.
 */
export function isKeyCombo(combo: string): boolean {
  const names = combo.split('+').map((part) => part.trim())
  return names.every((name) => isKeyName(name) || name in MOUSE_GESTURES)
}
