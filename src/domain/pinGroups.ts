import type { Pin, PinGroup } from './component'

/**
 * Groupes de broches d'un composant : des sections nommées du panneau de propriétés où ranger les
 * broches (décision du 11 novembre 2026). L'ordre des broches du composant reste la seule vérité :
 * elles y sont rangées groupe par groupe, dans l'ordre des groupes, les broches sans groupe à la
 * fin. Le panneau montre donc les broches dans l'ordre même où elles sont numérotées.
 */

/** Une section du panneau : un groupe (ou null pour les broches sans groupe) et ses broches. */
export interface PinSection {
  group: PinGroup | null
  pins: Pin[]
}

/** Rang de la section d'une broche : celui de son groupe s'il existe encore, sinon le dernier. */
function sectionRank(groups: readonly PinGroup[], pin: Pin): number {
  const rank = groups.findIndex((group) => group.id === pin.pinGroup)
  return rank === -1 ? groups.length : rank
}

/** La même broche, rangée dans ce groupe ou, pour null, dans aucun (la propriété disparaît). */
function inGroup(pin: Pin, groupId: string | null): Pin {
  const copy = { ...pin }
  if (groupId === null) delete copy.pinGroup
  else copy.pinGroup = groupId
  return copy
}

/**
 * Broches rangées groupe par groupe, les sans-groupe à la fin ; l'ordre est gardé dans chaque
 * section. Une broche qui désigne un groupe disparu redevient sans groupe.
 */
export function arrangedPins(pins: readonly Pin[], groups: readonly PinGroup[]): Pin[] {
  return pins
    .map((pin) =>
      pin.pinGroup !== undefined && !groups.some((group) => group.id === pin.pinGroup)
        ? inGroup(pin, null)
        : pin
    )
    .map((pin, index) => ({ pin, index, rank: sectionRank(groups, pin) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.pin)
}

/**
 * Sections du panneau, dans l'ordre : une par groupe (même vide, pour y déposer une broche), puis
 * les broches sans groupe s'il y en a, ou s'il n'y a aucun groupe.
 */
export function pinSections(pins: readonly Pin[], groups: readonly PinGroup[]): PinSection[] {
  const sections: PinSection[] = groups.map((group) => ({
    group,
    pins: pins.filter((pin) => pin.pinGroup === group.id)
  }))
  const loose = pins.filter((pin) => sectionRank(groups, pin) === groups.length)
  if (loose.length > 0 || groups.length === 0) sections.push({ group: null, pins: loose })
  return sections
}

/**
 * Range une broche dans un groupe (null : aucun), devant la broche `beforeId` de ce groupe, ou à
 * la fin du groupe. Retourne toutes les broches, rangées.
 */
export function placedPin(
  pins: readonly Pin[],
  groups: readonly PinGroup[],
  pinId: string,
  groupId: string | null,
  beforeId: string | null
): Pin[] {
  const pin = pins.find((candidate) => candidate.id === pinId)
  if (!pin || beforeId === pinId) return arrangedPins(pins, groups)
  const moved = inGroup(pin, groupId)
  const rest = pins.filter((candidate) => candidate.id !== pinId)
  const at = beforeId === null ? -1 : rest.findIndex((candidate) => candidate.id === beforeId)
  const next = at === -1 ? [...rest, moved] : [...rest.slice(0, at), moved, ...rest.slice(at)]
  return arrangedPins(next, groups)
}

/** Identifiant libre pour un nouveau groupe de broches : pg1, pg2… */
export function nextPinGroupId(groups: readonly PinGroup[]): string {
  const taken = new Set(groups.map((group) => group.id))
  for (let n = 1; ; n++) {
    const candidate = `pg${n}`
    if (!taken.has(candidate)) return candidate
  }
}

/** Nom proposé pour un nouveau groupe : « Groupe 1 », « Groupe 2 »…, le premier qui n'est pas pris. */
export function nextPinGroupName(groups: readonly PinGroup[]): string {
  const taken = new Set(groups.map((group) => group.name))
  for (let n = groups.length + 1; ; n++) {
    const candidate = `Groupe ${n}`
    if (!taken.has(candidate)) return candidate
  }
}
