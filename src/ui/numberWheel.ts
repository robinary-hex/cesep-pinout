// Maj+molette sur un champ numérique (décision du 16 novembre 2026) : sa valeur monte ou descend
// d'un pas par cran, sans la taper ni viser les petites flèches du champ. La même règle pour tous
// les champs numériques de l'application (panneaux, boîtes de dialogue) : `App.vue` écoute la
// molette une fois pour toute la fenêtre. Il faut Maj : sans elle, la molette fait défiler le
// panneau, et un champ qui passe sous le pointeur ne doit pas changer de valeur.

/** Ce qui borne un champ numérique : son pas et ses limites, quand il en a. */
export interface NumberLimits {
  step?: number | undefined
  min?: number | undefined
  max?: number | undefined
}

/** Nombre de décimales d'un nombre tel qu'il s'écrit. */
function decimals(value: number): number {
  const text = String(value)
  const exponent = text.indexOf('e-')
  if (exponent >= 0) return Number(text.slice(exponent + 2))
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}

/**
 * La valeur un pas au-dessus (`direction` 1) ou en dessous (-1) : le multiple du pas qui suit, donc
 * 2,3 passe à 3 ou à 2 pour un pas de 1. Les pas se comptent depuis le minimum du champ quand il
 * en a un, comme le fait le navigateur ; le résultat reste entre les bornes.
 */
export function steppedValue(value: number, direction: 1 | -1, limits: NumberLimits = {}): number {
  const step = limits.step !== undefined && limits.step > 0 ? limits.step : 1
  const base = limits.min ?? 0
  const rank = (value - base) / step
  // Marge contre les arrondis : 0,3 / 0,1 ne vaut pas tout à fait 3.
  const slack = 1e-9
  const next = direction > 0 ? Math.floor(rank + slack) + 1 : Math.ceil(rank - slack) - 1
  let result = Number((base + next * step).toFixed(Math.max(decimals(step), decimals(base))))
  if (limits.max !== undefined) result = Math.min(result, limits.max)
  if (limits.min !== undefined) result = Math.max(result, limits.min)
  return result
}

function numberAttribute(
  input: HTMLInputElement,
  name: 'step' | 'min' | 'max'
): number | undefined {
  const raw = input.getAttribute(name)
  if (raw === null || raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

/**
 * Le champ numérique que vise le pointeur : celui qu'il survole, ou le seul champ numérique de
 * l'étiquette survolée (le libellé d'un champ étroit compte aussi). Aucun s'il est désactivé.
 */
export function numberFieldAt(target: EventTarget | null): HTMLInputElement | null {
  if (!(target instanceof Element)) return null
  let field = target.closest('input[type="number"]')
  if (field === null) {
    const inLabel = target.closest('label')?.querySelectorAll('input[type="number"]')
    field = inLabel?.length === 1 ? (inLabel[0] ?? null) : null
  }
  if (!(field instanceof HTMLInputElement) || field.disabled || field.readOnly) return null
  return field
}

/**
 * À brancher sur `wheel`, en écoute non passive : avec Maj sur un champ numérique, règle le champ
 * d'un pas par cran (vers le haut : plus), puis le valide comme une saisie (`input` pour les champs
 * liés par v-model, `change` pour ceux des panneaux, qui en font une commande). Rend vrai quand la
 * molette a servi au champ : elle ne fait alors rien d'autre.
 */
export function wheelOnNumberField(event: WheelEvent): boolean {
  if (!event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false
  const field = numberFieldAt(event.target)
  if (field === null) return false
  // Avec Maj, Chromium fait de la molette un défilement horizontal : le cran est alors dans deltaX.
  const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX
  if (delta === 0) return false
  event.preventDefault()
  event.stopPropagation()
  if (field.value.trim() === '') return true
  const current = Number(field.value)
  if (!Number.isFinite(current)) return true
  const next = steppedValue(current, delta < 0 ? 1 : -1, {
    step: numberAttribute(field, 'step'),
    min: numberAttribute(field, 'min'),
    max: numberAttribute(field, 'max')
  })
  if (next === current) return true
  field.value = String(next)
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}
