import { describe, expect, it } from 'vitest'
import { FileFormatError, migrateRaw, projectMigrations, type MigrationTable } from './migrations'

describe('migrations', () => {
  it('laisse passer un document à la version courante', () => {
    const raw = { schemaVersion: projectMigrations.current, name: 'x' }
    expect(migrateRaw(raw, projectMigrations, 'Projet')).toEqual(raw)
  })

  it('rejette ce qui n’est pas un objet versionné', () => {
    expect(() => migrateRaw(null, projectMigrations, 'Projet')).toThrow(FileFormatError)
    expect(() => migrateRaw([], projectMigrations, 'Projet')).toThrow(/objet JSON/)
    expect(() => migrateRaw({}, projectMigrations, 'Projet')).toThrow(/schemaVersion/)
    expect(() => migrateRaw({ schemaVersion: 0 }, projectMigrations, 'Projet')).toThrow(
      /schemaVersion/
    )
    expect(() => migrateRaw({ schemaVersion: 1.5 }, projectMigrations, 'Projet')).toThrow(
      /schemaVersion/
    )
  })

  it('rejette une version plus récente que l’application', () => {
    expect(() =>
      migrateRaw({ schemaVersion: projectMigrations.current + 1 }, projectMigrations, 'Projet')
    ).toThrow(/plus récente/)
  })

  it('enchaîne les étapes jusqu’à la version courante', () => {
    const table: MigrationTable = {
      current: 3,
      steps: {
        1: (raw) => ({ ...raw, b: 2 }),
        2: (raw) => ({ ...raw, c: 3 })
      }
    }
    expect(migrateRaw({ schemaVersion: 1, a: 1 }, table, 'Test')).toEqual({
      schemaVersion: 3,
      a: 1,
      b: 2,
      c: 3
    })
    expect(migrateRaw({ schemaVersion: 2, a: 1 }, table, 'Test')).toEqual({
      schemaVersion: 3,
      a: 1,
      c: 3
    })
  })

  it('signale une étape de migration manquante', () => {
    const table: MigrationTable = { current: 2, steps: {} }
    expect(() => migrateRaw({ schemaVersion: 1 }, table, 'Test')).toThrow(/aucune migration/)
  })
})
