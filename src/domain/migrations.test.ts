import { describe, expect, it } from 'vitest'
import componentV1 from './fixtures/v1/component-drawing.json?raw'
import projectV1 from './fixtures/v1/project.json?raw'
import settingsV1 from './fixtures/v1/settings.json?raw'
import componentV2 from './fixtures/v2/component-drawing.json?raw'
import projectV2 from './fixtures/v2/project.json?raw'
import componentV3 from './fixtures/v3/component-drawing.json?raw'
import projectV3 from './fixtures/v3/project.json?raw'
import componentV4 from './fixtures/v4/component-drawing.json?raw'
import projectV4 from './fixtures/v4/project.json?raw'
import projectV5 from './fixtures/v5/project.json?raw'
import settingsV3 from './fixtures/v3/settings.json?raw'
import {
  componentMigrations,
  FileFormatError,
  migrateRaw,
  projectMigrations,
  type MigrationTable
} from './migrations'
import { parseComponentDefinition, parseProject, parseSettings } from './serialize'

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

describe('composant v1 → v4', () => {
  it('convertit les épaisseurs en multiplicateurs, ajoute flèches, textes variables et unité, retire le préfixe', () => {
    const def = parseComponentDefinition(componentV1)
    expect(def.schemaVersion).toBe(5)
    expect('labelPrefix' in def).toBe(false)
    if (def.visual.kind !== 'drawing') throw new Error('dessin attendu')
    const [line, rect, , text] = def.visual.primitives
    expect(line).toMatchObject({
      kind: 'line',
      arrows: { start: false, middle: false, end: false }
    })
    expect(line?.kind === 'line' && line.style.weight).toBe(1)
    expect(rect?.kind === 'rect' && rect.style.weight).toBe(1)
    expect(text).toMatchObject({
      kind: 'text',
      variable: false,
      defaultValue: '',
      unit: '',
      bold: false
    })
  })

  it('les épaisseurs non standard deviennent des multiplicateurs proportionnels', () => {
    const raw = JSON.parse(componentV1) as {
      visual: { primitives: { style?: { strokeWidth: number } }[] }
    }
    const first = raw.visual.primitives[0]
    if (!first?.style) throw new Error('style attendu')
    first.style.strokeWidth = 0.25
    const migrated = migrateRaw(raw, componentMigrations, 'Composant')
    const primitives = (migrated['visual'] as { primitives: { style: { weight: number } }[] })
      .primitives
    expect(primitives[0]?.style.weight).toBe(2.5)
  })
})

describe('composant v2 → v4', () => {
  it('ajoute une unité vide aux textes et garde le reste', () => {
    const def = parseComponentDefinition(componentV2)
    expect(def.schemaVersion).toBe(5)
    if (def.visual.kind !== 'drawing') throw new Error('dessin attendu')
    const text = def.visual.primitives[3]
    expect(text).toMatchObject({
      kind: 'text',
      variable: true,
      defaultValue: '10 kΩ',
      unit: '',
      bold: false
    })
    const arrowLine = def.visual.primitives[2]
    expect(arrowLine).toMatchObject({
      kind: 'line',
      arrows: { start: false, middle: false, end: true }
    })
    expect(arrowLine?.kind === 'line' && arrowLine.style.weight).toBe(1.5)
  })
})

describe('projet v1 → v5', () => {
  it('ajoute le trait des composants au profil, les champs aux instances, et migre les définitions', () => {
    const project = parseProject(projectV1)
    expect(project.schemaVersion).toBe(6)
    expect(project.wires[0]?.endLabels).toEqual({ start: '', end: '' })
    expect(project.profile.componentStroke).toBe(0.1)
    expect(project.components.every((instance) => instance.fields !== undefined)).toBe(true)
    for (const def of Object.values(project.embeddedDefs)) {
      expect(def.schemaVersion).toBe(5)
      expect('labelPrefix' in def).toBe(false)
    }
  })
})

describe('projet v2 → v5', () => {
  it('migre les définitions embarquées et garde les valeurs des instances', () => {
    const project = parseProject(projectV2)
    expect(project.schemaVersion).toBe(6)
    expect(project.components[0]?.fields).toEqual({ R: '4,7 kΩ' })
    const def = project.embeddedDefs['resistor']
    expect(def?.schemaVersion).toBe(5)
    if (def?.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(def.visual.primitives[1]).toMatchObject({ kind: 'text', unit: '', bold: false })
    expect(project.wires[0]?.color).toBe('#d62828')
  })
})

describe('projet v3 → v5', () => {
  it('ajoute des étiquettes d’extrémité vides aux fils et garde le style des extrémités', () => {
    const project = parseProject(projectV3)
    expect(project.schemaVersion).toBe(6)
    expect(project.wires[0]).toMatchObject({ freeEnds: 'arrow', endLabels: { start: '', end: '' } })
  })
})

describe('composant v3 → v4', () => {
  it('ajoute une graisse normale aux textes et garde l’unité', () => {
    const def = parseComponentDefinition(componentV3)
    expect(def.schemaVersion).toBe(5)
    if (def.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(def.visual.primitives[1]).toMatchObject({ kind: 'text', unit: 'kΩ', bold: false })
  })
})

describe('projet v4 → v5', () => {
  it('ajoute la graisse aux étiquettes et migre les définitions embarquées', () => {
    const project = parseProject(projectV4)
    expect(project.schemaVersion).toBe(6)
    expect(project.labels[0]).toMatchObject({ text: 'Diviseur', bold: false })
    expect(project.wires[0]).toMatchObject({ freeEnds: 'dotted', endLabels: { end: 'OUT' } })
    const def = project.embeddedDefs['resistor']
    expect(def?.schemaVersion).toBe(5)
    if (def?.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(def.visual.primitives[0]).toMatchObject({ kind: 'text', bold: false })
  })
})

describe('composant v4 → v5', () => {
  it('ajoute la flèche du milieu, absente, et garde les autres', () => {
    const def = parseComponentDefinition(componentV4)
    expect(def.schemaVersion).toBe(5)
    if (def.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(def.visual.primitives[0]).toMatchObject({
      kind: 'line',
      arrows: { start: false, middle: false, end: true }
    })
    expect(def.visual.primitives[1]).toMatchObject({ kind: 'text', bold: true })
  })
})

describe('projet v5 → v6', () => {
  it('migre les définitions embarquées et garde les étiquettes en gras', () => {
    const project = parseProject(projectV5)
    expect(project.schemaVersion).toBe(6)
    expect(project.labels[0]).toMatchObject({ bold: true, size: 16.5 })
    const def = project.embeddedDefs['arrow-line']
    expect(def?.schemaVersion).toBe(5)
    if (def?.visual.kind !== 'drawing') throw new Error('dessin attendu')
    expect(def.visual.primitives[0]).toMatchObject({ arrows: { middle: false, end: true } })
  })
})

describe('paramètres v1 → v4', () => {
  it('ajoute export, copie de secours, trait des composants et thème', () => {
    const settings = parseSettings(settingsV1)
    expect(settings.schemaVersion).toBe(4)
    expect(settings.defaultProfile.componentStroke).toBe(0.1)
    expect(settings.export.scale).toBe(2)
    expect(settings.theme).toBe('light')
  })
})

describe('paramètres v3 → v4', () => {
  it('ajoute le thème clair et garde le reste', () => {
    const settings = parseSettings(settingsV3)
    expect(settings.schemaVersion).toBe(4)
    expect(settings.theme).toBe('light')
    expect(settings.recentFiles).toEqual(['D:/Documents/diviseur.pinout.json'])
    expect(settings.autosaveSeconds).toBe(60)
  })
})
