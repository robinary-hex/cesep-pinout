import { COMPONENT_SCHEMA_VERSION } from './component'
import { PROJECT_SCHEMA_VERSION } from './project'
import { SETTINGS_SCHEMA_VERSION } from './settings'

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

export const projectMigrations: MigrationTable = { current: PROJECT_SCHEMA_VERSION, steps: {} }
export const componentMigrations: MigrationTable = { current: COMPONENT_SCHEMA_VERSION, steps: {} }
export const settingsMigrations: MigrationTable = { current: SETTINGS_SCHEMA_VERSION, steps: {} }

/**
 * Amène un document JSON brut à la version courante, étape par étape.
 * Un fichier plus récent que l'application est refusé plutôt que deviné.
 */
export function migrateRaw(raw: unknown, table: MigrationTable, what: string): RawRecord {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new FileFormatError(`${what} : un objet JSON est attendu`)
  }
  let data = raw as RawRecord
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
