/**
 * Groupes : dans les trois éditeurs, des éléments qu'on sélectionne et qu'on déplace d'un bloc.
 * Rien n'est rangé à part : chaque élément groupé porte l'identifiant de son groupe (`group`),
 * et un groupe existe dès que deux éléments au moins portent le même. L'appartenance suit donc
 * l'élément quand il change d'ordre, qu'on le copie ou qu'on annule sa suppression. Un
 * identifiant resté sur un seul élément ne fait pas un groupe.
 */

/** Ce qui peut appartenir à un groupe. */
export interface Groupable {
  group?: string | undefined
}

/** Identifiants des groupes formés par ces éléments : ceux que portent au moins deux d'entre eux. */
export function groupIds(elements: Iterable<Groupable>): string[] {
  const counts = new Map<string, number>()
  for (const element of elements) {
    if (element.group !== undefined) counts.set(element.group, (counts.get(element.group) ?? 0) + 1)
  }
  return [...counts].filter(([, count]) => count >= 2).map(([id]) => id)
}

/**
 * Identifiant libre pour un nouveau groupe : g1, g2… Jamais un identifiant déjà porté, même par un
 * seul élément (il redeviendrait un groupe si on annulait une suppression).
 */
export function nextGroupId(
  elements: Iterable<Groupable>,
  alsoTaken: Iterable<string> = []
): string {
  const taken = new Set(alsoTaken)
  for (const element of elements) if (element.group !== undefined) taken.add(element.group)
  for (let n = 1; ; n++) {
    const candidate = `g${n}`
    if (!taken.has(candidate)) return candidate
  }
}

/** Le même élément, dans ce groupe ou, sans identifiant, dans aucun (la propriété disparaît). */
export function withGroup<T extends Groupable>(element: T, group: string | undefined): T {
  const copy = { ...element }
  if (group === undefined) delete copy.group
  else copy.group = group
  return copy
}

/**
 * Groupes de copies qu'on insère dans un document (coller, dupliquer) : un groupe copié avec au
 * moins deux de ses membres devient un nouveau groupe ; une copie seule de son groupe n'en a
 * plus. Les copies ne rejoignent ainsi jamais le groupe de leurs originaux. Retourne les copies,
 * dans le même ordre.
 */
export function regroupedCopies<T extends Groupable>(
  copies: readonly T[],
  existing: Iterable<Groupable>
): T[] {
  const copied = new Set(groupIds(copies))
  const renamed = new Map<string, string>()
  const fresh: string[] = []
  const present = [...existing]
  return copies.map((copy) => {
    if (copy.group === undefined || !copied.has(copy.group)) return withGroup(copy, undefined)
    let id = renamed.get(copy.group)
    if (id === undefined) {
      id = nextGroupId(present, fresh)
      fresh.push(id)
      renamed.set(copy.group, id)
    }
    return withGroup(copy, id)
  })
}

/** Rectangle droit, dans l'unité de l'éditeur qui le demande (cellules ou pixels). */
export interface OutlineRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Contour d'un groupe : le plus petit rectangle qui entoure ses membres, écarté d'eux de
 * `margin` ; null s'il n'y a rien à entourer.
 */
export function groupOutline(rects: readonly OutlineRect[], margin: number): OutlineRect | null {
  if (rects.length === 0) return null
  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return {
    x: left - margin,
    y: top - margin,
    width: right - left + 2 * margin,
    height: bottom - top + 2 * margin
  }
}
