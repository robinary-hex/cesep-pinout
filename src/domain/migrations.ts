import { COMPONENT_SCHEMA_VERSION } from './component'
import { DEFAULT_COMPONENT_STROKE } from './profile'
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

export const componentMigrations: MigrationTable = {
  current: COMPONENT_SCHEMA_VERSION,
  steps: { 1: migrateComponentV1, 2: migrateComponentV2, 3: migrateComponentV3 }
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

export const projectMigrations: MigrationTable = {
  current: PROJECT_SCHEMA_VERSION,
  steps: {
    1: migrateProjectV1,
    2: migrateEmbeddedDefs,
    3: migrateProjectV3,
    4: migrateProjectV4
  }
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
    3: (raw) => ({ ...raw, theme: 'light' })
  }
}
