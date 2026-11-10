import { COMPONENT_SCHEMA_VERSION } from './component'
import { DIAGRAM_SCHEMA_VERSION } from './diagram'
import { DEFAULT_COMPONENT_STROKE, DEFAULT_END_LABEL_SIZE } from './profile'
import { PROJECT_SCHEMA_VERSION } from './project'
import { DEFAULT_AUTOSAVE_SECONDS, DEFAULT_EXPORT, SETTINGS_SCHEMA_VERSION } from './settings'

/** Erreur de lecture d'un fichier : message pour l'utilisateur, détails ligne par ligne. */
export class FileFormatError extends Error {
  readonly issues: readonly string[]

  constructor(message: string, issues: readonly string[] = []) {
    super(message)
    this.name = 'FileFormatError'
    this.issues = issues
  }
}

export type RawRecord = Record<string, unknown>
/** Transforme un document de la version n vers n + 1 ; schemaVersion est mis à jour ensuite. */
export type Migration = (raw: RawRecord) => RawRecord

export interface MigrationTable {
  current: number
  /** steps[n] migre de n vers n + 1. */
  steps: Readonly<Record<number, Migration>>
}

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Complète un profil de style brut avec les champs apparus depuis : trait des composants, police
 * des étiquettes d'extrémité (même famille que les repères). Sert aux migrations et aux profils
 * nommés enregistrés sur disque.
 */
export function completeProfile(raw: unknown): RawRecord {
  const profile = isRecord(raw) ? raw : {}
  const labelFont = isRecord(profile['labelFont']) ? profile['labelFont'] : {}
  const family = typeof labelFont['family'] === 'string' ? labelFont['family'] : 'Segoe UI'
  return {
    componentStroke: DEFAULT_COMPONENT_STROKE,
    endLabelFont: { family, size: DEFAULT_END_LABEL_SIZE },
    ...profile
  }
}

/**
 * Amène un document JSON brut à la version courante, étape par étape.
 * Un fichier plus récent que l'application est refusé plutôt que deviné.
 */
export function migrateRaw(raw: unknown, table: MigrationTable, what: string): RawRecord {
  if (!isRecord(raw)) {
    throw new FileFormatError(`${what} : un objet JSON est attendu`)
  }
  let data = raw
  const version = data['schemaVersion']
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new FileFormatError(`${what} : schemaVersion manquant ou invalide`)
  }
  if (version > table.current) {
    throw new FileFormatError(
      `${what} : version ${version} plus récente que celle gérée (${table.current}) ; mets l'application à jour`
    )
  }
  for (let v = version; v < table.current; v++) {
    const step = table.steps[v]
    if (step === undefined) {
      throw new FileFormatError(`${what} : aucune migration de la version ${v} vers ${v + 1}`)
    }
    data = { ...step(data), schemaVersion: v + 1 }
  }
  return data
}

// Composant v1 → v2 : épaisseur absolue (cellules) devenue multiplicateur du trait de base,
// flèches sur lignes et polylignes, textes variables, préfixe de repère retiré.

function migratePrimitiveV1(raw: unknown): unknown {
  if (!isRecord(raw)) return raw
  const result: RawRecord = { ...raw }
  const style = raw['style']
  if (isRecord(style)) {
    const { strokeWidth, ...rest } = style
    const width = typeof strokeWidth === 'number' ? strokeWidth : DEFAULT_COMPONENT_STROKE
    result['style'] = {
      ...rest,
      weight: Math.round((width / DEFAULT_COMPONENT_STROKE) * 100) / 100
    }
  }
  if (raw['kind'] === 'line' || raw['kind'] === 'polyline') {
    result['arrows'] = { start: false, end: false }
  }
  if (raw['kind'] === 'text') {
    result['variable'] = false
    result['defaultValue'] = ''
  }
  return result
}

function migrateComponentV1(raw: RawRecord): RawRecord {
  const result: RawRecord = { ...raw }
  delete result['labelPrefix']
  const visual = raw['visual']
  if (isRecord(visual) && visual['kind'] === 'drawing' && Array.isArray(visual['primitives'])) {
    result['visual'] = { ...visual, primitives: visual['primitives'].map(migratePrimitiveV1) }
  }
  return result
}

// Composant v2 → v3 : unité des textes variables ; v3 → v4 : graisse des textes.

function withTextDefaults(raw: RawRecord, defaults: RawRecord): RawRecord {
  const visual = raw['visual']
  if (!isRecord(visual) || visual['kind'] !== 'drawing' || !Array.isArray(visual['primitives'])) {
    return raw
  }
  return {
    ...raw,
    visual: {
      ...visual,
      primitives: visual['primitives'].map((primitive) =>
        isRecord(primitive) && primitive['kind'] === 'text'
          ? { ...defaults, ...primitive }
          : primitive
      )
    }
  }
}

const migrateComponentV2: Migration = (raw) => withTextDefaults(raw, { unit: '' })
const migrateComponentV3: Migration = (raw) => withTextDefaults(raw, { bold: false })

// Composant v4 → v5 : flèche au milieu des lignes et polylignes.

function migrateComponentV4(raw: RawRecord): RawRecord {
  const visual = raw['visual']
  if (!isRecord(visual) || visual['kind'] !== 'drawing' || !Array.isArray(visual['primitives'])) {
    return raw
  }
  return {
    ...raw,
    visual: {
      ...visual,
      primitives: visual['primitives'].map((primitive) =>
        isRecord(primitive) && isRecord(primitive['arrows'])
          ? { ...primitive, arrows: { middle: false, ...primitive['arrows'] } }
          : primitive
      )
    }
  }
}

// Composant v5 → v6 : le texte occupe une boîte, déduite de son ancre, de sa hauteur et de sa longueur.

function migrateTextV5(raw: unknown): unknown {
  if (!isRecord(raw) || raw['kind'] !== 'text') return raw
  const size = typeof raw['size'] === 'number' ? raw['size'] : 0.5
  const text = typeof raw['text'] === 'string' ? raw['text'] : ''
  const fallback = typeof raw['defaultValue'] === 'string' ? raw['defaultValue'] : ''
  const length = Math.max(1, text.length, raw['variable'] === true ? fallback.length : 0)
  const h = Math.max(1, Math.round(size * 4))
  const w = Math.max(1, Math.ceil(length * 0.6 * size * 4))
  const x = typeof raw['x'] === 'number' ? raw['x'] : 0
  const y = typeof raw['y'] === 'number' ? raw['y'] : 0
  const left =
    raw['anchor'] === 'start' ? x : raw['anchor'] === 'end' ? x - w : x - Math.round(w / 2)
  return { ...raw, x: left, y: y - Math.round(h / 2), w, h }
}

function migrateComponentV5(raw: RawRecord): RawRecord {
  const visual = raw['visual']
  if (!isRecord(visual) || visual['kind'] !== 'drawing' || !Array.isArray(visual['primitives'])) {
    return raw
  }
  return { ...raw, visual: { ...visual, primitives: visual['primitives'].map(migrateTextV5) } }
}

// Composant v7 → v8 : l'orientation des textes sur le montage se règle texte par texte
// (`followsRotation`), héritée du réglage global `textFollowsTransform`, qui disparaît.

function migrateComponentV7(raw: RawRecord): RawRecord {
  const follows = raw['textFollowsTransform'] === true
  const rest = { ...raw }
  delete rest['textFollowsTransform']
  const visual = rest['visual']
  if (!isRecord(visual) || visual['kind'] !== 'drawing' || !Array.isArray(visual['primitives'])) {
    return rest
  }
  return {
    ...rest,
    visual: {
      ...visual,
      primitives: visual['primitives'].map((primitive) =>
        isRecord(primitive) && primitive['kind'] === 'text'
          ? { ...primitive, followsRotation: follows }
          : primitive
      )
    }
  }
}

// Composant v9 → v10 : plus de chasse fixe sur les textes.

function migrateComponentV9(raw: RawRecord): RawRecord {
  const visual = raw['visual']
  if (!isRecord(visual) || visual['kind'] !== 'drawing' || !Array.isArray(visual['primitives'])) {
    return raw
  }
  return {
    ...raw,
    visual: {
      ...visual,
      primitives: visual['primitives'].map((primitive) => {
        if (!isRecord(primitive) || primitive['kind'] !== 'text') return primitive
        const rest = { ...primitive }
        delete rest['mono']
        return rest
      })
    }
  }
}

/** Complète le style de chaque forme (hors textes) avec des valeurs par défaut. */
function withStyleDefaults(raw: RawRecord, defaults: RawRecord): RawRecord {
  const visual = raw['visual']
  if (!isRecord(visual) || visual['kind'] !== 'drawing' || !Array.isArray(visual['primitives'])) {
    return raw
  }
  return {
    ...raw,
    visual: {
      ...visual,
      primitives: visual['primitives'].map((primitive) =>
        isRecord(primitive) && isRecord(primitive['style'])
          ? { ...primitive, style: { ...defaults, ...primitive['style'] } }
          : primitive
      )
    }
  }
}

// Composant v12 → v13 : arrondi des angles des polylignes et des polygones, nul par défaut.

function migrateComponentV12(raw: RawRecord): RawRecord {
  const visual = raw['visual']
  if (!isRecord(visual) || visual['kind'] !== 'drawing' || !Array.isArray(visual['primitives'])) {
    return raw
  }
  return {
    ...raw,
    visual: {
      ...visual,
      primitives: visual['primitives'].map((primitive) =>
        isRecord(primitive) && primitive['kind'] === 'polyline'
          ? { radius: 0, ...primitive }
          : primitive
      )
    }
  }
}

export const componentMigrations: MigrationTable = {
  current: COMPONENT_SCHEMA_VERSION,
  steps: {
    1: migrateComponentV1,
    2: migrateComponentV2,
    3: migrateComponentV3,
    4: migrateComponentV4,
    5: migrateComponentV5,
    // v6 → v7 : textes droits sur le montage par défaut.
    6: (raw) => ({ textFollowsTransform: false, ...raw }),
    7: migrateComponentV7,
    // v8 → v9 : italique, souligné, barré et chasse fixe sur les textes, désactivés.
    8: (raw) =>
      withTextDefaults(raw, { italic: false, underline: false, strike: false, mono: false }),
    // v9 → v10 : la chasse fixe disparaît (option retirée le jour même).
    9: migrateComponentV9,
    // v10 → v11 : opacité du remplissage, opaque par défaut.
    10: (raw) => withStyleDefaults(raw, { fillOpacity: 1 }),
    // v11 → v12 : forme « point ». Rien à convertir ; la version monte pour qu'une application
    // plus ancienne refuse proprement un fichier qui en contient.
    11: (raw) => raw,
    12: migrateComponentV12,
    // v13 → v14 : textes verticaux, horizontaux par défaut.
    13: (raw) => withTextDefaults(raw, { vertical: false })
  }
}

/** Les définitions embarquées d'un projet suivent les migrations des composants. */
function migrateEmbeddedDefs(raw: RawRecord): RawRecord {
  const defs = isRecord(raw['embeddedDefs']) ? raw['embeddedDefs'] : {}
  return {
    ...raw,
    embeddedDefs: Object.fromEntries(
      Object.entries(defs).map(([id, def]) => [
        id,
        migrateRaw(def, componentMigrations, `Composant embarqué ${id}`)
      ])
    )
  }
}

// Projet v1 → v2 : trait des composants dans le profil, champs variables par instance,
// définitions embarquées migrées à leur tour.

function migrateProjectV1(raw: RawRecord): RawRecord {
  const profile = isRecord(raw['profile']) ? raw['profile'] : {}
  const components = Array.isArray(raw['components']) ? raw['components'] : []
  return migrateEmbeddedDefs({
    ...raw,
    profile: { componentStroke: DEFAULT_COMPONENT_STROKE, ...profile },
    components: components.map((instance) =>
      isRecord(instance) ? { fields: {}, ...instance } : instance
    )
  })
}

// Projet v2 → v3 : définitions embarquées migrées (unité des textes variables).

// Projet v3 → v4 : étiquettes d'extrémité des fils.

function migrateProjectV3(raw: RawRecord): RawRecord {
  const wires = Array.isArray(raw['wires']) ? raw['wires'] : []
  return {
    ...raw,
    wires: wires.map((wire) =>
      isRecord(wire) ? { endLabels: { start: '', end: '' }, ...wire } : wire
    )
  }
}

// Projet v4 → v5 : graisse des étiquettes texte, définitions embarquées migrées (graisse des textes).

function migrateProjectV4(raw: RawRecord): RawRecord {
  const labels = Array.isArray(raw['labels']) ? raw['labels'] : []
  return migrateEmbeddedDefs({
    ...raw,
    labels: labels.map((label) => (isRecord(label) ? { bold: false, ...label } : label))
  })
}

// Projet v8 → v9 : les étiquettes texte occupent une boîte en cellules, déduite de la ligne de base.

function migrateProjectV8(raw: RawRecord): RawRecord {
  const profile = isRecord(raw['profile']) ? raw['profile'] : {}
  const cellPx =
    typeof profile['cellPx'] === 'number' && profile['cellPx'] > 0 ? profile['cellPx'] : 20
  const labels = Array.isArray(raw['labels']) ? raw['labels'] : []
  return {
    ...raw,
    labels: labels.map((label) => {
      if (!isRecord(label)) return label
      const size = typeof label['size'] === 'number' ? label['size'] : 11
      const text = typeof label['text'] === 'string' ? label['text'] : ''
      const fontCells = size / cellPx
      const h = Math.max(1, Math.ceil(fontCells))
      const w = Math.max(1, Math.ceil(Math.max(1, text.length) * 0.6 * fontCells))
      const y = typeof label['y'] === 'number' ? label['y'] : 0
      return { anchor: 'start', w, h, ...label, y: y - h }
    })
  }
}

// Projet v18 → v19 : les étiquettes texte reçoivent les styles des textes de composant
// (italique, souligné, barré, vertical) et une couleur, noire au départ.

function migrateProjectV18(raw: RawRecord): RawRecord {
  const labels = Array.isArray(raw['labels']) ? raw['labels'] : []
  return {
    ...raw,
    labels: labels.map((label) =>
      isRecord(label)
        ? {
            italic: false,
            underline: false,
            strike: false,
            vertical: false,
            color: '#000000',
            ...label
          }
        : label
    )
  }
}

// Paramètres v8 → v9 : les couleurs personnalisées deviennent propres à chaque montage. Celles
// que les paramètres gardaient rejoignent la palette, pour rester disponibles partout.

function migrateSettingsV8(raw: RawRecord): RawRecord {
  const palette = Array.isArray(raw['palette']) ? (raw['palette'] as unknown[]) : []
  const custom = Array.isArray(raw['customColors']) ? (raw['customColors'] as unknown[]) : []
  const known = new Set(
    palette.flatMap((color) =>
      isRecord(color) && typeof color['hex'] === 'string' ? [color['hex'].toLowerCase()] : []
    )
  )
  const added: RawRecord[] = []
  for (const hex of custom) {
    if (typeof hex !== 'string' || known.has(hex.toLowerCase())) continue
    known.add(hex.toLowerCase())
    added.push({ name: hex.toUpperCase(), hex })
  }
  const rest = { ...raw }
  delete rest['customColors']
  return { ...rest, palette: [...palette, ...added] }
}

export const projectMigrations: MigrationTable = {
  current: PROJECT_SCHEMA_VERSION,
  steps: {
    1: migrateProjectV1,
    2: migrateEmbeddedDefs,
    3: migrateProjectV3,
    4: migrateProjectV4,
    // Projet v5 → v6 : définitions embarquées migrées (flèche au milieu).
    5: migrateEmbeddedDefs,
    // Projet v6 → v7 : police des étiquettes d'extrémité dans le profil.
    6: (raw) => ({ ...raw, profile: completeProfile(raw['profile']) }),
    // Projet v7 → v8 : définitions embarquées migrées (boîtes de texte).
    7: migrateEmbeddedDefs,
    8: migrateProjectV8,
    // Projet v9 → v10 : définitions embarquées migrées (textes droits).
    9: migrateEmbeddedDefs,
    // Projet v10 → v11 : définitions embarquées migrées (orientation texte par texte).
    10: migrateEmbeddedDefs,
    // Projet v11 → v12 : définitions embarquées migrées (styles de texte).
    11: migrateEmbeddedDefs,
    // Projet v12 → v13 : définitions embarquées migrées (plus de chasse fixe).
    12: migrateEmbeddedDefs,
    // Projet v13 → v14 : définitions embarquées migrées (opacité du remplissage).
    13: migrateEmbeddedDefs,
    // Projet v14 → v15 : définitions embarquées migrées (forme « point »).
    14: migrateEmbeddedDefs,
    // Projet v15 → v16 : définitions embarquées migrées (angles arrondis).
    15: migrateEmbeddedDefs,
    // Projet v16 → v17 : couleurs de fil propres au montage, aucune au départ.
    16: (raw) => ({ customColors: [], ...raw }),
    // Projet v17 → v18 : définitions embarquées migrées (textes verticaux).
    17: migrateEmbeddedDefs,
    18: migrateProjectV18
  }
}

/** Diagrammes : première version du format, aucune migration encore. */
export const diagramMigrations: MigrationTable = {
  current: DIAGRAM_SCHEMA_VERSION,
  steps: {}
}

// Paramètres v1 → v2 : export et copie de secours ; v2 → v3 : trait des composants du profil ;
// v3 → v4 : thème de l'interface.

export const settingsMigrations: MigrationTable = {
  current: SETTINGS_SCHEMA_VERSION,
  steps: {
    1: (raw) => ({
      ...raw,
      export: { ...DEFAULT_EXPORT },
      autosaveSeconds: DEFAULT_AUTOSAVE_SECONDS
    }),
    2: (raw) => ({
      ...raw,
      defaultProfile: {
        componentStroke: DEFAULT_COMPONENT_STROKE,
        ...(isRecord(raw['defaultProfile']) ? raw['defaultProfile'] : {})
      }
    }),
    3: (raw) => ({ ...raw, theme: 'light' }),
    // v4 → v5 : police des étiquettes d'extrémité du profil par défaut.
    4: (raw) => ({ ...raw, defaultProfile: completeProfile(raw['defaultProfile']) }),
    // v5 → v6 : ouverture automatique du panneau de propriétés.
    5: (raw) => ({ ...raw, autoOpenInspector: true }),
    // v6 → v7 : thème sombre par défaut (le clair avait été imposé à la v4, pas choisi).
    6: (raw) => ({ ...raw, theme: 'dark' }),
    // v7 → v8 : affichage de la bibliothèque, en liste comme avant.
    7: (raw) => ({ ...raw, libraryView: 'list' }),
    8: migrateSettingsV8
  }
}
